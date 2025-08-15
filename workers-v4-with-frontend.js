// 签到兑换码系统 V4 - 包含前端页面

// ==================== HTML 页面 ====================

const indexHTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>每日签到系统</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        .header { background: white; padding: 20px; border-radius: 10px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .card { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .btn { padding: 12px 24px; border: none; border-radius: 6px; cursor: pointer; font-size: 16px; transition: all 0.3s; }
        .btn-primary { background: #4CAF50; color: white; }
        .btn-primary:hover { background: #45a049; }
        .btn-secondary { background: #2196F3; color: white; }
        .btn-secondary:hover { background: #0b7dda; }
        .loading { display: none; text-align: center; padding: 20px; }
        .loading.show { display: block; }
        .error { color: #f44336; margin: 10px 0; }
        .success { color: #4CAF50; margin: 10px 0; }
        #loginSection, #mainSection { display: none; }
        #loginSection.show, #mainSection.show { display: block; }
        .user-info { display: flex; align-items: center; gap: 15px; margin-bottom: 20px; }
        .user-info img { width: 40px; height: 40px; border-radius: 50%; }
        .checkin-btn { width: 200px; height: 200px; border-radius: 50%; font-size: 24px; margin: 30px auto; display: block; }
        .code-display { background: #f0f0f0; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center; }
        .code-display code { font-size: 20px; font-weight: bold; color: #333; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>每日签到系统</h1>
        </div>

        <div id="loginSection" class="card">
            <h2>请选择登录方式</h2>
            <div style="margin-top: 30px; display: flex; gap: 20px; justify-content: center;">
                <button class="btn btn-primary" onclick="loginWithLinuxDo()">Linux Do 账号登录</button>
                <button class="btn btn-secondary" onclick="showAdminLogin()">管理员登录</button>
            </div>
            <div id="adminLoginForm" style="display: none; margin-top: 30px;">
                <h3>管理员登录</h3>
                <input type="text" id="adminUsername" placeholder="用户名" style="width: 100%; padding: 10px; margin: 10px 0;">
                <input type="password" id="adminPassword" placeholder="密码" style="width: 100%; padding: 10px; margin: 10px 0;">
                <button class="btn btn-secondary" onclick="adminLogin()">登录</button>
            </div>
            <div id="loginError" class="error"></div>
        </div>

        <div id="mainSection" class="card">
            <div class="user-info">
                <img id="userAvatar" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%23ddd'/%3E%3C/svg%3E" alt="avatar">
                <div>
                    <div id="userName">加载中...</div>
                    <button class="btn" onclick="logout()" style="background: #f44336; color: white; padding: 5px 10px; font-size: 14px;">退出登录</button>
                </div>
            </div>

            <div id="userContent">
                <button class="btn btn-primary checkin-btn" onclick="checkin()">签到</button>
                <div id="checkinResult"></div>
                <div class="loading">
                    <div>处理中...</div>
                </div>
            </div>

            <div id="adminContent" style="display: none;">
                <h2>管理后台</h2>
                <p>管理员功能开发中...</p>
                <a href="/admin" class="btn btn-secondary">进入管理面板</a>
            </div>
        </div>
    </div>

    <script>
        const API_BASE = window.location.origin;

        async function checkAuth() {
            try {
                const response = await fetch(API_BASE + '/api/auth/me', {
                    credentials: 'include'
                });
                
                if (response.ok) {
                    const data = await response.json();
                    showMainSection(data.user);
                } else {
                    showLoginSection();
                }
            } catch (error) {
                console.error('Auth check failed:', error);
                showLoginSection();
            }
        }

        function showLoginSection() {
            document.getElementById('loginSection').classList.add('show');
            document.getElementById('mainSection').classList.remove('show');
        }

        function showMainSection(user) {
            document.getElementById('loginSection').classList.remove('show');
            document.getElementById('mainSection').classList.add('show');
            
            document.getElementById('userName').textContent = user.username;
            if (user.avatar_url) {
                document.getElementById('userAvatar').src = user.avatar_url;
            }
            
            if (user.is_admin) {
                document.getElementById('userContent').style.display = 'none';
                document.getElementById('adminContent').style.display = 'block';
            } else {
                document.getElementById('userContent').style.display = 'block';
                document.getElementById('adminContent').style.display = 'none';
                checkTodayStatus();
            }
        }

        async function loginWithLinuxDo() {
            try {
                const response = await fetch(API_BASE + '/api/auth/login');
                const data = await response.json();
                window.location.href = data.authUrl;
            } catch (error) {
                document.getElementById('loginError').textContent = '获取登录链接失败';
            }
        }

        function showAdminLogin() {
            document.getElementById('adminLoginForm').style.display = 'block';
        }

        async function adminLogin() {
            const username = document.getElementById('adminUsername').value;
            const password = document.getElementById('adminPassword').value;
            
            try {
                const response = await fetch(API_BASE + '/api/admin/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password }),
                    credentials: 'include'
                });
                
                if (response.ok) {
                    const data = await response.json();
                    showMainSection(data.user);
                } else {
                    const error = await response.json();
                    document.getElementById('loginError').textContent = error.error || '登录失败';
                }
            } catch (error) {
                document.getElementById('loginError').textContent = '登录请求失败';
            }
        }

        async function checkTodayStatus() {
            try {
                const response = await fetch(API_BASE + '/api/checkin/today', {
                    credentials: 'include'
                });
                const data = await response.json();
                
                if (data.checkedIn) {
                    document.querySelector('.checkin-btn').disabled = true;
                    document.querySelector('.checkin-btn').textContent = '今日已签到';
                    if (data.code) {
                        document.getElementById('checkinResult').innerHTML = 
                            '<div class="code-display"><p>今日兑换码：</p><code>' + data.code + '</code></div>';
                    }
                }
            } catch (error) {
                console.error('Check status failed:', error);
            }
        }

        async function checkin() {
            document.querySelector('.loading').classList.add('show');
            document.getElementById('checkinResult').innerHTML = '';
            
            try {
                const response = await fetch(API_BASE + '/api/checkin', {
                    method: 'POST',
                    credentials: 'include'
                });
                const data = await response.json();
                
                if (data.success) {
                    document.querySelector('.checkin-btn').disabled = true;
                    document.querySelector('.checkin-btn').textContent = '签到成功！';
                    document.getElementById('checkinResult').innerHTML = 
                        '<div class="code-display"><p>您的兑换码：</p><code>' + data.code + '</code></div>';
                } else {
                    document.getElementById('checkinResult').innerHTML = 
                        '<div class="error">' + (data.message || '签到失败') + '</div>';
                }
            } catch (error) {
                document.getElementById('checkinResult').innerHTML = 
                    '<div class="error">签到请求失败</div>';
            } finally {
                document.querySelector('.loading').classList.remove('show');
            }
        }

        async function logout() {
            try {
                await fetch(API_BASE + '/api/auth/logout', {
                    method: 'POST',
                    credentials: 'include'
                });
                showLoginSection();
            } catch (error) {
                console.error('Logout failed:', error);
            }
        }

        // OAuth回调处理
        if (window.location.pathname === '/auth/callback') {
            const code = new URLSearchParams(window.location.search).get('code');
            if (code) {
                fetch(API_BASE + '/api/auth/callback?code=' + code, {
                    credentials: 'include'
                }).then(response => {
                    if (response.ok) {
                        window.location.href = '/';
                    } else {
                        window.location.href = '/?error=auth_failed';
                    }
                });
            }
        } else {
            checkAuth();
        }
    </script>
</body>
</html>`;

// ==================== 工具函数 ====================

// 创建会话
async function createSession(db, userId, isAdmin = false) {
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);
  
  const sessionData = {
    id: sessionId,
    user_id: isAdmin ? -1 : userId,
    expires_at: expiresAt.toISOString(),
    is_admin: isAdmin ? 1 : 0
  };
  
  await db.prepare(
    'INSERT INTO sessions (id, user_id, expires_at, is_admin) VALUES (?, ?, ?, ?)'
  ).bind(sessionData.id, sessionData.user_id, sessionData.expires_at, sessionData.is_admin).run();
  
  return sessionId;
}

// 验证会话
async function validateSession(db, sessionId) {
  if (!sessionId) return null;
  
  const session = await db.prepare(`
    SELECT * FROM sessions WHERE id = ? AND expires_at > datetime('now')
  `).bind(sessionId).first();
  
  if (!session) return null;
  
  if (session.is_admin) {
    return {
      ...session,
      user_id: -1,
      username: 'Admin',
      is_admin: true
    };
  }
  
  const result = await db.prepare(`
    SELECT s.*, u.id as user_id, u.linux_do_id, u.username, u.email, u.avatar_url
    FROM sessions s 
    JOIN users u ON s.user_id = u.id 
    WHERE s.id = ? AND s.expires_at > datetime('now')
  `).bind(sessionId).first();
  
  return result;
}

// 验证管理员账号密码
function validateAdminCredentials(username, password, env) {
  const adminUsername = env.ADMIN_USERNAME || '';
  const adminPassword = env.ADMIN_PASSWORD || '';
  
  return username === adminUsername && password === adminPassword;
}

// 从请求中获取会话ID
function getSessionIdFromRequest(request) {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return null;
  
  const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split('=');
    acc[key] = value;
    return acc;
  }, {});
  
  return cookies['session_id'] || null;
}

// 创建会话Cookie
function createSessionCookie(sessionId) {
  const expires = new Date();
  expires.setDate(expires.getDate() + 7);
  
  return `session_id=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires.toUTCString()}; Secure`;
}

// 获取CORS头部
function getCorsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowedOrigin = env.FRONTEND_URL || request.headers.get('Origin');
  
  return {
    'Access-Control-Allow-Origin': allowedOrigin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  };
}

// JSON响应
function jsonResponse(data, status = 200, request, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...getCorsHeaders(request, env)
    }
  });
}

// 解析兑换码文件
function parseRedemptionCodes(content) {
  const codes = content
    .split(/[\n\r,;]+/)
    .map(code => code.trim())
    .filter(code => code.length > 0)
    .filter(code => /^[A-Za-z0-9\-_]+$/.test(code));
  
  const uniqueCodes = [...new Set(codes)];
  
  return {
    codes: uniqueCodes,
    total: codes.length,
    unique: uniqueCodes.length,
    duplicates: codes.length - uniqueCodes.length
  };
}

// ==================== OAuth2 函数 ====================

// 生成OAuth2授权URL
function getAuthUrl(env) {
  const params = new URLSearchParams({
    client_id: env.CLIENT_ID,
    redirect_uri: `${env.FRONTEND_URL}/auth/callback`,
    response_type: 'code',
    scope: 'user'
  });

  return `${env.AUTH_URL}?${params.toString()}`;
}

// 获取访问令牌
async function getAccessToken(code, env) {
  const response = await fetch(env.TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: env.CLIENT_ID,
      client_secret: env.CLIENT_SECRET,
      code: code,
      redirect_uri: `${env.FRONTEND_URL}/auth/callback`,
      grant_type: 'authorization_code'
    })
  });

  if (!response.ok) {
    throw new Error('获取访问令牌失败');
  }

  return await response.json();
}

// 获取用户信息
async function getUserInfo(accessToken, env) {
  const response = await fetch(env.USER_INFO_URL, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error('获取用户信息失败');
  }

  return await response.json();
}

// 创建或更新用户
async function createOrUpdateUser(db, userInfo) {
  const linuxDoId = userInfo.sub || userInfo.id;
  const username = userInfo.preferred_username || userInfo.username;
  const email = userInfo.email || null;
  const avatarUrl = userInfo.picture || userInfo.avatar_url || null;
  
  const existingUser = await db.prepare(
    'SELECT * FROM users WHERE linux_do_id = ?'
  ).bind(linuxDoId).first();

  if (existingUser) {
    await db.prepare(`
      UPDATE users 
      SET username = ?, email = ?, avatar_url = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(username, email, avatarUrl, existingUser.id).run();

    return existingUser;
  } else {
    const result = await db.prepare(`
      INSERT INTO users (linux_do_id, username, email, avatar_url)
      VALUES (?, ?, ?, ?)
    `).bind(linuxDoId, username, email, avatarUrl).run();

    return {
      id: result.meta.last_row_id,
      linux_do_id: linuxDoId,
      username: username,
      email: email,
      avatar_url: avatarUrl
    };
  }
}

// ==================== 路由处理 ====================

// 处理OPTIONS请求
function handleOptions(request, env) {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request, env)
  });
}

// 认证中间件
async function requireAuth(request, env) {
  const sessionId = getSessionIdFromRequest(request);
  
  if (!sessionId) {
    return jsonResponse({ error: '未登录' }, 401, request, env);
  }
  
  const session = await validateSession(env.DB, sessionId);
  
  if (!session) {
    return jsonResponse({ error: '会话已过期，请重新登录' }, 401, request, env);
  }
  
  request.session = session;
  return null;
}

// 管理员权限中间件
async function requireAdmin(request, env) {
  const authError = await requireAuth(request, env);
  if (authError) return authError;
  
  if (!request.session.is_admin) {
    return jsonResponse({ error: '需要管理员权限' }, 403, request, env);
  }
  
  return null;
}

// ==================== 主处理函数 ====================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    
    // 处理OPTIONS请求
    if (method === 'OPTIONS') {
      return handleOptions(request, env);
    }
    
    try {
      // ========== 前端页面路由 ==========
      
      // 返回主页HTML
      if ((path === '/' || path === '/auth/callback') && method === 'GET') {
        return new Response(indexHTML, {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
          }
        });
      }
      
      // ========== 认证路由 ==========
      
      // 获取登录URL
      if (path === '/api/auth/login' && method === 'GET') {
        const authUrl = getAuthUrl(env);
        return jsonResponse({ authUrl }, 200, request, env);
      }
      
      // 管理员登录
      if (path === '/api/admin/login' && method === 'POST') {
        const { username, password } = await request.json();
        
        if (!username || !password) {
          return jsonResponse({ error: '用户名和密码不能为空' }, 400, request, env);
        }
        
        if (!validateAdminCredentials(username, password, env)) {
          return jsonResponse({ error: '用户名或密码错误' }, 401, request, env);
        }
        
        const sessionId = await createSession(env.DB, -1, true);
        
        return new Response(JSON.stringify({ 
          success: true,
          user: {
            id: -1,
            username: 'Admin',
            is_admin: true
          }
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Set-Cookie': createSessionCookie(sessionId),
            ...getCorsHeaders(request, env)
          }
        });
      }
      
      // OAuth2回调
      if (path === '/api/auth/callback' && method === 'GET') {
        const code = url.searchParams.get('code');
        
        if (!code) {
          return jsonResponse({ error: '授权码缺失' }, 400, request, env);
        }
        
        const tokenData = await getAccessToken(code, env);
        const userInfo = await getUserInfo(tokenData.access_token, env);
        const user = await createOrUpdateUser(env.DB, userInfo);
        const sessionId = await createSession(env.DB, user.id, false);
        
        return new Response(JSON.stringify({ 
          success: true,
          user: {
            id: user.id,
            username: user.username,
            avatar_url: user.avatar_url,
            is_admin: false
          }
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Set-Cookie': createSessionCookie(sessionId),
            ...getCorsHeaders(request, env)
          }
        });
      }
      
      // 登出
      if (path === '/api/auth/logout' && method === 'POST') {
        const sessionId = getSessionIdFromRequest(request);
        
        if (sessionId) {
          await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
        }
        
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Set-Cookie': `session_id=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
            ...getCorsHeaders(request, env)
          }
        });
      }
      
      // ========== 需要认证的路由 ==========
      
      const authError = await requireAuth(request, env);
      if (authError) return authError;
      
      // 获取当前用户信息
      if (path === '/api/auth/me' && method === 'GET') {
        const session = request.session;
        return jsonResponse({
          user: {
            id: session.user_id,
            username: session.username,
            email: session.email || null,
            avatar_url: session.avatar_url || null,
            is_admin: session.is_admin || false
          }
        }, 200, request, env);
      }
      
      // ========== 签到路由 ==========
      
      // 执行签到
      if (path === '/api/checkin' && method === 'POST') {
        if (request.session.is_admin) {
          return jsonResponse({ error: '管理员不能签到' }, 403, request, env);
        }
        
        const userId = request.session.user_id;
        const today = new Date().toISOString().split('T')[0];
        
        // 检查今日是否已签到
        const existing = await env.DB.prepare(`
          SELECT c.*, r.code 
          FROM check_ins c
          JOIN redemption_codes r ON c.redemption_code_id = r.id
          WHERE c.user_id = ? AND c.check_in_date = ?
        `).bind(userId, today).first();
        
        if (existing) {
          return jsonResponse({
            success: false,
            message: '今日已签到',
            code: existing.code,
            checkedIn: true
          }, 200, request, env);
        }
        
        // 获取一个未使用的兑换码
        const availableCode = await env.DB.prepare(`
          SELECT id, code FROM redemption_codes 
          WHERE status = 'unused' 
          LIMIT 1
        `).first();
        
        if (!availableCode) {
          return jsonResponse({
            success: false,
            message: '兑换码已发完，请联系管理员补充',
            error: 'no_codes_available'
          }, 200, request, env);
        }
        
        // 开始事务
        await env.DB.batch([
          env.DB.prepare(`
            UPDATE redemption_codes 
            SET status = 'used', used_by = ?, used_at = datetime('now')
            WHERE id = ?
          `).bind(userId, availableCode.id),
          
          env.DB.prepare(`
            INSERT INTO check_ins (user_id, check_in_date, redemption_code_id)
            VALUES (?, ?, ?)
          `).bind(userId, today, availableCode.id)
        ]);
        
        return jsonResponse({
          success: true,
          message: '签到成功！',
          code: availableCode.code
        }, 200, request, env);
      }
      
      // 检查今日签到状态
      if (path === '/api/checkin/today' && method === 'GET') {
        if (request.session.is_admin) {
          return jsonResponse({ 
            checkedIn: false,
            isAdmin: true 
          }, 200, request, env);
        }
        
        const userId = request.session.user_id;
        const today = new Date().toISOString().split('T')[0];
        
        const checkIn = await env.DB.prepare(`
          SELECT c.*, r.code 
          FROM check_ins c
          JOIN redemption_codes r ON c.redemption_code_id = r.id
          WHERE c.user_id = ? AND c.check_in_date = ?
        `).bind(userId, today).first();
        
        return jsonResponse({
          checkedIn: !!checkIn,
          code: checkIn?.code || null
        }, 200, request, env);
      }
      
      // ========== 管理员路由 ==========
      
      // 上传兑换码
      if (path === '/api/admin/codes/upload' && method === 'POST') {
        const adminError = await requireAdmin(request, env);
        if (adminError) return adminError;
        
        const formData = await request.formData();
        const file = formData.get('file');
        
        if (!file) {
          return jsonResponse({ error: '请选择文件' }, 400, request, env);
        }
        
        const content = await file.text();
        const parseResult = parseRedemptionCodes(content);
        
        if (parseResult.codes.length === 0) {
          return jsonResponse({ 
            error: '文件中没有有效的兑换码'
          }, 400, request, env);
        }
        
        const batchId = crypto.randomUUID();
        
        // 检查重复
        const existingCodes = await env.DB.prepare(`
          SELECT code FROM redemption_codes 
          WHERE code IN (${parseResult.codes.map(() => '?').join(',')})
        `).bind(...parseResult.codes).all();
        
        const existingCodeSet = new Set((existingCodes.results || []).map(r => r.code));
        const newCodes = parseResult.codes.filter(code => !existingCodeSet.has(code));
        
        // 批量插入
        if (newCodes.length > 0) {
          const batchSize = 100;
          for (let i = 0; i < newCodes.length; i += batchSize) {
            const batch = newCodes.slice(i, i + batchSize);
            const placeholders = batch.map(() => '(?, ?, ?)').join(',');
            const values = batch.flatMap(code => [code, batchId, -1]);
            
            await env.DB.prepare(`
              INSERT INTO redemption_codes (code, batch_id, uploaded_by)
              VALUES ${placeholders}
            `).bind(...values).run();
          }
        }
        
        return jsonResponse({
          success: true,
          summary: {
            newCodes: newCodes.length,
            existingCodes: existingCodeSet.size
          }
        }, 200, request, env);
      }
      
      // 获取兑换码统计
      if (path === '/api/admin/codes/stats' && method === 'GET') {
        const adminError = await requireAdmin(request, env);
        if (adminError) return adminError;
        
        const stats = await env.DB.prepare(`
          SELECT
            COUNT(*) as total,
            SUM(CASE WHEN status = 'unused' THEN 1 ELSE 0 END) as unused,
            SUM(CASE WHEN status = 'used' THEN 1 ELSE 0 END) as used
          FROM redemption_codes
        `).first();
        
        return jsonResponse({
          stats: {
            total: stats.total || 0,
            unused: stats.unused || 0,
            used: stats.used || 0
          }
        }, 200, request, env);
      }
      
      // 404处理
      return jsonResponse({ error: '未找到请求的资源' }, 404, request, env);
      
    } catch (error) {
      console.error('请求处理失败:', error);
      return jsonResponse({
        error: '服务器内部错误',
        message: error.message
      }, 500, request, env);
    }
  }
};