// 签到兑换码系统 V2 - 支持管理员上传兑换码

// ==================== 工具函数 ====================

// 创建会话
async function createSession(db, userId) {
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);
  
  await db.prepare(
    'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)'
  ).bind(sessionId, userId, expiresAt.toISOString()).run();
  
  return sessionId;
}

// 验证会话
async function validateSession(db, sessionId) {
  if (!sessionId) return null;
  
  const result = await db.prepare(`
    SELECT s.*, u.id as user_id, u.linux_do_id, u.username, u.email, u.avatar_url, u.is_admin
    FROM sessions s 
    JOIN users u ON s.user_id = u.id 
    WHERE s.id = ? AND s.expires_at > datetime('now')
  `).bind(sessionId).first();
  
  return result;
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
  // 支持多种分隔符：换行、逗号、分号、空格
  const codes = content
    .split(/[\n\r,;]+/)
    .map(code => code.trim())
    .filter(code => code.length > 0)
    .filter(code => /^[A-Za-z0-9\-_]+$/.test(code)); // 只允许字母数字和连字符下划线
  
  // 去重
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
      avatar_url: avatarUrl,
      is_admin: 0
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
      
      // OAuth2回调
      if (path === '/api/auth/callback' && method === 'GET') {
        const code = url.searchParams.get('code');
        
        if (!code) {
          return jsonResponse({ error: '授权码缺失' }, 400, request, env);
        }
        
        const tokenData = await getAccessToken(code, env);
        const userInfo = await getUserInfo(tokenData.access_token, env);
        const user = await createOrUpdateUser(env.DB, userInfo);
        const sessionId = await createSession(env.DB, user.id);
        
        return new Response(JSON.stringify({ 
          success: true,
          user: {
            id: user.id,
            username: user.username,
            avatar_url: user.avatar_url,
            is_admin: user.is_admin
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
            email: session.email,
            avatar_url: session.avatar_url,
            is_admin: session.is_admin
          }
        }, 200, request, env);
      }
      
      // ========== 签到路由 ==========
      
      // 执行签到
      if (path === '/api/checkin' && method === 'POST') {
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
        
        // 开始事务（D1 支持事务）
        const tx = await env.DB.batch([
          // 更新兑换码状态
          env.DB.prepare(`
            UPDATE redemption_codes 
            SET status = 'used', used_by = ?, used_at = datetime('now')
            WHERE id = ?
          `).bind(userId, availableCode.id),
          
          // 创建签到记录
          env.DB.prepare(`
            INSERT INTO check_ins (user_id, check_in_date, redemption_code_id)
            VALUES (?, ?, ?)
          `).bind(userId, today, availableCode.id)
        ]);
        
        // 获取统计信息
        const totalResult = await env.DB.prepare(
          'SELECT COUNT(*) as total FROM check_ins WHERE user_id = ?'
        ).bind(userId).first();
        
        return jsonResponse({
          success: true,
          message: '签到成功！',
          code: availableCode.code,
          stats: {
            totalDays: totalResult.total || 0,
            consecutiveDays: 1 // 简化版本
          }
        }, 200, request, env);
      }
      
      // 检查今日签到状态
      if (path === '/api/checkin/today' && method === 'GET') {
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
        
        // 检查是否还有可用兑换码
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
      
      // 上传兑换码
      if (path === '/api/admin/codes/upload' && method === 'POST') {
        const adminError = await requireAdmin(request, env);
        if (adminError) return adminError;
        
        const formData = await request.formData();
        const file = formData.get('file');
        
        if (!file) {
          return jsonResponse({ error: '请选择文件' }, 400, request, env);
        }
        
        // 读取文件内容
        const content = await file.text();
        const parseResult = parseRedemptionCodes(content);
        
        if (parseResult.codes.length === 0) {
          return jsonResponse({ 
            error: '文件中没有有效的兑换码',
            details: '兑换码只能包含字母、数字、连字符和下划线'
          }, 400, request, env);
        }
        
        // 生成批次ID
        const batchId = crypto.randomUUID();
        const uploaderId = request.session.user_id;
        
        // 检查已存在的兑换码
        const existingCodes = await env.DB.prepare(`
          SELECT code FROM redemption_codes 
          WHERE code IN (${parseResult.codes.map(() => '?').join(',')})
        `).bind(...parseResult.codes).all();
        
        const existingCodeSet = new Set((existingCodes.results || []).map(r => r.code));
        const newCodes = parseResult.codes.filter(code => !existingCodeSet.has(code));
        
        // 批量插入新兑换码
        if (newCodes.length > 0) {
          // D1 不支持一次插入太多数据，分批插入
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
        
        // 记录上传批次
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