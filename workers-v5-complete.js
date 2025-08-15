/**
 * 每日签到系统 V5 - Cloudflare Workers (完整版)
 * 包含所有前端页面和后端API
 */

// ============================================
// 工具函数
// ============================================

function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateSessionId() {
  return `sess_${generateRandomString(32)}`;
}

async function validateSession(sessionId, env) {
  if (!sessionId) return null;

  const session = await env.DB.prepare(`
    SELECT s.*, u.* 
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.id = ? AND s.expires_at > datetime('now')
  `).bind(sessionId).first();

  if (!session) return null;

  await env.DB.prepare(`
    UPDATE sessions 
    SET expires_at = datetime('now', '+7 days')
    WHERE id = ?
  `).bind(sessionId).run();

  return session;
}

async function createSession(userId, isAdmin = false, env) {
  const sessionId = generateSessionId();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await env.DB.prepare(`
    INSERT INTO sessions (id, user_id, expires_at, is_admin)
    VALUES (?, ?, ?, ?)
  `).bind(sessionId, userId, expiresAt, isAdmin).run();

  return sessionId;
}

function getSessionFromRequest(request) {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';').map(c => c.trim());
  const sessionCookie = cookies.find(c => c.startsWith('session='));
  
  if (!sessionCookie) return null;
  return sessionCookie.split('=')[1];
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'true',
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(),
    },
  });
}

function errorResponse(message, status = 400) {
  return jsonResponse({ success: false, error: message }, status);
}

async function requireAuth(request, env) {
  const sessionId = getSessionFromRequest(request);
  const session = await validateSession(sessionId, env);
  
  if (!session) {
    return null;
  }
  
  return session;
}

async function requireAdmin(request, env) {
  const sessionId = getSessionFromRequest(request);
  const session = await validateSession(sessionId, env);
  
  if (!session || !session.is_admin) {
    return null;
  }
  
  return session;
}

// ============================================
// 签到功能
// ============================================

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
  const availableCodes = await env.DB.prepare(`
    SELECT id, code 
    FROM redemption_codes 
    WHERE amount = ? AND is_used = FALSE 
    LIMIT 1
  `).bind(defaultAmount).all();
  
  if (availableCodes.results && availableCodes.results.length > 0) {
    const code = availableCodes.results[0];
    
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
  } else {
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
}

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
// 兑换码管理API
// ============================================

async function uploadCodes(request, env) {
  const admin = await requireAdmin(request, env);
  if (!admin) {
    return errorResponse('需要管理员权限', 403);
  }

  const formData = await request.formData();
  const file = formData.get('file');
  const amount = parseFloat(formData.get('amount') || '0');

  if (!file) {
    return errorResponse('请选择文件', 400);
  }

  if (amount <= 0) {
    return errorResponse('请设置有效的金额', 400);
  }

  const content = await file.text();
  const lines = content.split(/[\r\n]+/).filter(line => line.trim());
  
  // 解析兑换码
  const codes = [];
  for (const line of lines) {
    const lineCodes = line.split(/[,;，；\s]+/)
      .map(code => code.trim())
      .filter(code => /^[A-Za-z0-9_-]+$/.test(code));
    codes.push(...lineCodes);
  }

  // 去重
  const uniqueCodes = [...new Set(codes)];
  
  if (uniqueCodes.length === 0) {
    return errorResponse('文件中没有有效的兑换码', 400);
  }

  // 检查已存在的兑换码
  const existingCodes = await env.DB.prepare(`
    SELECT code FROM redemption_codes 
    WHERE code IN (${uniqueCodes.map(() => '?').join(',')})
  `).bind(...uniqueCodes).all();
  
  const existingSet = new Set(existingCodes.results?.map(r => r.code) || []);
  const newCodes = uniqueCodes.filter(code => !existingSet.has(code));

  // 创建批次记录
  const batchResult = await env.DB.prepare(`
    INSERT INTO upload_batches (filename, amount, total_codes, valid_codes, duplicate_codes)
    VALUES (?, ?, ?, ?, ?)
  `).bind(
    file.name,
    amount,
    codes.length,
    newCodes.length,
    existingSet.size
  ).run();

  const batchId = batchResult.meta.last_row_id;

  // 批量插入新兑换码
  if (newCodes.length > 0) {
    const insertStatements = newCodes.map(code => 
      env.DB.prepare(`
        INSERT INTO redemption_codes (code, amount, batch_id)
        VALUES (?, ?, ?)
      `).bind(code, amount, batchId)
    );

    await env.DB.batch(insertStatements);
  }

  return jsonResponse({
    success: true,
    summary: {
      filename: file.name,
      amount: amount,
      totalInFile: codes.length,
      uniqueInFile: uniqueCodes.length,
      newCodes: newCodes.length,
      existingCodes: existingSet.size
    }
  });
}

async function listCodes(request, env) {
  const admin = await requireAdmin(request, env);
  if (!admin) {
    return errorResponse('需要管理员权限', 403);
  }

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const amount = url.searchParams.get('amount');
  const status = url.searchParams.get('status');
  const offset = (page - 1) * limit;

  let whereConditions = [];
  let bindParams = [];

  if (amount) {
    whereConditions.push('r.amount = ?');
    bindParams.push(parseFloat(amount));
  }

  if (status === 'used') {
    whereConditions.push('r.is_used = TRUE');
  } else if (status === 'unused') {
    whereConditions.push('r.is_used = FALSE');
  }

  const whereClause = whereConditions.length > 0 
    ? `WHERE ${whereConditions.join(' AND ')}` 
    : '';

  const query = `
    SELECT 
      r.*,
      u.username,
      u.linux_do_id
    FROM redemption_codes r
    LEFT JOIN users u ON r.used_by = u.id
    ${whereClause}
    ORDER BY r.created_at DESC
    LIMIT ? OFFSET ?
  `;

  const countQuery = `
    SELECT COUNT(*) as total 
    FROM redemption_codes r
    ${whereClause}
  `;

  bindParams.push(limit, offset);

  const codes = await env.DB.prepare(query).bind(...bindParams).all();
  const count = await env.DB.prepare(countQuery)
    .bind(...bindParams.slice(0, -2))
    .first();

  const totalPages = Math.ceil(count.total / limit);

  return jsonResponse({
    success: true,
    codes: codes.results || [],
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

async function getInventory(request, env) {
  const admin = await requireAdmin(request, env);
  if (!admin) {
    return errorResponse('需要管理员权限', 403);
  }

  const stats = await env.DB.prepare(`
    SELECT 
      amount,
      COUNT(*) as total_count,
      SUM(CASE WHEN is_used = FALSE THEN 1 ELSE 0 END) as available_count,
      SUM(CASE WHEN is_used = TRUE THEN 1 ELSE 0 END) as used_count
    FROM redemption_codes
    GROUP BY amount
    ORDER BY amount ASC
  `).all();

  return jsonResponse({
    success: true,
    inventory: stats.results || []
  });
}

async function getCodeStats(request, env) {
  const admin = await requireAdmin(request, env);
  if (!admin) {
    return errorResponse('需要管理员权限', 403);
  }

  // 获取统计信息
  const stats = await env.DB.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN is_used = FALSE THEN 1 ELSE 0 END) as unused,
      SUM(CASE WHEN is_used = TRUE THEN 1 ELSE 0 END) as used
    FROM redemption_codes
  `).first();

  // 获取最近的上传记录
  const recentUploads = await env.DB.prepare(`
    SELECT * FROM upload_batches
    ORDER BY uploaded_at DESC
    LIMIT 10
  `).all();

  return jsonResponse({
    success: true,
    stats: {
      total: stats.total || 0,
      unused: stats.unused || 0,
      used: stats.used || 0
    },
    recentUploads: recentUploads.results || []
  });
}

async function clearUnusedCodes(request, env) {
  const admin = await requireAdmin(request, env);
  if (!admin) {
    return errorResponse('需要管理员权限', 403);
  }

  const { confirmation } = await request.json();

  if (confirmation !== '一键清空') {
    return errorResponse('请输入"一键清空"以确认操作', 400);
  }

  // 获取统计信息
  const stats = await env.DB.prepare(`
    SELECT COUNT(*) as count 
    FROM redemption_codes 
    WHERE is_used = FALSE
  `).first();

  // 删除未使用的兑换码
  await env.DB.prepare(`
    DELETE FROM redemption_codes 
    WHERE is_used = FALSE
  `).run();

  return jsonResponse({
    success: true,
    message: `成功清空 ${stats.count} 个未使用的兑换码`
  });
}

// ============================================
// 用户兑换码查看
// ============================================

async function getUserCodes(request, env) {
  const user = await requireAuth(request, env);
  if (!user) {
    return errorResponse('未登录', 401);
  }

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '12');
  const offset = (page - 1) * limit;

  const query = `
    SELECT 
      r.*,
      c.check_in_date
    FROM redemption_codes r
    LEFT JOIN check_ins c ON r.code = c.redemption_code
    WHERE r.used_by = ?
    ORDER BY r.used_at DESC
    LIMIT ? OFFSET ?
  `;

  const countQuery = `
    SELECT COUNT(*) as total 
    FROM redemption_codes 
    WHERE used_by = ?
  `;

  const codes = await env.DB.prepare(query).bind(user.user_id, limit, offset).all();
  const count = await env.DB.prepare(countQuery).bind(user.user_id).first();

  const totalPages = Math.ceil(count.total / limit);

  return jsonResponse({
    success: true,
    codes: codes.results || [],
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
// 认证功能
// ============================================

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
  return new Response(null, {
    status: 302,
    headers: {
      'Location': new URL(request.url).origin,
      'Set-Cookie': `session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`,
    },
  });
}

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

// ============================================
// 前端HTML页面生成函数
// ============================================

function generatePageHTML(title, content, activeNav = 'home') {
  const navItems = {
    home: { href: '/', text: '首页' },
    codes: { href: '/codes', text: '我的兑换码' },
    admin: { href: '/admin', text: '管理后台', adminOnly: true }
  };

  const navHTML = Object.entries(navItems).map(([key, item]) => {
    const active = key === activeNav ? 'class="active"' : '';
    const style = item.adminOnly ? 'id="adminLink" style="display: none;"' : '';
    return `<a href="${item.href}" ${active} ${style}>${item.text}</a>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - 每日签到系统 V5</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f9fafb; color: #1f2937; }
        .container { min-height: 100vh; display: flex; flex-direction: column; }
        .header { background: white; border-bottom: 1px solid #e5e7eb; padding: 1rem 0; }
        .header-content { max-width: 1200px; margin: 0 auto; padding: 0 2rem; display: flex; justify-content: space-between; align-items: center; }
        .logo { font-size: 1.5rem; font-weight: bold; color: #3b82f6; text-decoration: none; }
        .nav { display: flex; gap: 2rem; }
        .nav a { color: #6b7280; text-decoration: none; padding: 0.5rem 0; border-bottom: 2px solid transparent; transition: all 0.2s; }
        .nav a:hover, .nav a.active { color: #3b82f6; border-bottom-color: #3b82f6; }
        .user-info { display: flex; align-items: center; gap: 1rem; }
        .login-btn { background: #3b82f6; color: white; border: none; padding: 0.5rem 1rem; border-radius: 0.5rem; cursor: pointer; }
        .main-content { flex: 1; max-width: 1200px; margin: 0 auto; padding: 2rem; width: 100%; }
        .card { background: white; border-radius: 0.75rem; padding: 2rem; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); margin-bottom: 1.5rem; }
        .btn { padding: 0.5rem 1rem; border: none; border-radius: 0.5rem; cursor: pointer; font-weight: 500; transition: all 0.2s; }
        .btn-primary { background: #3b82f6; color: white; }
        .btn-primary:hover { background: #2563eb; }
        .btn-success { background: #10b981; color: white; }
        .btn-danger { background: #ef4444; color: white; }
        .form-group { margin-bottom: 1rem; }
        .form-label { display: block; margin-bottom: 0.5rem; font-weight: 500; }
        .form-input { width: 100%; padding: 0.5rem 1rem; border: 1px solid #e5e7eb; border-radius: 0.5rem; }
        .table { width: 100%; border-collapse: collapse; }
        .table th, .table td { padding: 0.75rem; text-align: left; border-bottom: 1px solid #e5e7eb; }
        .table th { font-weight: 600; color: #6b7280; background: #f9fafb; }
        .empty-state { text-align: center; padding: 3rem; color: #6b7280; }
        .modal { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.5); z-index: 1000; align-items: center; justify-content: center; }
        .modal-content { background: white; border-radius: 0.75rem; padding: 2rem; max-width: 500px; width: 90%; }
        .toast { position: fixed; top: 2rem; right: 2rem; background: white; padding: 1rem 1.5rem; border-radius: 0.5rem; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); z-index: 3000; transform: translateX(100%); transition: transform 0.3s; }
        .toast.show { transform: translateX(0); }
        .toast.success { border-left: 4px solid #10b981; }
        .toast.error { border-left: 4px solid #ef4444; }
        .loading { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(255, 255, 255, 0.8); z-index: 2000; align-items: center; justify-content: center; }
        .spinner { width: 40px; height: 40px; border: 4px solid #e5e7eb; border-top: 4px solid #3b82f6; border-radius: 50%; animation: spin 1s linear infinite; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .checkin-btn { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; border: none; padding: 1.5rem 3rem; border-radius: 0.75rem; font-size: 1.25rem; font-weight: bold; cursor: pointer; margin-bottom: 1rem; }
        .checkin-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .checkin-status { font-size: 1.1rem; margin-bottom: 2rem; }
        .checkin-status.completed { color: #10b981; }
        .checkin-status.pending { color: #f59e0b; }
        .pending-notice { background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%); color: white; padding: 1rem; border-radius: 0.5rem; margin: 1rem 0; }
        .quick-nav { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-top: 2rem; }
        .nav-link { background: white; padding: 1.5rem; border-radius: 0.75rem; text-align: center; text-decoration: none; color: #1f2937; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); transition: all 0.2s; }
        .nav-link:hover { transform: translateY(-2px); box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
        .codes-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem; }
        .code-card { background: white; border-radius: 0.75rem; padding: 1.5rem; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); }
        .code-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
        .code-amount { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 0.5rem 1rem; border-radius: 0.5rem; font-weight: bold; }
        .code-value { font-family: monospace; background: #f