// 签到兑换码系统 V4 - 管理员独立登录系统

// ==================== 工具函数 ====================

// 创建会话
async function createSession(db, userId, isAdmin = false) {
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);
  
  // 为管理员会话添加特殊标记
  const sessionData = {
    id: sessionId,
    user_id: isAdmin ? -1 : userId, // 管理员使用特殊ID
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
  
  // 如果是管理员会话
  if (session.is_admin) {
    return {
      ...session,
      user_id: -1,
      username: 'Admin',
      is_admin: true
    };
  }
  
  // 普通用户会话
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
  const allowedOrigin = env.FRONTEND_URL;
  
  if (origin === allowedOrigin || origin === 'http://localhost:3000') {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age': '86400',
    };
  }
  
  return {};
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
        
        // 创建管理员会话
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
      
      // ========== 签到路由（仅普通用户） ==========
      
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
        const tx = await env.DB.batch([
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
        
        const totalResult = await env.DB.prepare(
          'SELECT COUNT(*) as total FROM check_ins WHERE user_id = ?'
        ).bind(userId).first();
        
        return jsonResponse({
          success: true,
          message: '签到成功！',
          code: availableCode.code,
          stats: {
            totalDays: totalResult.total || 0,
            consecutiveDays: 1
          }
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
        
        const totalResult = await env.DB.prepare(
          'SELECT COUNT(*) as total FROM check_ins WHERE user_id = ?'
        ).bind(userId).first();
        
        const availableCount = await env.DB.prepare(
          'SELECT COUNT(*) as count FROM redemption_codes WHERE status = "unused"'
        ).first();
        
        return jsonResponse({
          checkedIn: !!checkIn,
          code: checkIn?.code || null,
          stats: {
            totalDays: totalResult.total || 0,
            consecutiveDays: 1
          },
          codesAvailable: availableCount.count > 0
        }, 200, request, env);
      }
      
      // 获取签到日历
      if (path === '/api/checkin/calendar' && method === 'GET') {
        if (request.session.is_admin) {
          return jsonResponse({ 
            year: new Date().getFullYear(),
            month: new Date().getMonth() + 1,
            checkedDates: [],
            checkIns: []
          }, 200, request, env);
        }
        
        const userId = request.session.user_id;
        const year = parseInt(url.searchParams.get('year')) || new Date().getFullYear();
        const month = parseInt(url.searchParams.get('month')) || new Date().getMonth() + 1;
        
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const endDate = `${year}-${String(month).padStart(2, '0')}-31`;
        
        const results = await env.DB.prepare(`
          SELECT c.check_in_date, r.code, c.created_at
          FROM check_ins c
          JOIN redemption_codes r ON c.redemption_code_id = r.id
          WHERE c.user_id = ? AND c.check_in_date >= ? AND c.check_in_date <= ?
          ORDER BY c.check_in_date DESC
        `).bind(userId, startDate, endDate).all();
        
        const checkedDates = (results.results || []).map(item => item.check_in_date);
        
        return jsonResponse({
          year,
          month,
          checkedDates,
          checkIns: results.results || []
        }, 200, request, env);
      }
      
      // ========== 兑换码路由 ==========
      
      // 获取用户的兑换码列表
      if (path === '/api/codes' && method === 'GET') {
        if (request.session.is_admin) {
          return jsonResponse({ 
            codes: [],
            pagination: {
              page: 1,
              limit: 20,
              total: 0,
              totalPages: 0,
              hasNext: false,
              hasPrev: false
            }
          }, 200, request, env);
        }
        
        const userId = request.session.user_id;
        const page = parseInt(url.searchParams.get('page')) || 1;
        const limit = parseInt(url.searchParams.get('limit')) || 20;
        const offset = (page - 1) * limit;
        
        const countResult = await env.DB.prepare(
          'SELECT COUNT(*) as total FROM check_ins WHERE user_id = ?'
        ).bind(userId).first();
        
        const results = await env.DB.prepare(`
          SELECT c.id, c.check_in_date, r.code as redemption_code, c.created_at
          FROM check_ins c
          JOIN redemption_codes r ON c.redemption_code_id = r.id
          WHERE c.user_id = ?
          ORDER BY c.created_at DESC
          LIMIT ? OFFSET ?
        `).bind(userId, limit, offset).all();
        
        const totalPages = Math.ceil(countResult.total / limit);
        
        return jsonResponse({
          codes: results.results || [],
          pagination: {
            page,
            limit,
            total: countResult.total || 0,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1
          }
        }, 200, request, env);
      }
      
      // ========== 管理员路由 ==========
      
      // 获取所有用户的兑换记录
      if (path === '/api/admin/redemptions' && method === 'GET') {
        const adminError = await requireAdmin(request, env);
        if (adminError) return adminError;
        
        const page = parseInt(url.searchParams.get('page')) || 1;
        const limit = parseInt(url.searchParams.get('limit')) || 50;
        const offset = (page - 1) * limit;
        const sortOrder = url.searchParams.get('sort') || 'desc';
        const search = url.searchParams.get('search') || '';
        
        // 构建查询条件
        let whereClause = '';
        let searchParams = [];
        
        if (search) {
          whereClause = 'WHERE u.username LIKE ? OR u.linux_do_id LIKE ? OR r.code LIKE ?';
          searchParams = [`%${search}%`, `%${search}%`, `%${search}%`];
        }
        
        // 获取总数
        const countQuery = `
          SELECT COUNT(*) as total 
          FROM check_ins c
          JOIN users u ON c.user_id = u.id
          JOIN redemption_codes r ON c.redemption_code_id = r.id
          ${whereClause}
        `;
        
        const countResult = await env.DB.prepare(countQuery).bind(...searchParams).first();
        
        // 获取数据
        const dataQuery = `
          SELECT 
            c.id,
            c.check_in_date,
            c.created_at as redemption_time,
            u.id as user_id,
            u.linux_do_id,
            u.username,
            u.avatar_url,
            r.code as redemption_code
          FROM check_ins c
          JOIN users u ON c.user_id = u.id
          JOIN redemption_codes r ON c.redemption_code_id = r.id
          ${whereClause}
          ORDER BY c.created_at ${sortOrder.toUpperCase()}
          LIMIT ? OFFSET ?
        `;
        
        const results = await env.DB.prepare(dataQuery)
          .bind(...searchParams, limit, offset)
          .all();
        
        const totalPages = Math.ceil(countResult.total / limit);
        
        return jsonResponse({
          redemptions: results.results || [],
          pagination: {
            page,
            limit,
            total: countResult.total || 0,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1
          },
          sortOrder
        }, 200, request, env);
      }
      
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
            error: '文件中没有有效的兑换码',
            details: '兑换码只能包含字母、数字、连字符和下划线'
          }, 400, request, env);
        }
        
        const batchId = crypto.randomUUID();
        const uploaderId = -1; // 管理员ID
        
        const existingCodes = await env.DB.prepare(`
          SELECT code FROM redemption_codes 
          WHERE code IN (${parseResult.codes.map(() => '?').join(',')})
        `).bind(...parseResult.codes).all();
        
        const existingCodeSet = new Set((existingCodes.results || []).map(r => r.code));
        const newCodes = parseResult.codes.filter(code => !existingCodeSet.has(code));
        
        if (newCodes.length > 0) {
          const batchSize = 100;
          for (let i = 0; i < newCodes.length; i += batchSize) {
            const batch = newCodes.slice(i, i + batchSize);
            const placeholders = batch.map(() => '(?, ?, ?)').join(',');
            const values = batch.flatMap(code => [code, batchId, uploaderId]);
            
            await env.DB.prepare(`
              INSERT INTO redemption_codes (code, batch_id, uploaded_by)
              VALUES ${placeholders}
            `).bind(...values).run();
          }
        }
        
        await env.DB.prepare(`
          INSERT INTO upload_batches (id, filename, total_codes, valid_codes, duplicate_codes, uploaded_by)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(
          batchId,
          file.name,
          parseResult.total,
          newCodes.length,
          existingCodeSet.size,
          uploaderId
        ).run();
        
        return jsonResponse({
          success: true,
          batchId,
          summary: {
            filename: file.name,
            totalInFile: parseResult.total,
            uniqueInFile: parseResult.unique,
            duplicatesInFile: parseResult.duplicates,
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
        
        const recentUploads = await env.DB.prepare(`
          SELECT * FROM upload_batches 
          ORDER BY uploaded_at DESC 
          LIMIT 10
        `).all();
        
        return jsonResponse({
          stats: {
            total: stats.total || 0,
            unused: stats.unused || 0,
            used: stats.used || 0
          },
          recentUploads: recentUploads.results || []
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