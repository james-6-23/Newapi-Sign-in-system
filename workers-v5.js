/**
 * 每日签到系统 V5 - Cloudflare Workers
 * 支持兑换码金额管理、待分配机制、系统赠送、批量分发等功能
 * 
 * 环境变量要求：
 * - OAUTH_CLIENT_ID: Linux Do OAuth2 客户端ID
 * - OAUTH_CLIENT_SECRET: Linux Do OAuth2 客户端密钥
 * - ADMIN_USERNAME: 管理员用户名
 * - ADMIN_PASSWORD: 管理员密码
 * - SESSION_SECRET: 会话密钥
 * - FRONTEND_URL: 前端URL
 * 
 * D1数据库绑定：
 * - DB: D1数据库实例
 */

// ============================================
// 数据库初始化
// ============================================

/**
 * 初始化弹窗控制表
 */
async function initModalControlTables(env) {
  try {
    // 创建弹窗显示记录表
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS modal_display_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        notification_id INTEGER,
        modal_type TEXT NOT NULL,
        modal_key TEXT NOT NULL,
        display_count INTEGER DEFAULT 0,
        max_display_count INTEGER DEFAULT 1,
        first_displayed_at DATETIME,
        last_displayed_at DATETIME,
        is_dismissed BOOLEAN DEFAULT FALSE,
        dismissed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (notification_id) REFERENCES system_notifications(id),
        UNIQUE(user_id, modal_type, modal_key)
      )
    `).run();

    // 创建弹窗配置表
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS modal_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        modal_type TEXT UNIQUE NOT NULL,
        max_display_count INTEGER DEFAULT 1,
        cooldown_minutes INTEGER DEFAULT 0,
        is_enabled BOOLEAN DEFAULT TRUE,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // 创建索引
    await env.DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_modal_logs_user_type
      ON modal_display_logs(user_id, modal_type)
    `).run();

    await env.DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_modal_logs_key
      ON modal_display_logs(modal_key, display_count)
    `).run();

    // 插入默认配置
    await env.DB.prepare(`
      INSERT OR IGNORE INTO modal_configs (modal_type, max_display_count, cooldown_minutes, description) VALUES
      ('gift', 1, 0, '系统赠送弹窗'),
      ('pending', 1, 0, '待分配弹窗'),
      ('checkin', 1, 0, '签到成功弹窗'),
      ('system', 1, 0, '系统通知弹窗')
    `).run();

    console.log('Modal control tables initialized successfully');
  } catch (error) {
    console.error('Failed to initialize modal control tables:', error);
  }
}

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
 * 清理过期会话
 */
async function cleanupSessions(env) {
  await env.DB.prepare(`
    DELETE FROM sessions 
    WHERE expires_at < datetime('now')
  `).run();
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
function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.FRONTEND_URL || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'true',
  };
}

/**
 * 创建JSON响应
 */
function jsonResponse(data, status = 200, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(env),
    },
  });
}

/**
 * 创建错误响应
 */
function errorResponse(message, status = 400, env) {
  return jsonResponse({ success: false, error: message }, status, env);
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
 * 获取所有面额的库存统计
 */
async function getInventoryStats(env) {
  const results = await env.DB.prepare(`
    SELECT 
      amount,
      COUNT(*) as total_count,
      SUM(CASE WHEN is_used = FALSE THEN 1 ELSE 0 END) as available_count,
      SUM(CASE WHEN is_used = TRUE THEN 1 ELSE 0 END) as used_count
    FROM redemption_codes
    GROUP BY amount
    ORDER BY amount ASC
  `).all();
  
  return results.results || [];
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

/**
 * 分配兑换码给用户
 */
async function assignCodeToUser(codeId, userId, distributionType, env) {
  const now = new Date().toISOString();
  
  await env.DB.prepare(`
    UPDATE redemption_codes 
    SET 
      is_used = TRUE,
      used_by = ?,
      used_at = ?,
      distribution_type = ?,
      distribution_time = ?
    WHERE id = ? AND is_used = FALSE
  `).bind(userId, now, distributionType, now, codeId).run();
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
    return errorResponse('未登录', 401, env);
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
    }, 200, env);
  }

  // 检查是否有可用的兑换码（优先使用默认金额）
  const defaultAmount = env.DEFAULT_CODE_AMOUNT || 10;
  let availableAmount = null;
  let availableCode = null;

  // 先尝试默认金额
  const defaultInventory = await checkInventory(defaultAmount, env);
  if (defaultInventory > 0) {
    const codes = await getAvailableCodes(defaultAmount, 1, env);
    if (codes.length > 0) {
      availableCode = codes[0];
      availableAmount = defaultAmount;
    }
  }

  // 如果默认金额没有库存，尝试其他金额
  if (!availableCode) {
    const stats = await getInventoryStats(env);
    for (const stat of stats) {
      if (stat.available_count > 0) {
        const codes = await getAvailableCodes(stat.amount, 1, env);
        if (codes.length > 0) {
          availableCode = codes[0];
          availableAmount = stat.amount;
          break;
        }
      }
    }
  }

  // 创建签到记录
  if (availableCode) {
    // 有库存，正常分配
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO check_ins (user_id, check_in_date, check_in_time, redemption_code, status)
        VALUES (?, ?, ?, ?, 'completed')
      `).bind(user.user_id, today, now, availableCode.code),
      
      env.DB.prepare(`
        UPDATE redemption_codes 
        SET 
          is_used = TRUE,
          used_by = ?,
          used_at = ?,
          distribution_type = 'checkin',
          distribution_time = ?
        WHERE id = ?
      `).bind(user.user_id, now, now, availableCode.id)
    ]);

    return jsonResponse({
      success: true,
      message: '签到成功',
      redemptionCode: availableCode.code,
      amount: availableAmount,
      status: 'completed'
    }, 200, env);
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
    }, 200, env);
  }
}

/**
 * 获取签到记录
 */
async function getCheckInRecords(request, env) {
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const sort = url.searchParams.get('sort') || 'desc';
  const offset = (page - 1) * limit;

  const user = await requireAuth(request, env);
  const isAdmin = user && user.is_admin;

  let query;
  let countQuery;
  
  if (isAdmin) {
    // 管理员可以看到所有记录
    query = `
      SELECT 
        c.*,
        u.username,
        u.linux_do_id,
        u.avatar_url,
        r.amount
      FROM check_ins c
      JOIN users u ON c.user_id = u.id
      LEFT JOIN redemption_codes r ON c.redemption_code = r.code
      ORDER BY c.check_in_time ${sort.toUpperCase()}
      LIMIT ? OFFSET ?
    `;
    
    countQuery = `SELECT COUNT(*) as total FROM check_ins`;
  } else if (user) {
    // 普通用户只能看到自己的记录
    query = `
      SELECT 
        c.*,
        r.amount
      FROM check_ins c
      LEFT JOIN redemption_codes r ON c.redemption_code = r.code
      WHERE c.user_id = ?
      ORDER BY c.check_in_time ${sort.toUpperCase()}
      LIMIT ? OFFSET ?
    `;
    
    countQuery = `SELECT COUNT(*) as total FROM check_ins WHERE user_id = ?`;
  } else {
    return errorResponse('未登录', 401, env);
  }

  const records = isAdmin 
    ? await env.DB.prepare(query).bind(limit, offset).all()
    : await env.DB.prepare(query).bind(user.user_id, limit, offset).all();
    
  const count = isAdmin
    ? await env.DB.prepare(countQuery).first()
    : await env.DB.prepare(countQuery).bind(user.user_id).first();

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
  }, 200, env);
}

// ============================================
// 兑换码管理API
// ============================================

/**
 * 上传兑换码（带金额）
 */
async function uploadCodes(request, env) {
  const admin = await requireAdmin(request, env);
  if (!admin) {
    return errorResponse('需要管理员权限', 403, env);
  }

  const formData = await request.formData();
  const file = formData.get('file');
  const amount = parseFloat(formData.get('amount') || '0');

  if (!file) {
    return errorResponse('请选择文件', 400, env);
  }

  if (amount <= 0) {
    return errorResponse('请设置有效的金额', 400, env);
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
    return errorResponse('文件中没有有效的兑换码', 400, env);
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
  }, 200, env);
}

/**
 * 设置兑换码金额
 */
async function setCodeAmount(request, env) {
  const admin = await requireAdmin(request, env);
  if (!admin) {
    return errorResponse('需要管理员权限', 403, env);
  }

  const { codes, amount } = await request.json();

  if (!codes || !Array.isArray(codes) || codes.length === 0) {
    return errorResponse('请选择兑换码', 400, env);
  }

  if (!amount || amount <= 0) {
    return errorResponse('请设置有效的金额', 400, env);
  }

  // 更新兑换码金额
  const updateStatements = codes.map(code =>
    env.DB.prepare(`
      UPDATE redemption_codes 
      SET amount = ?
      WHERE code = ? AND is_used = FALSE
    `).bind(amount, code)
  );

  await env.DB.batch(updateStatements);

  return jsonResponse({
    success: true,
    message: `成功设置 ${codes.length} 个兑换码的金额为 ${amount}`
  }, 200, env);
}

/**
 * 获取库存统计
 */
async function getInventory(request, env) {
  const admin = await requireAdmin(request, env);
  if (!admin) {
    return errorResponse('需要管理员权限', 403, env);
  }

  const stats = await getInventoryStats(env);

  return jsonResponse({
    success: true,
    inventory: stats
  }, 200, env);
}

/**
 * 获取兑换码列表
 */
async function listCodes(request, env) {
  const admin = await requireAdmin(request, env);
  if (!admin) {
    return errorResponse('需要管理员权限', 403, env);
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
  }, 200, env);
}

/**
 * 清空未使用的兑换码
 */
async function clearUnusedCodes(request, env) {
  const admin = await requireAdmin(request, env);
  if (!admin) {
    return errorResponse('需要管理员权限', 403, env);
  }

  const { confirmation } = await request.json();

  if (confirmation !== '一键清空') {
    return errorResponse('请输入"一键清空"以确认操作', 400, env);
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
  }, 200, env);
}

// ============================================
// 分发功能API
// ============================================

/**
 * 系统赠送兑换码
 */
async function giftCodes(request, env) {
  const admin = await requireAdmin(request, env);
  if (!admin) {
    return errorResponse('需要管理员权限', 403, env);
  }

  const { user_ids, amount, message } = await request.json();

  if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
    return errorResponse('请选择用户', 400, env);
  }

  if (!amount || amount <= 0) {
    return errorResponse('请选择有效的金额', 400, env);
  }

  // 检查库存
  const available = await checkInventory(amount, env);
  if (available < user_ids.length) {
    return errorResponse(`库存不足，当前 ${amount} 元面额仅剩 ${available} 个`, 400, env);
  }

  // 获取可用兑换码
  const codes = await getAvailableCodes(amount, user_ids.length, env);
  
  const now = new Date().toISOString();
  const statements = [];

  // 分配兑换码并创建通知
  for (let i = 0; i < user_ids.length; i++) {
    const userId = user_ids[i];
    const code = codes[i];

    // 更新兑换码状态
    statements.push(
      env.DB.prepare(`
        UPDATE redemption_codes 
        SET 
          is_used = TRUE,
          used_by = ?,
          used_at = ?,
          distribution_type = 'gift',
          distribution_time = ?
        WHERE id = ?
      `).bind(userId, now, now, code.id)
    );

    // 创建通知
    statements.push(
      env.DB.prepare(`
        INSERT INTO system_notifications (
          user_id, type, title, message, 
          redemption_code, amount, created_at
        ) VALUES (?, 'gift', '系统赠送', ?, ?, ?, ?)
      `).bind(
        userId,
        message || `恭喜您获得 ${amount} 元兑换码！`,
        code.code,
        amount,
        now
      )
    );
  }

  // 记录分发日志
  statements.push(
    env.DB.prepare(`
      INSERT INTO distribution_logs (
        admin_id, operation_type, target_users, 
        amount, codes_distributed, status
      ) VALUES (0, 'gift', ?, ?, ?, 'success')
    `).bind(
      JSON.stringify(user_ids),
      amount,
      user_ids.length
    )
  );

  await env.DB.batch(statements);

  return jsonResponse({
    success: true,
    message: `成功赠送 ${user_ids.length} 个兑换码`,
    distributed: user_ids.length,
    amount: amount
  }, 200, env);
}

/**
 * 批量分发兑换码
 */
async function batchDistribute(request, env) {
  const admin = await requireAdmin(request, env);
  if (!admin) {
    return errorResponse('需要管理员权限', 403, env);
  }

  const { user_ids, amount, confirm } = await request.json();

  if (!confirm) {
    return errorResponse('请确认批量分发操作', 400, env);
  }

  if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
    return errorResponse('请选择用户', 400, env);
  }

  if (!amount || amount <= 0) {
    return errorResponse('请选择有效的金额', 400, env);
  }

  const maxBatchSize = parseInt(env.MAX_BATCH_SIZE || '100');
  if (user_ids.length > maxBatchSize) {
    return errorResponse(`批量分发数量不能超过 ${maxBatchSize}`, 400, env);
  }

  // 检查库存
  const available = await checkInventory(amount, env);
  if (available < user_ids.length) {
    return errorResponse(`库存不足，当前 ${amount} 元面额仅剩 ${available} 个`, 400, env);
  }

  // 获取可用兑换码
  const codes = await getAvailableCodes(amount, user_ids.length, env);
  
  const now = new Date().toISOString();
  const statements = [];

  // 批量分配
  for (let i = 0; i < user_ids.length; i++) {
    const userId = user_ids[i];
    const code = codes[i];

    statements.push(
      env.DB.prepare(`
        UPDATE redemption_codes 
        SET 
          is_used = TRUE,
          used_by = ?,
          used_at = ?,
          distribution_type = 'manual',
          distribution_time = ?
        WHERE id = ?
      `).bind(userId, now, now, code.id)
    );
  }

  // 记录分发日志
  statements.push(
    env.DB.prepare(`
      INSERT INTO distribution_logs (
        admin_id, operation_type, target_users, 
        amount, codes_distributed, status
      ) VALUES (0, 'batch', ?, ?, ?, 'success')
    `).bind(
      JSON.stringify(user_ids),
      amount,
      user_ids.length
    )
  );

  await env.DB.batch(statements);

  return jsonResponse({
    success: true,
    message: `成功分发 ${user_ids.length} 个兑换码`,
    distributed: user_ids.length,
    amount: amount
  }, 200, env);
}

/**
 * 获取待分配用户列表
 */
async function getPendingUsers(request, env) {
  const admin = await requireAdmin(request, env);
  if (!admin) {
    return errorResponse('需要管理员权限', 403, env);
  }

  const results = await env.DB.prepare(`
    SELECT 
      c.id as checkin_id,
      c.user_id,
      u.username,
      u.linux_do_id,
      u.avatar_url,
      c.check_in_date,
      c.check_in_time,
      c.created_at
    FROM check_ins c
    JOIN users u ON c.user_id = u.id
    WHERE c.status = 'pending_distribution'
    ORDER BY c.created_at ASC
  `).all();

  return jsonResponse({
    success: true,
    pendingUsers: results.results || []
  }, 200, env);
}

/**
 * 补发待分配的兑换码
 */
async function resolvePending(request, env) {
  const admin = await requireAdmin(request, env);
  if (!admin) {
    return errorResponse('需要管理员权限', 403, env);
  }

  // 获取所有待分配记录
  const pending = await env.DB.prepare(`
    SELECT 
      c.id as checkin_id,
      c.user_id
    FROM check_ins c
    WHERE c.status = 'pending_distribution'
    ORDER BY c.created_at ASC
  `).all();

  if (!pending.results || pending.results.length === 0) {
    return jsonResponse({
      success: true,
      message: '没有待分配的记录',
      resolved: 0
    }, 200, env);
  }

  // 获取库存统计
  const inventory = await getInventoryStats(env);
  const availableInventory = inventory.filter(i => i.available_count > 0);

  if (availableInventory.length === 0) {
    return errorResponse('没有可用的兑换码库存', 400, env);
  }

  const now = new Date().toISOString();
  const statements = [];
  let resolved = 0;

  // 为每个待分配用户分配兑换码
  for (const record of pending.results) {
    // 找到有库存的面额
    let assignedCode = null;
    let assignedAmount = null;

    for (const inv of availableInventory) {
      if (inv.available_count > 0) {
        const codes = await getAvailableCodes(inv.amount, 1, env);
        if (codes.length > 0) {
          assignedCode = codes[0];
          assignedAmount = inv.amount;
          inv.available_count--; // 更新本地库存计数
          break;
        }
      }
    }

    if (assignedCode) {
      // 更新签到记录
      statements.push(
        env.DB.prepare(`
          UPDATE check_ins 
          SET 
            redemption_code = ?,
            status = 'completed'
          WHERE id = ?
        `).bind(assignedCode.code, record.checkin_id)
      );

      // 更新兑换码状态
      statements.push(
        env.DB.prepare(`
          UPDATE redemption_codes 
          SET 
            is_used = TRUE,
            used_by = ?,
            used_at = ?,
            distribution_type = 'pending_resolve',
            distribution_time = ?
          WHERE id = ?
        `).bind(record.user_id, now, now, assignedCode.id)
      );

      // 创建通知
      statements.push(
        env.DB.prepare(`
          INSERT INTO system_notifications (
            user_id, type, title, message,
            redemption_code, amount, created_at
          ) VALUES (?, 'pending_resolved', '兑换码已补发', ?, ?, ?, ?)
        `).bind(
          record.user_id,
          `您的待分配兑换码已补发：${assignedCode.code}`,
          assignedCode.code,
          assignedAmount,
          now
        )
      );

      resolved++;
    }
  }

  if (statements.length > 0) {
    // 记录分发日志
    statements.push(
      env.DB.prepare(`
        INSERT INTO distribution_logs (
          admin_id, operation_type, target_users,
          codes_distributed, status
        ) VALUES (0, 'pending_resolve', ?, ?, 'success')
      `).bind(
        JSON.stringify(pending.results.map(p => p.user_id)),
        resolved
      )
    );

    await env.DB.batch(statements);
  }

  return jsonResponse({
    success: true,
    message: `成功补发 ${resolved} 个兑换码`,
    resolved: resolved,
    total: pending.results.length
  }, 200, env);
}

// ============================================
// 弹窗控制系统API
// ============================================

/**
 * 检查弹窗是否应该显示
 */
async function checkModalDisplay(request, env) {
  const user = await requireAuth(request, env);
  if (!user) {
    return errorResponse('未登录', 401, env);
  }

  const url = new URL(request.url);
  const modalType = url.searchParams.get('type');
  const modalKey = url.searchParams.get('key');

  if (!modalType || !modalKey) {
    return errorResponse('缺少必要参数', 400, env);
  }

  try {
    // 检查弹窗显示记录
    const record = await env.DB.prepare(`
      SELECT
        mdl.display_count,
        mdl.max_display_count,
        mdl.last_displayed_at,
        mdl.is_dismissed,
        COALESCE(mc.cooldown_minutes, 0) as cooldown_minutes,
        COALESCE(mc.is_enabled, 1) as is_enabled,
        CASE
          WHEN COALESCE(mc.is_enabled, 1) = 0 THEN 'disabled'
          WHEN mdl.display_count >= mdl.max_display_count THEN 'max_reached'
          WHEN mdl.is_dismissed = 1 THEN 'dismissed'
          WHEN mdl.last_displayed_at IS NOT NULL
               AND datetime(mdl.last_displayed_at, '+' || COALESCE(mc.cooldown_minutes, 0) || ' minutes') > datetime('now')
               THEN 'cooldown'
          ELSE 'allowed'
        END as display_status
      FROM modal_display_logs mdl
      LEFT JOIN modal_configs mc ON mc.modal_type = mdl.modal_type
      WHERE mdl.user_id = ?
        AND mdl.modal_type = ?
        AND mdl.modal_key = ?
    `).bind(user.user_id, modalType, modalKey).first();

    const shouldDisplay = !record || record.display_status === 'allowed';

    return jsonResponse({
      success: true,
      should_display: shouldDisplay,
      reason: record?.display_status || 'new',
      display_count: record?.display_count || 0,
      max_count: record?.max_display_count || 1
    }, 200, env);

  } catch (error) {
    console.error('Check modal display error:', error);
    return errorResponse('检查弹窗状态失败', 500, env);
  }
}

/**
 * 记录弹窗显示
 */
async function recordModalDisplay(request, env) {
  const user = await requireAuth(request, env);
  if (!user) {
    return errorResponse('未登录', 401, env);
  }

  const data = await request.json();
  const { type: modalType, key: modalKey, notification_id } = data;

  if (!modalType || !modalKey) {
    return errorResponse('缺少必要参数', 400, env);
  }

  try {
    // 插入或更新弹窗显示记录
    await env.DB.prepare(`
      INSERT INTO modal_display_logs (
        user_id, notification_id, modal_type, modal_key,
        display_count, max_display_count, first_displayed_at, last_displayed_at
      ) VALUES (?, ?, ?, ?, 1, 1, datetime('now'), datetime('now'))
      ON CONFLICT(user_id, modal_type, modal_key) DO UPDATE SET
        display_count = display_count + 1,
        last_displayed_at = datetime('now'),
        updated_at = datetime('now')
    `).bind(user.user_id, notification_id || null, modalType, modalKey).run();

    return jsonResponse({
      success: true,
      message: '弹窗显示已记录'
    }, 200, env);

  } catch (error) {
    console.error('Record modal display error:', error);
    return errorResponse('记录弹窗显示失败', 500, env);
  }
}

/**
 * 标记弹窗已关闭
 */
async function dismissModal(request, env) {
  const user = await requireAuth(request, env);
  if (!user) {
    return errorResponse('未登录', 401, env);
  }

  const data = await request.json();
  const { type: modalType, key: modalKey } = data;

  if (!modalType || !modalKey) {
    return errorResponse('缺少必要参数', 400, env);
  }

  try {
    await env.DB.prepare(`
      UPDATE modal_display_logs
      SET is_dismissed = 1,
          dismissed_at = datetime('now'),
          updated_at = datetime('now')
      WHERE user_id = ?
        AND modal_type = ?
        AND modal_key = ?
    `).bind(user.user_id, modalType, modalKey).run();

    return jsonResponse({
      success: true,
      message: '弹窗已标记为关闭'
    }, 200, env);

  } catch (error) {
    console.error('Dismiss modal error:', error);
    return errorResponse('标记弹窗关闭失败', 500, env);
  }
}

/**
 * 重置弹窗状态（管理员功能）
 */
async function resetModalState(request, env) {
  const admin = await requireAdmin(request, env);
  if (!admin) {
    return errorResponse('需要管理员权限', 403, env);
  }

  const data = await request.json();
  const { user_id, modal_type, modal_key, reset_type = 'specific' } = data;

  try {
    let query;
    let params = [];

    switch (reset_type) {
      case 'all':
        // 重置所有弹窗记录
        query = 'DELETE FROM modal_display_logs';
        break;
      case 'user':
        // 重置特定用户的所有弹窗
        query = 'DELETE FROM modal_display_logs WHERE user_id = ?';
        params = [user_id];
        break;
      case 'type':
        // 重置特定类型的弹窗
        query = 'DELETE FROM modal_display_logs WHERE modal_type = ?';
        params = [modal_type];
        break;
      case 'specific':
      default:
        // 重置特定弹窗记录
        query = 'DELETE FROM modal_display_logs WHERE user_id = ? AND modal_type = ? AND modal_key = ?';
        params = [user_id, modal_type, modal_key];
        break;
    }

    const result = await env.DB.prepare(query).bind(...params).run();

    return jsonResponse({
      success: true,
      message: '弹窗状态已重置',
      affected_rows: result.changes
    }, 200, env);

  } catch (error) {
    console.error('Reset modal state error:', error);
    return errorResponse('重置弹窗状态失败', 500, env);
  }
}

// ============================================
// 通知系统API
// ============================================

/**
 * 获取用户通知（集成弹窗控制）
 */
async function getNotifications(request, env) {
  const user = await requireAuth(request, env);
  if (!user) {
    return errorResponse('未登录', 401, env);
  }

  const url = new URL(request.url);
  const unreadOnly = url.searchParams.get('unread_only') === 'true';

  try {
    let query = `
      SELECT
        sn.*,
        mdl.display_count,
        mdl.is_dismissed as modal_dismissed,
        CASE
          WHEN mdl.display_count >= 1 THEN 0
          WHEN mdl.is_dismissed = 1 THEN 0
          ELSE 1
        END as should_show_modal
      FROM system_notifications sn
      LEFT JOIN modal_display_logs mdl ON (
        mdl.user_id = sn.user_id
        AND mdl.modal_type = sn.type
        AND mdl.modal_key = COALESCE(sn.redemption_code, CAST(sn.id AS TEXT))
      )
      WHERE sn.user_id = ?
    `;

    if (unreadOnly) {
      query += ` AND sn.is_dismissed = FALSE`;
    }

    query += ` ORDER BY sn.created_at DESC LIMIT 10`;

    const notifications = await env.DB.prepare(query)
      .bind(user.user_id)
      .all();

    // 过滤掉不应该显示弹窗的通知
    const filteredNotifications = (notifications.results || []).filter(notification => {
      if (unreadOnly && notification.type === 'gift') {
        // 对于赠送通知，只返回应该显示弹窗的
        return notification.should_show_modal === 1;
      }
      return true;
    });

    return jsonResponse({
      success: true,
      notifications: filteredNotifications
    }, 200, env);

  } catch (error) {
    console.error('Get notifications error:', error);
    return errorResponse('获取通知失败', 500, env);
  }
}

/**
 * 标记通知为已读
 */
async function markNotificationRead(request, env) {
  const user = await requireAuth(request, env);
  if (!user) {
    return errorResponse('未登录', 401, env);
  }

  const url = new URL(request.url);
  const id = url.pathname.split('/').pop();

  await env.DB.prepare(`
    UPDATE system_notifications
    SET is_read = TRUE, read_at = ?
    WHERE id = ? AND user_id = ?
  `).bind(new Date().toISOString(), id, user.user_id).run();

  return jsonResponse({
    success: true,
    message: '通知已标记为已读'
  }, 200, env);
}

/**
 * 关闭通知
 */
async function dismissNotification(request, env) {
  const user = await requireAuth(request, env);
  if (!user) {
    return errorResponse('未登录', 401, env);
  }

  const url = new URL(request.url);
  const id = url.pathname.split('/').pop();

  await env.DB.prepare(`
    UPDATE system_notifications
    SET is_dismissed = TRUE, dismissed_at = ?
    WHERE id = ? AND user_id = ?
  `).bind(new Date().toISOString(), id, user.user_id).run();

  return jsonResponse({
    success: true,
    message: '通知已关闭'
  }, 200, env);
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
  const state = url.searchParams.get('state');

  if (!code) {
    return errorResponse('缺少授权码', 400, env);
  }

  // 使用您指定的回调URL
  const redirectUri = `${url.origin}/oauth/linuxdo`;

  // 交换访问令牌 - 使用正确的Linux Do OAuth2端点
  const tokenResponse = await fetch('https://connect.linux.do/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      client_id: env.OAUTH_CLIENT_ID,
      client_secret: env.OAUTH_CLIENT_SECRET,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenResponse.ok) {
    console.error('Token exchange failed:', await tokenResponse.text());
    return errorResponse('获取访问令牌失败', 400, env);
  }

  const tokenData = await tokenResponse.json();

  // 获取用户信息 - 使用正确的用户信息端点
  const userResponse = await fetch('https://connect.linux.do/api/user', {
    headers: {
      'Authorization': `Bearer ${tokenData.access_token}`,
    },
  });

  if (!userResponse.ok) {
    console.error('User info fetch failed:', await userResponse.text());
    return errorResponse('获取用户信息失败', 400, env);
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
      userData.email || '',
      userData.avatar_url || ''
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
      userData.email || user.email,
      userData.avatar_url || user.avatar_url,
      new Date().toISOString(),
      user.id
    ).run();
  }

  // 创建会话
  const sessionId = await createSession(user.id, false, env);

  // 设置Cookie并重定向到前端主页
  const response = new Response(null, {
    status: 302,
    headers: {
      'Location': `${env.FRONTEND_URL}/index.html`,
      'Set-Cookie': `session=${sessionId}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=${7 * 24 * 60 * 60}`,
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
    return errorResponse('请输入用户名和密码', 400, env);
  }

  // 验证管理员凭据
  if (username !== env.ADMIN_USERNAME || password !== env.ADMIN_PASSWORD) {
    return errorResponse('用户名或密码错误', 401, env);
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
      'Set-Cookie': `session=${sessionId}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=${7 * 24 * 60 * 60}`,
      ...corsHeaders(env),
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
      'Set-Cookie': 'session=; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=0',
      ...corsHeaders(env),
    },
  });
}

/**
 * 获取用户信息
 */
async function getUserInfo(request, env) {
  const user = await requireAuth(request, env);
  if (!user) {
    return errorResponse('未登录', 401, env);
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
  }, 200, env);
}

// ============================================
// 管理员兑换记录API
// ============================================

/**
 * 获取所有用户的兑换记录
 */
async function getAdminRedemptions(request, env) {
  const admin = await requireAdmin(request, env);
  if (!admin) {
    return errorResponse('需要管理员权限', 403, env);
  }

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const sort = url.searchParams.get('sort') || 'desc';
  const search = url.searchParams.get('search') || '';
  const offset = (page - 1) * limit;

  let whereClause = '';
  let bindParams = [];

  if (search) {
    whereClause = `
      WHERE u.username LIKE ?
      OR u.linux_do_id LIKE ?
      OR c.redemption_code LIKE ?
    `;
    const searchPattern = `%${search}%`;
    bindParams = [searchPattern, searchPattern, searchPattern];
  }

  const query = `
    SELECT
      c.id,
      c.check_in_date,
      c.check_in_time,
      c.redemption_code,
      c.status,
      u.id as user_id,
      u.username,
      u.linux_do_id,
      u.avatar_url,
      r.amount,
      r.distribution_time as redemption_time
    FROM check_ins c
    JOIN users u ON c.user_id = u.id
    LEFT JOIN redemption_codes r ON c.redemption_code = r.code
    ${whereClause}
    ORDER BY c.check_in_time ${sort.toUpperCase()}
    LIMIT ? OFFSET ?
  `;

  bindParams.push(limit, offset);

  const countQuery = `
    SELECT COUNT(*) as total
    FROM check_ins c
    JOIN users u ON c.user_id = u.id
    ${whereClause}
  `;

  const records = await env.DB.prepare(query).bind(...bindParams).all();
  const count = await env.DB.prepare(countQuery)
    .bind(...bindParams.slice(0, -2))
    .first();

  const totalPages = Math.ceil(count.total / limit);

  return jsonResponse({
    success: true,
    redemptions: records.results || [],
    pagination: {
      page,
      limit,
      total: count.total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    }
  }, 200, env);
}

// ============================================
// 统计API
// ============================================

/**
 * 获取兑换码统计信息
 */
async function getCodeStats(request, env) {
  const admin = await requireAdmin(request, env);
  if (!admin) {
    return errorResponse('需要管理员权限', 403, env);
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
  }, 200, env);
}

// ============================================
// 主路由处理
// ============================================

export default {
  async fetch(request, env, ctx) {
    try {
      // 初始化弹窗控制表（仅在首次访问时执行）
      if (!env.MODAL_TABLES_INITIALIZED) {
        await initModalControlTables(env);
        env.MODAL_TABLES_INITIALIZED = true;
      }

      // 清理过期会话
      await cleanupSessions(env);
    } catch (initError) {
      console.error('Initialization error:', initError);
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // 处理CORS预检请求
    if (method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders(env),
      });
    }

    // 定期清理过期会话
    ctx.waitUntil(cleanupSessions(env));

    // 路由映射
    try {
      // 用户认证
      if (path === '/api/auth/login' && method === 'GET') {
        // 生成OAuth授权URL - 使用正确的Linux Do OAuth2端点
        const state = generateRandomString(32);
        // 使用您指定的回调URL
        const redirectUri = `${url.origin}/oauth/linuxdo`;
        const authUrl = `https://connect.linux.do/oauth2/authorize?` + new URLSearchParams({
          client_id: env.OAUTH_CLIENT_ID,
          redirect_uri: redirectUri,
          response_type: 'code',
          scope: 'user',  // 根据文档，scope应该是'user'
          state: state
        });
        
        return jsonResponse({
          success: true,
          authUrl: authUrl
        }, 200, env);
      }
      // 支持两个回调路径
      if ((path === '/api/oauth/callback' || path === '/oauth/linuxdo') && method === 'GET') {
        return await handleOAuthCallback(request, env);
      }
      if (path === '/api/admin/login' && method === 'POST') {
        return await adminLogin(request, env);
      }
      if (path === '/api/logout' && method === 'POST') {
        return await logout(request, env);
      }
      if (path === '/api/user' && method === 'GET') {
        return await getUserInfo(request, env);
      }

      // 签到功能
      if (path === '/api/checkin' && method === 'POST') {
        return await handleCheckIn(request, env);
      }
      if (path === '/api/checkin/records' && method === 'GET') {
        return await getCheckInRecords(request, env);
      }

      // 兑换码管理
      if (path === '/api/admin/codes/upload' && method === 'POST') {
        return await uploadCodes(request, env);
      }
      if (path === '/api/admin/codes/set-amount' && method === 'POST') {
        return await setCodeAmount(request, env);
      }
      if (path === '/api/admin/codes/inventory' && method === 'GET') {
        return await getInventory(request, env);
      }
      if (path === '/api/admin/codes/list' && method === 'GET') {
        return await listCodes(request, env);
      }
      if (path === '/api/admin/codes/clear-unused' && method === 'DELETE') {
        return await clearUnusedCodes(request, env);
      }
      if (path === '/api/admin/codes/stats' && method === 'GET') {
        return await getCodeStats(request, env);
      }

      // 分发功能
      if (path === '/api/admin/distribute/gift' && method === 'POST') {
        return await giftCodes(request, env);
      }
      if (path === '/api/admin/distribute/batch' && method === 'POST') {
        return await batchDistribute(request, env);
      }
      if (path === '/api/admin/distribute/pending' && method === 'POST') {
        return await resolvePending(request, env);
      }
      if (path === '/api/admin/distribute/pending-users' && method === 'GET') {
        return await getPendingUsers(request, env);
      }

      // 通知系统
      if (path === '/api/notifications' && method === 'GET') {
        return await getNotifications(request, env);
      }
      if (path.match(/^\/api\/notifications\/\d+\/read$/) && method === 'POST') {
        return await markNotificationRead(request, env);
      }
      if (path.match(/^\/api\/notifications\/\d+\/dismiss$/) && method === 'POST') {
        return await dismissNotification(request, env);
      }

      // 弹窗控制系统
      if (path === '/api/modal/check' && method === 'GET') {
        return await checkModalDisplay(request, env);
      }
      if (path === '/api/modal/display' && method === 'POST') {
        return await recordModalDisplay(request, env);
      }
      if (path === '/api/modal/dismiss' && method === 'POST') {
        return await dismissModal(request, env);
      }
      if (path === '/api/admin/modal/reset' && method === 'POST') {
        return await resetModalState(request, env);
      }

      // 管理员兑换记录
      if (path === '/api/admin/redemptions' && method === 'GET') {
        return await getAdminRedemptions(request, env);
      }

      // 404
      return errorResponse('未找到请求的资源', 404, env);
    } catch (error) {
      console.error('Error:', error);
      return errorResponse('服务器内部错误', 500, env);
    }
  },
};