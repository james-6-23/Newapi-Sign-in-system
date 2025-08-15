/**
 * 每日签到系统 V5 - Cloudflare Workers (包含前端页面)
 * 支持兑换码金额管理、待分配机制、系统赠送、批量分发等功能
 * 
 * 环境变量要求：
 * - OAUTH_CLIENT_ID: Linux Do OAuth2 客户端ID
 * - OAUTH_CLIENT_SECRET: Linux Do OAuth2 客户端密钥
 * - ADMIN_USERNAME: 管理员用户名
 * - ADMIN_PASSWORD: 管理员密码
 * - SESSION_SECRET: 会话密钥
 * 
 * D1数据库绑定：
 * - DB: D1数据库实例
 */

// ============================================
// 工具函数
// ============================================

/**
 * 生成随机字符串
 */
function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * 生成会话ID
 */
function generateSessionId() {
  return `sess_${generateRandomString(32)}`;
}

/**
 * 验证会话
 */
async function validateSession(sessionId, env) {
  if (!sessionId) return null;

  const session = await env.DB.prepare(`
    SELECT s.*, u.* 
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.id = ? AND s.expires_at > datetime('now')
  `).bind(sessionId).first();

  if (!session) return null;

  // 更新会话活动时间
  await env.DB.prepare(`
    UPDATE sessions 
    SET expires_at = datetime('now', '+7 days')
    WHERE id = ?
  `).bind(sessionId).run();

  return session;
}

/**
 * 创建会话
 */
async function createSession(userId, isAdmin = false, env) {
  const sessionId = generateSessionId();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await env.DB.prepare(`
    INSERT INTO sessions (id, user_id, expires_at, is_admin)
    VALUES (?, ?, ?, ?)
  `).bind(sessionId, userId, expiresAt, isAdmin).run();

  return sessionId;
}

/**
 * 获取请求中的会话ID
 */
function getSessionFromRequest(request) {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';').map(c => c.trim());
  const sessionCookie = cookies.find(c => c.startsWith('session='));
  
  if (!sessionCookie) return null;
  return sessionCookie.split('=')[1];
}

/**
 * 创建CORS响应头
 */
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'true',
  };
}

/**
 * 创建JSON响应
 */
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(),
    },
  });
}

/**
 * 创建错误响应
 */
function errorResponse(message, status = 400) {
  return jsonResponse({ success: false, error: message }, status);
}

/**
 * 验证管理员权限
 */
async function requireAdmin(request, env) {
  const sessionId = getSessionFromRequest(request);
  const session = await validateSession(sessionId, env);
  
  if (!session || !session.is_admin) {
    return null;
  }
  
  return session;
}

/**
 * 验证用户登录
 */
async function requireAuth(request, env) {
  const sessionId = getSessionFromRequest(request);
  const session = await validateSession(sessionId, env);
  
  if (!session) {
    return null;
  }
  
  return session;
}

// ============================================
// 库存管理函数
// ============================================

/**
 * 检查指定金额的库存
 */
async function checkInventory(amount, env) {
  const result = await env.DB.prepare(`
    SELECT COUNT(*) as available 
    FROM redemption_codes 
    WHERE amount = ? AND is_used = FALSE
  `).bind(amount).first();
  
  return result.available || 0;
}

/**
 * 获取可用的兑换码
 */
async function getAvailableCodes(amount, limit, env) {
  const results = await env.DB.prepare(`
    SELECT id, code 
    FROM redemption_codes 
    WHERE amount = ? AND is_used = FALSE 
    LIMIT ?
  `).bind(amount, limit).all();
  
  return results.results || [];
}

// ============================================
// 签到相关API
// ============================================

/**
 * 处理用户签到
 */
async function handleCheckIn(request, env) {
  const user = await requireAuth(request, env);
  if (!user) {
    return errorResponse('未登录', 401);
  }

  const today = new Date().toISOString().split('T')[0];
  const now = new Date().toISOString();

  // 检查今日是否已签到
  const existing = await env.DB.prepare(`
    SELECT * FROM check_ins 
    WHERE user_id = ? AND check_in_date = ?
  `).bind(user.user_id, today).first();

  if (existing) {
    return jsonResponse({
      success: false,
      message: '今日已签到',
      hasCheckedIn: true,
      status: existing.status,
      redemptionCode: existing.redemption_code
    });
  }

  // 检查是否有可用的兑换码
  const defaultAmount = env.DEFAULT_CODE_AMOUNT || 10;
  const availableInventory = await checkInventory(defaultAmount, env);
  
  if (availableInventory > 0) {
    const codes = await getAvailableCodes(defaultAmount, 1, env);
    if (codes.length > 0) {
      const code = codes[0];
      
      // 有库存，正常分配
      await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO check_ins (user_id, check_in_date, check_in_time, redemption_code, status)
          VALUES (?, ?, ?, ?, 'completed')
        `).bind(user.user_id, today, now, code.code),
        
        env.DB.prepare(`
          UPDATE redemption_codes 
          SET 
            is_used = TRUE,
            used_by = ?,
            used_at = ?,
            distribution_type = 'checkin',
            distribution_time = ?
          WHERE id = ?
        `).bind(user.user_id, now, now, code.id)
      ]);

      return jsonResponse({
        success: true,
        message: '签到成功',
        redemptionCode: code.code,
        amount: defaultAmount,
        status: 'completed'
      });
    }
  }

  // 库存不足，创建待分配记录
  await env.DB.prepare(`
    INSERT INTO check_ins (user_id, check_in_date, check_in_time, status)
    VALUES (?, ?, ?, 'pending_distribution')
  `).bind(user.user_id, today, now).run();

  return jsonResponse({
    success: true,
    message: '签到成功，兑换码待管理员分配',
    status: 'pending_distribution',
    redemptionCode: null
  });
}

/**
 * 获取签到记录
 */
async function getCheckInRecords(request, env) {
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = (page - 1) * limit;

  const user = await requireAuth(request, env);
  if (!user) {
    return errorResponse('未登录', 401);
  }

  const query = `
    SELECT 
      c.*,
      r.amount
    FROM check_ins c
    LEFT JOIN redemption_codes r ON c.redemption_code = r.code
    WHERE c.user_id = ?
    ORDER BY c.check_in_time DESC
    LIMIT ? OFFSET ?
  `;
  
  const countQuery = `SELECT COUNT(*) as total FROM check_ins WHERE user_id = ?`;

  const records = await env.DB.prepare(query).bind(user.user_id, limit, offset).all();
  const count = await env.DB.prepare(countQuery).bind(user.user_id).first();

  const totalPages = Math.ceil(count.total / limit);

  return jsonResponse({
    success: true,
    records: records.results || [],
    pagination: {
      page,
      limit,
      total: count.total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    }
  });
}

// ============================================
// 认证相关API
// ============================================

/**
 * 处理OAuth回调
 */
async function handleOAuthCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return errorResponse('缺少授权码', 400);
  }

  // 交换访问令牌
  const tokenResponse = await fetch('https://linux.do/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      client_id: env.OAUTH_CLIENT_ID,
      client_secret: env.OAUTH_CLIENT_SECRET,
      redirect_uri: `${new URL(request.url).origin}/oauth/linuxdo`,
    }),
  });

  if (!tokenResponse.ok) {
    return errorResponse('获取访问令牌失败', 400);
  }

  const tokenData = await tokenResponse.json();

  // 获取用户信息
  const userResponse = await fetch('https://linux.do/api/user', {
    headers: {
      'Authorization': `Bearer ${tokenData.access_token}`,
    },
  });

  if (!userResponse.ok) {
    return errorResponse('获取用户信息失败', 400);
  }

  const userData = await userResponse.json();

  // 创建或更新用户
  let user = await env.DB.prepare(`
    SELECT * FROM users WHERE linux_do_id = ?
  `).bind(userData.id).first();

  if (!user) {
    // 创建新用户
    await env.DB.prepare(`
      INSERT INTO users (linux_do_id, username, email, avatar_url)
      VALUES (?, ?, ?, ?)
    `).bind(
      userData.id,
      userData.username,
      userData.email,
      userData.avatar_url
    ).run();

    user = await env.DB.prepare(`
      SELECT * FROM users WHERE linux_do_id = ?
    `).bind(userData.id).first();
  } else {
    // 更新用户信息
    await env.DB.prepare(`
      UPDATE users
      SET username = ?, email = ?, avatar_url = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      userData.username,
      userData.email,
      userData.avatar_url,
      new Date().toISOString(),
      user.id
    ).run();
  }

  // 创建会话
  const sessionId = await createSession(user.id, false, env);

  // 设置Cookie并重定向
  const response = new Response(null, {
    status: 302,
    headers: {
      'Location': new URL(request.url).origin,
      'Set-Cookie': `session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`,
    },
  });

  return response;
}

/**
 * 管理员登录
 */
async function adminLogin(request, env) {
  const { username, password } = await request.json();

  if (!username || !password) {
    return errorResponse('请输入用户名和密码', 400);
  }

  // 验证管理员凭据
  if (username !== env.ADMIN_USERNAME || password !== env.ADMIN_PASSWORD) {
    return errorResponse('用户名或密码错误', 401);
  }

  // 创建管理员会话（使用特殊的用户ID 0）
  const sessionId = await createSession(0, true, env);

  // 返回成功响应，设置Cookie
  return new Response(JSON.stringify({
    success: true,
    message: '登录成功',
    isAdmin: true
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': `session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`,
      ...corsHeaders(),
    },
  });
}

/**
 * 退出登录
 */
async function logout(request, env) {
  const sessionId = getSessionFromRequest(request);
  
  if (sessionId) {
    await env.DB.prepare(`
      DELETE FROM sessions WHERE id = ?
    `).bind(sessionId).run();
  }

  return new Response(JSON.stringify({
    success: true,
    message: '已退出登录'
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': 'session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
      ...corsHeaders(),
    },
  });
}

/**
 * 获取用户信息
 */
async function getUserInfo(request, env) {
  const user = await requireAuth(request, env);
  if (!user) {
    return errorResponse('未登录', 401);
  }

  return jsonResponse({
    success: true,
    user: {
      id: user.user_id,
      username: user.username,
      email: user.email,
      avatar_url: user.avatar_url,
      linux_do_id: user.linux_do_id,
      is_admin: user.is_admin || false
    }
  });
}

// ============================================
// 前端HTML页面
// ============================================

const INDEX_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>每日签到系统 V5</title>
    <style>
        :root {
            --primary-color: #3b82f6;
            --primary-hover: #2563eb;
            --success-color: #10b981;
            --error-color: #ef4444;
            --warning-color: #f59e0b;
            --text-primary: #1f2937;
            --text-secondary: #6b7280;
            --bg-color: #f9fafb;
            --card-bg: #ffffff;
            --border-color: #e5e7eb;
            --radius-sm: 0.375rem;
            --radius-md: 0.5rem;
            --radius-lg: 0.75rem;
            --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
            --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
        }
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background-color: var(--bg-color);
            color: var(--text-primary);
            line-height: 1.6;
        }
        
        .container {
            min-height: 100vh;
            display: flex;
            flex-direction: column;
        }
        
        .header {
            background: var(--card-bg);
            border-bottom: 1px solid var(--border-color);
            padding: 1rem 0;
        }
        
        .header-content {
            max-width: 1200px;
            margin: 0 auto;
            padding: 0 2rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .logo {
            font-size: 1.5rem;
            font-weight: bold;
            color: var(--primary-color);
        }
        
        .nav {
            display: flex;
            gap: 2rem;
        }
        
        .nav a {
            color: var(--text-secondary);
            text-decoration: none;
            padding: 0.5rem 0;
            border-bottom: 2px solid transparent;
            transition: all 0.2s;
        }
        
        .nav a:hover,
        .nav a.active {
            color: var(--primary-color);
            border-bottom-color: var(--primary-color);
        }
        
        .user-info {
            display: flex;
            align-items: center;
            gap: 1rem;
        }
        
        .login-btn {
            background: var(--primary-color);
            color: white;
            border: none;
            padding: 0.5rem 1rem;
            border-radius: var(--radius-md);
            cursor: pointer;
            font-weight: 500;
            transition: all 0.2s;
        }
        
        .login-btn:hover {
            background: var(--primary-hover);
        }
        
        .main-content {
            flex: 1;
            max-width: 1200px;
            margin: 0 auto;
            padding: 2rem;
            width: 100%;
        }
        
        .checkin-section {
            margin-bottom: 3rem;
        }
        
        .checkin-card {
            background: var(--card-bg);
            border-radius: var(--radius-lg);
            padding: 2rem;
            text-align: center;
            box-shadow: var(--shadow-md);
        }
        
        .checkin-btn {
            background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-hover) 100%);
            color: white;
            border: none;
            padding: 1.5rem 3rem;
            border-radius: var(--radius-lg);
            font-size: 1.25rem;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.3s;
            display: flex;
            align-items: center;
            gap: 1rem;
            margin: 0 auto 1rem;
        }
        
        .checkin-btn:hover {
            transform: translateY(-2px);
            box-shadow: var(--shadow-lg);
        }
        
        .checkin-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
        }
        
        .checkin-status {
            font-size: 1.1rem;
            margin-bottom: 2rem;
        }
        
        .checkin-status.completed {
            color: var(--success-color);
        }
        
        .checkin-status.pending {
            color: var(--warning-color);
        }
        
        .pending-notice {
            background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
            color: white;
            padding: 1rem;
            border-radius: var(--radius-md);
            margin: 1rem 0;
        }
        
        .notice-content {
            display: flex;
            align-items: center;
            gap: 1rem;
        }
        
        .notice-icon {
            font-size: 2rem;
        }
        
        .stats-container {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 1rem;
            margin-top: 2rem;
        }
        
        .stat-item {
            text-align: center;
            padding: 1rem;
            background: var(--bg-color);
            border-radius: var(--radius-md);
        }
        
        .stat-value {
            font-size: 1.5rem;
            font-weight: bold;
            color: var(--primary-color);
        }
        
        .stat-label {
            color: var(--text-secondary);
            font-size: 0.875rem;
            margin-top: 0.25rem;
        }
        
        .login-prompt {
            text-align: center;
            padding: 4rem 2rem;
        }
        
        .prompt-card {
            background: var(--card-bg);
            border-radius: var(--radius-lg);
            padding: 3rem;
            box-shadow: var(--shadow-md);
            max-width: 500px;
            margin: 0 auto;
        }
        
        .login-btn-large {
            background: var(--primary-color);
            color: white;
            border: none;
            padding: 1rem 2rem;
            border-radius: var(--radius-lg);
            font-size: 1.1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            margin: 2rem auto 0;
        }
        
        .login-btn-large:hover {
            background: var(--primary-hover);
            transform: translateY(-1px);
        }
        
        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            z-index: 1000;
            align-items: center;
            justify-content: center;
        }
        
        .modal-content {
            background: var(--card-bg);
            border-radius: var(--radius-lg);
            padding: 2rem;
            max-width: 500px;
            width: 90%;
            text-align: center;
        }
        
        .code-display {
            display: flex;
            gap: 0.5rem;
            margin: 1rem 0;
        }
        
        .code-display input {
            flex: 1;
            padding: 0.75rem;
            border: 1px solid var(--border-color);
            border-radius: var(--radius-md);
            font-family: monospace;
            font-size: 1.1rem;
        }
        
        .copy-btn {
            background: var(--success-color);
            color: white;
            border: none;
            padding: 0.75rem 1rem;
            border-radius: var(--radius-md);
            cursor: pointer;
            font-weight: 500;
        }
        
        .modal-actions {
            display: flex;
            gap: 1rem;
            margin-top: 1rem;
        }
        
        .btn-primary {
            flex: 1;
            padding: 0.75rem 1.5rem;
            background: var(--primary-color);
            color: white;
            border: none;
            border-radius: var(--radius-md);
            cursor: pointer;
            font-weight: 500;
        }
        
        .close-btn {
            flex: 1;
            padding: 0.75rem 1.5rem;
            background: var(--bg-color);
            color: var(--text-primary);
            border: 1px solid var(--border-color);
            border-radius: var(--radius-md);
            cursor: pointer;
        }
        
        .loading {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(255, 255, 255, 0.8);
            z-index: 2000;
            align-items: center;
            justify-content: center;
        }
        
        .spinner {
            width: 40px;
            height: 40px;
            border: 4px solid var(--border-color);
            border-top: 4px solid var(--primary-color);
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        .toast {
            position: fixed;
            top: 2rem;
            right: 2rem;
            background: var(--card-bg);
            color: var(--text-primary);
            padding: 1rem 1.5rem;
            border-radius: var(--radius-md);
            box-shadow: var(--shadow-lg);
            z-index: 3000;
            transform: translateX(100%);
            transition: transform 0.3s;
        }
        
        .toast.show {
            transform: translateX(0);
        }
        
        .toast.success {
            border-left: 4px solid var(--success-color);
        }
        
        .toast.error {
            border-left: 4px solid var(--error-color);
        }
        
        .toast.info {
            border-left: 4px solid var(--primary-color);
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- 头部 -->
        <header class="header">
            <div class="header-content">
                <h1 class="logo">每日签到系统 V5</h1>
                <nav class="nav">
                    <a href="/" class="active">首页</a>
                    <a href="#" id="adminLink" style="display: none;">管理后台</a>
                </nav>
                <div class="user-info" id="userInfo">
                    <button class="login-btn" id="loginBtn">使用 Linux Do 登录</button>
                </div>
            </div>
        </header>
        
        <!-- 主内容区 -->
        <main class="main-content">
            <!-- 签到区域 -->
            <section class="checkin-section" id="checkinSection" style="display: none;">
                <div class="checkin-card">
                    <button class="checkin-btn" id="checkinBtn">
                        <span class="icon">📅</span>
                        <span class="text">立即签到</span>
                    </button>
                    <p class="checkin-status" id="checkinStatus"></p>
                    
                    <!-- V5新增：待分配提示 -->
                    <div class="pending-notice" id="pendingNotice" style="display: none;">
                        <div class="notice-content">
                            <span class="notice-icon">⏳</span>
                            <div class="notice-text">
                                <strong>签到成功！</strong>
                                <p>兑换码正在分配中，请等待管理员处理</p>
                            </div>
                        </div>
                    </div>
                    
                    <!-- 签到统计 -->
                    <div class="stats-container" id="statsContainer">
                        <div class="stat-item">
                            <span class="stat-label">总签到天数</span>
                            <span class="stat-value" id="totalDays">0</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">连续签到</span>
                            <span class="stat-value" id="consecutiveDays">0</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">获得兑换码</span>
                            <span class="stat-value" id="totalCodes">0</span>
                        </div>
                    </div>
                </div>
            </section>
            
            <!-- 未登录提示 -->
            <section class="login-prompt" id="loginPrompt">
                <div class="prompt-card">
                    <h2>欢迎使用每日签到系统 V5</h2>
                    <p>新版本支持兑换码金额管理、系统赠送等功能</p>
                    <button class="login-btn-large" id="loginBtnLarge">
                        <span class="icon">🔐</span>
                        <span>使用 Linux Do 登录</span>
                    </button>
                </div>
            </section>
        </main>
        
        <!-- V5增强：兑换码弹窗 -->
        <div class="modal" id="codeModal">
            <div class="modal-content">
                <h3>签到成功！</h3>
                <p>您获得了兑换码：</p>
                <div class="code-display">
                    <input type="text" id="codeInput" readonly>
                    <button class="copy-btn" id="copyBtn">复制</button>
                </div>
                <div class="code-amount" id="codeAmount" style="display: none;">
                    <span class="amount-label">金额：</span>
                    <span class="amount-value" id="amountValue">¥0</span>
                </div>
                <div class="modal-actions">
                    <button class="close-btn" id="closeModal">关