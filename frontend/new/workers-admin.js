/**
 * KYX 签到系统 - 管理后台 V6
 * 支持用户名密码登录的管理后台界面
 * 时间精确到秒，货币单位统一为$，UTC+8时区
 */

// ============================================
// 时间和加密工具函数
// ============================================

function getUTC8Time() {
  const now = new Date();
  return new Date(now.getTime() + (8 * 60 * 60 * 1000));
}

function getUTC8TimestampString() {
  return getUTC8Time().toISOString().replace(/\.\d{3}Z$/, '');
}

function generateSalt() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 16; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPassword(password, hash, salt) {
  const computedHash = await hashPassword(password, salt);
  return computedHash === hash;
}

// ============================================
// 工具函数
// ============================================

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status: status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(),
    },
  });
}

function errorResponse(message, status = 500) {
  return jsonResponse({
    success: false,
    message: message
  }, status);
}

function htmlResponse(html) {
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      ...corsHeaders(),
    },
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

// ============================================
// 管理员认证函数
// ============================================

async function adminLogin(env, username, password) {
  try {
    const admin = await env.DB.prepare(`
      SELECT * FROM admins WHERE username = ? AND is_active = TRUE
    `).bind(username).first();
    
    if (!admin) {
      return { success: false, message: '用户名或密码错误' };
    }
    
    const isValid = await verifyPassword(password, admin.password_hash, admin.salt);
    if (!isValid) {
      return { success: false, message: '用户名或密码错误' };
    }
    
    const sessionId = generateRandomString(32);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    
    await env.DB.prepare(`
      INSERT INTO admin_sessions (session_id, admin_id, expires_at, created_at)
      VALUES (?, ?, ?, ?)
    `).bind(sessionId, admin.id, expiresAt.toISOString(), getUTC8Time().toISOString()).run();
    
    await env.DB.prepare(`
      UPDATE admins SET last_login_at = ? WHERE id = ?
    `).bind(getUTC8Time().toISOString(), admin.id).run();
    
    return { success: true, sessionId: sessionId, admin: admin };
  } catch (error) {
    console.error('Admin login error:', error);
    return { success: false, message: '登录失败' };
  }
}

async function verifyAdminSession(env, sessionId) {
  try {
    const session = await env.DB.prepare(`
      SELECT s.*, a.username, a.is_active
      FROM admin_sessions s
      JOIN admins a ON s.admin_id = a.id
      WHERE s.session_id = ? AND s.expires_at > ? AND s.is_active = TRUE AND a.is_active = TRUE
    `).bind(sessionId, getUTC8Time().toISOString()).first();
    
    if (session) {
      await env.DB.prepare(`
        UPDATE admin_sessions SET last_accessed_at = ? WHERE session_id = ?
      `).bind(getUTC8Time().toISOString(), sessionId).run();
    }
    
    return session;
  } catch (error) {
    console.error('Session verification error:', error);
    return null;
  }
}

async function adminLogout(env, sessionId) {
  try {
    await env.DB.prepare(`
      UPDATE admin_sessions SET is_active = FALSE WHERE session_id = ?
    `).bind(sessionId).run();
    return true;
  } catch (error) {
    console.error('Admin logout error:', error);
    return false;
  }
}

function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// ============================================
// 数据库操作函数
// ============================================

async function getStats(env) {
  try {
    // 获取兑换码统计
    const codeStats = await env.DB.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN is_distributed = 0 THEN 1 ELSE 0 END) as undistributed,
        SUM(CASE WHEN is_distributed = 1 THEN 1 ELSE 0 END) as distributed
      FROM redemption_codes
    `).first();

    // 获取用户统计
    const userStats = await env.DB.prepare(`
      SELECT COUNT(*) as total_users FROM users WHERE is_active = 1
    `).first();

    // 获取签到统计
    const checkinStats = await env.DB.prepare(`
      SELECT
        COUNT(*) as total_checkins,
        COUNT(DISTINCT user_id) as active_users,
        COUNT(DISTINCT check_in_date) as active_days
      FROM check_ins
      WHERE check_in_date >= date('now', '-30 days')
    `).first();

    return {
      total: codeStats?.total || 0,
      undistributed: codeStats?.undistributed || 0,
      distributed: codeStats?.distributed || 0,
      total_users: userStats?.total_users || 0,
      total_checkins: checkinStats?.total_checkins || 0,
      active_users: checkinStats?.active_users || 0,
      active_days: checkinStats?.active_days || 0
    };
  } catch (error) {
    console.error('Failed to get stats:', error);
    return {
      total: 0,
      undistributed: 0,
      distributed: 0,
      total_users: 0,
      total_checkins: 0,
      active_users: 0,
      active_days: 0
    };
  }
}

async function getCodes(env, page = 1, limit = 50) {
  try {
    const offset = (page - 1) * limit;

    // 获取兑换码列表
    const codes = await env.DB.prepare(`
      SELECT
        r.id,
        r.code,
        r.amount,
        r.is_used,
        r.is_distributed,
        r.used_by,
        r.used_at,
        r.distributed_to,
        r.distributed_at,
        r.distributed_by,
        r.distribution_type,
        r.batch_id,
        r.created_at,
        u.username as distributed_to_username,
        admin.username as distributed_by_admin
      FROM redemption_codes r
      LEFT JOIN users u ON r.distributed_to = u.id
      LEFT JOIN admins admin ON r.distributed_by = admin.id
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(limit, offset).all();

    // 获取总数
    const totalResult = await env.DB.prepare(`
      SELECT COUNT(*) as total FROM redemption_codes
    `).first();

    return {
      codes: codes.results || [],
      total: totalResult?.total || 0,
      page: page,
      limit: limit,
      totalPages: Math.ceil((totalResult?.total || 0) / limit)
    };
  } catch (error) {
    console.error('Failed to get codes:', error);
    return {
      codes: [],
      total: 0,
      page: page,
      limit: limit,
      totalPages: 0
    };
  }
}

async function searchCodes(env, query) {
  try {
    const codes = await env.DB.prepare(`
      SELECT
        r.id,
        r.code,
        r.amount,
        r.is_used,
        r.is_distributed,
        r.used_by,
        r.used_at,
        r.distributed_to,
        r.distributed_at,
        r.distributed_by,
        r.distribution_type,
        r.batch_id,
        r.created_at,
        u.username as distributed_to_username,
        admin.username as distributed_by_admin
      FROM redemption_codes r
      LEFT JOIN users u ON r.distributed_to = u.id
      LEFT JOIN admins admin ON r.distributed_by = admin.id
      WHERE r.code LIKE ? OR u.username LIKE ?
      ORDER BY r.created_at DESC
      LIMIT 100
    `).bind(`%${query}%`, `%${query}%`).all();

    return codes.results || [];
  } catch (error) {
    console.error('Failed to search codes:', error);
    return [];
  }
}

async function getUsers(env, page = 1, limit = 50) {
  try {
    const offset = (page - 1) * limit;

    const users = await env.DB.prepare(`
      SELECT
        u.id,
        u.linux_do_id,
        u.username,
        u.email,
        u.avatar_url,
        u.total_checkins,
        u.consecutive_days,
        u.max_consecutive_days,
        u.last_checkin_date,
        u.level,
        u.experience,
        u.created_at,
        u.updated_at,
        u.is_active,
        COUNT(DISTINCT c.id) as checkin_count,
        COUNT(DISTINCT r.id) as code_count,
        SUM(CASE WHEN r.is_distributed = 1 THEN r.amount ELSE 0 END) as total_amount
      FROM users u
      LEFT JOIN check_ins c ON u.id = c.user_id
      LEFT JOIN redemption_codes r ON u.id = r.distributed_to
      WHERE u.is_active = 1
      GROUP BY u.id
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(limit, offset).all();

    // 获取总数
    const totalResult = await env.DB.prepare(`
      SELECT COUNT(*) as total FROM users WHERE is_active = 1
    `).first();

    return {
      users: users.results || [],
      total: totalResult?.total || 0,
      page: page,
      limit: limit,
      totalPages: Math.ceil((totalResult?.total || 0) / limit)
    };
  } catch (error) {
    console.error('Failed to get users:', error);
    return {
      users: [],
      total: 0,
      page: page,
      limit: limit,
      totalPages: 0
    };
  }
}

async function getCheckins(env, page = 1, limit = 50) {
  try {
    const offset = (page - 1) * limit;

    const checkins = await env.DB.prepare(`
      SELECT
        c.id,
        c.user_id,
        c.check_in_date,
        c.check_in_time,
        c.redemption_code,
        c.consecutive_days,
        c.reward_amount,
        c.status,
        c.created_at,
        u.username,
        u.linux_do_id,
        u.avatar_url,
        r.amount as code_amount,
        r.is_used as code_is_used
      FROM check_ins c
      LEFT JOIN users u ON c.user_id = u.id
      LEFT JOIN redemption_codes r ON c.redemption_code = r.code
      ORDER BY c.check_in_time DESC
      LIMIT ? OFFSET ?
    `).bind(limit, offset).all();

    // 获取总数
    const totalResult = await env.DB.prepare(`
      SELECT COUNT(*) as total FROM check_ins
    `).first();

    return {
      checkins: checkins.results || [],
      total: totalResult?.total || 0,
      page: page,
      limit: limit,
      totalPages: Math.ceil((totalResult?.total || 0) / limit)
    };
  } catch (error) {
    console.error('Failed to get checkins:', error);
    return {
      checkins: [],
      total: 0,
      page: page,
      limit: limit,
      totalPages: 0
    };
  }
}

// ============================================
// API处理函数
// ============================================

async function handleStats(env) {
  try {
    const stats = await getStats(env);
    return jsonResponse({
      success: true,
      stats: {
        total: stats.total || 0,
        undistributed: stats.undistributed || 0,
        distributed: stats.distributed || 0,
        total_users: stats.total_users || 0,
        total_checkins: stats.total_checkins || 0,
        active_users: stats.active_users || 0,
        active_days: stats.active_days || 0
      }
    });
  } catch (error) {
    console.error('Handle stats error:', error);
    return errorResponse('获取统计数据失败', 500);
  }
}

async function handleCodes(request, env) {
  try {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const debug = url.searchParams.get('debug') === 'true';

    if (debug) {
      // 调试模式：直接查询数据库
      const rawCodes = await env.DB.prepare(`
        SELECT * FROM redemption_codes ORDER BY created_at DESC LIMIT 5
      `).all();

      const rawUsers = await env.DB.prepare(`
        SELECT * FROM users LIMIT 3
      `).all();

      return jsonResponse({
        success: true,
        debug: true,
        rawCodes: rawCodes,
        rawUsers: rawUsers,
        message: '调试数据'
      });
    }

    const result = await getCodes(env, page, limit);
    console.log('getCodes result:', result);

    return jsonResponse({
      success: true,
      codes: result.codes,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages
      }
    });
  } catch (error) {
    console.error('Handle codes error:', error);
    return errorResponse('获取兑换码列表失败: ' + error.message, 500);
  }
}

async function handleCodesSearch(request, env) {
  try {
    const url = new URL(request.url);
    const query = url.searchParams.get('q') || '';

    if (!query.trim()) {
      return errorResponse('搜索关键词不能为空', 400);
    }

    const codes = await searchCodes(env, query);
    return jsonResponse({
      success: true,
      codes: codes
    });
  } catch (error) {
    console.error('Handle codes search error:', error);
    return errorResponse('搜索兑换码失败', 500);
  }
}

async function handleUsers(request, env) {
  try {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const debug = url.searchParams.get('debug') === 'true';

    if (debug) {
      // 调试模式：直接查询数据库
      const rawUsers = await env.DB.prepare(`
        SELECT * FROM users WHERE is_active = 1 ORDER BY created_at DESC LIMIT 5
      `).all();

      const rawCheckins = await env.DB.prepare(`
        SELECT * FROM check_ins ORDER BY check_in_time DESC LIMIT 3
      `).all();

      return jsonResponse({
        success: true,
        debug: true,
        rawUsers: rawUsers,
        rawCheckins: rawCheckins,
        message: '用户调试数据'
      });
    }

    const result = await getUsers(env, page, limit);
    console.log('getUsers result:', result);

    return jsonResponse({
      success: true,
      users: result.users,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages
      }
    });
  } catch (error) {
    console.error('Handle users error:', error);
    return errorResponse('获取用户列表失败: ' + error.message, 500);
  }
}

async function handleCheckins(request, env) {
  try {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '50');

    const result = await getCheckins(env, page, limit);
    return jsonResponse({
      success: true,
      checkins: result.checkins,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages
      }
    });
  } catch (error) {
    console.error('Handle checkins error:', error);
    return errorResponse('获取签到记录失败', 500);
  }
}

// ============================================
// 新增管理功能
// ============================================

async function handleDeleteCode(request, env) {
  try {
    const data = await request.json();
    const { codeId, adminId } = data;

    if (!codeId || !adminId) {
      return errorResponse('参数不完整', 400);
    }

    // 检查兑换码是否存在
    const code = await env.DB.prepare(`
      SELECT * FROM redemption_codes WHERE id = ?
    `).bind(codeId).first();

    if (!code) {
      return errorResponse('兑换码不存在', 404);
    }

    if (code.is_used || code.is_distributed) {
      return errorResponse('已使用或已发放的兑换码不能删除', 400);
    }

    // 删除兑换码
    await env.DB.prepare(`
      DELETE FROM redemption_codes WHERE id = ?
    `).bind(codeId).run();

    // 记录操作日志
    await env.DB.prepare(`
      INSERT INTO operation_logs (
        operator_type, operator_id, operation_type, operation_detail,
        target_type, target_id, result, created_at
      ) VALUES ('admin', ?, 'delete', ?, 'code', ?, 'success', ?)
    `).bind(
      adminId,
      `删除兑换码: ${code.code}`,
      codeId,
      getUTC8TimestampString()
    ).run();

    return jsonResponse({
      success: true,
      message: '兑换码删除成功'
    });
  } catch (error) {
    console.error('Delete code error:', error);
    return errorResponse('删除兑换码失败: ' + error.message, 500);
  }
}

async function handleUserDetails(request, env) {
  try {
    const url = new URL(request.url);
    const userId = url.pathname.split('/').pop();

    if (!userId || isNaN(parseInt(userId))) {
      return errorResponse('用户ID无效', 400);
    }

    // 获取用户详细信息
    const user = await env.DB.prepare(`
      SELECT * FROM users WHERE id = ?
    `).bind(userId).first();

    if (!user) {
      return errorResponse('用户不存在', 404);
    }

    // 获取用户签到记录
    const checkins = await env.DB.prepare(`
      SELECT
        c.*,
        r.amount as code_amount
      FROM check_ins c
      LEFT JOIN redemption_codes r ON c.redemption_code = r.code
      WHERE c.user_id = ?
      ORDER BY c.check_in_time DESC
      LIMIT 20
    `).bind(userId).all();

    // 获取用户兑换码
    const codes = await env.DB.prepare(`
      SELECT * FROM redemption_codes
      WHERE distributed_to = ?
      ORDER BY distributed_at DESC
      LIMIT 20
    `).bind(userId).all();

    return jsonResponse({
      success: true,
      user: user,
      checkins: checkins.results || [],
      codes: codes.results || []
    });
  } catch (error) {
    console.error('Get user details error:', error);
    return errorResponse('获取用户详情失败', 500);
  }
}

async function handleGenerateCodes(request, env) {
  try {
    const data = await request.json();
    const { count, amount, adminId } = data;

    if (!count || !amount || !adminId || count <= 0 || amount <= 0) {
      return errorResponse('参数无效', 400);
    }

    if (count > 1000) {
      return errorResponse('单次生成数量不能超过1000个', 400);
    }

    const codes = [];
    const batchId = Date.now(); // 简单的批次ID

    for (let i = 0; i < count; i++) {
      const code = generateRandomString(12).toUpperCase();
      codes.push(code);
    }

    // 批量插入兑换码
    const insertPromises = codes.map(code =>
      env.DB.prepare(`
        INSERT INTO redemption_codes (code, amount, batch_id, created_at)
        VALUES (?, ?, ?, ?)
      `).bind(code, amount, batchId, getUTC8TimestampString()).run()
    );

    await Promise.all(insertPromises);

    // 记录操作日志
    await env.DB.prepare(`
      INSERT INTO operation_logs (
        operator_type, operator_id, operation_type, operation_detail,
        target_type, target_id, result, created_at
      ) VALUES ('admin', ?, 'generate', ?, 'batch', ?, 'success', ?)
    `).bind(
      adminId,
      `生成兑换码: ${count}个，金额: $${amount}`,
      batchId,
      getUTC8TimestampString()
    ).run();

    return jsonResponse({
      success: true,
      message: `成功生成${count}个兑换码`,
      codes: codes,
      batchId: batchId
    });
  } catch (error) {
    console.error('Generate codes error:', error);
    return errorResponse('生成兑换码失败: ' + error.message, 500);
  }
}

// ============================================
// 高级管理功能
// ============================================

async function handleCodesImport(request, env) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const amount = parseFloat(formData.get('amount') || '0');
    const adminId = formData.get('adminId');

    if (!file || !amount || amount <= 0) {
      return errorResponse('文件或金额参数无效', 400);
    }

    const fileContent = await file.text();
    const lines = fileContent.split('\n').map(line => line.trim()).filter(line => line.length > 0);

    if (lines.length === 0) {
      return errorResponse('文件内容为空', 400);
    }

    const validCodes = [];
    const invalidCodes = [];
    const duplicateCodes = [];

    for (const code of lines) {
      if (!/^[A-Za-z0-9]{6,20}$/.test(code)) {
        invalidCodes.push(code);
        continue;
      }

      const existing = await env.DB.prepare(`
        SELECT code FROM redemption_codes WHERE code = ?
      `).bind(code).first();

      if (existing) {
        duplicateCodes.push(code);
      } else {
        validCodes.push(code);
      }
    }

    const batchResult = await env.DB.prepare(`
      INSERT INTO upload_batches (
        filename, amount, total_codes, valid_codes, duplicate_codes, invalid_codes,
        uploaded_by, uploaded_at, processed_at, upload_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed')
    `).bind(
      file.name,
      amount,
      lines.length,
      validCodes.length,
      duplicateCodes.length,
      invalidCodes.length,
      adminId,
      getUTC8TimestampString(),
      getUTC8TimestampString()
    ).run();

    const batchId = batchResult.meta.last_row_id;

    if (validCodes.length > 0) {
      const insertPromises = validCodes.map(code =>
        env.DB.prepare(`
          INSERT INTO redemption_codes (code, amount, batch_id, created_at)
          VALUES (?, ?, ?, ?)
        `).bind(code, amount, batchId, getUTC8TimestampString()).run()
      );

      await Promise.all(insertPromises);
    }

    await env.DB.prepare(`
      INSERT INTO operation_logs (
        operator_type, operator_id, operation_type, operation_detail,
        target_type, target_id, result, created_at
      ) VALUES ('admin', ?, 'upload', ?, 'batch', ?, 'success', ?)
    `).bind(
      adminId,
      `导入兑换码文件: ${file.name}, 有效: ${validCodes.length}, 重复: ${duplicateCodes.length}, 无效: ${invalidCodes.length}`,
      batchId,
      getUTC8TimestampString()
    ).run();

    return jsonResponse({
      success: true,
      message: '兑换码导入完成',
      result: {
        batchId: batchId,
        totalCodes: lines.length,
        validCodes: validCodes.length,
        duplicateCodes: duplicateCodes.length,
        invalidCodes: invalidCodes.length,
        amount: amount
      }
    });

  } catch (error) {
    console.error('Import codes error:', error);
    return errorResponse('导入失败: ' + error.message, 500);
  }
}

async function handleBatchDistribute(request, env) {
  try {
    const data = await request.json();
    const { type, userIds, amount, adminId } = data;

    if (!type || !adminId) {
      return errorResponse('参数不完整', 400);
    }

    let targetUsers = [];

    if (type === 'all') {
      const users = await env.DB.prepare(`
        SELECT id FROM users WHERE is_active = TRUE
      `).all();
      targetUsers = users.results.map(u => u.id);
    } else if (type === 'selected' && userIds && userIds.length > 0) {
      targetUsers = userIds;
    } else {
      return errorResponse('无效的发放类型或用户列表', 400);
    }

    if (targetUsers.length === 0) {
      return errorResponse('没有找到目标用户', 400);
    }

    const availableCodes = await env.DB.prepare(`
      SELECT * FROM redemption_codes
      WHERE is_distributed = FALSE
      ${amount ? 'AND amount = ?' : ''}
      ORDER BY created_at ASC
      LIMIT ?
    `).bind(...(amount ? [amount, targetUsers.length] : [targetUsers.length])).all();

    if (availableCodes.results.length < targetUsers.length) {
      return errorResponse(`可用兑换码不足，需要 ${targetUsers.length} 个，只有 ${availableCodes.results.length} 个`, 400);
    }

    const distributedCodes = [];
    const failedUsers = [];

    for (let i = 0; i < targetUsers.length; i++) {
      const userId = targetUsers[i];
      const code = availableCodes.results[i];

      try {
        await env.DB.prepare(`
          UPDATE redemption_codes
          SET is_distributed = TRUE,
              distributed_to = ?,
              distributed_by = ?,
              distributed_at = ?,
              distribution_type = 'batch'
          WHERE code = ?
        `).bind(userId, adminId, getUTC8TimestampString(), code.code).run();

        distributedCodes.push({ userId, code: code.code, amount: code.amount });
      } catch (error) {
        console.error(`Failed to distribute to user ${userId}:`, error);
        failedUsers.push(userId);
      }
    }

    await env.DB.prepare(`
      INSERT INTO distribution_logs (
        admin_id, operation_type, target_users, amount,
        codes_distributed, codes_failed, status, notes, created_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      adminId,
      type === 'all' ? 'unified' : 'manual',
      JSON.stringify(targetUsers),
      amount || null,
      distributedCodes.length,
      failedUsers.length,
      failedUsers.length === 0 ? 'success' : 'partial',
      `批量发放兑换码，成功: ${distributedCodes.length}, 失败: ${failedUsers.length}`,
      getUTC8TimestampString(),
      getUTC8TimestampString()
    ).run();

    return jsonResponse({
      success: true,
      message: '批量发放完成',
      result: {
        distributed: distributedCodes.length,
        failed: failedUsers.length,
        totalUsers: targetUsers.length
      }
    });

  } catch (error) {
    console.error('Batch distribute error:', error);
    return errorResponse('批量发放失败: ' + error.message, 500);
  }
}

// ============================================
// HTML页面
// ============================================

function getAdminLoginHTML() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>管理员登录 - KYX 签到系统</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0f0f0f;
            color: #ffffff;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .login-container {
            background: #1a1a1a;
            border: 1px solid #333;
            border-radius: 12px;
            padding: 2rem;
            width: 100%;
            max-width: 400px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
        }
        .login-title {
            text-align: center;
            font-size: 1.5rem;
            font-weight: 600;
            margin-bottom: 2rem;
        }
        .form-group {
            margin-bottom: 1.5rem;
        }
        .form-label {
            display: block;
            margin-bottom: 0.5rem;
            font-weight: 500;
        }
        .form-input {
            width: 100%;
            background: #0f0f0f;
            border: 1px solid #333;
            color: #fff;
            padding: 1rem;
            border-radius: 8px;
            outline: none;
            transition: border-color 0.2s;
        }
        .form-input:focus {
            border-color: #0066cc;
        }
        .login-btn {
            width: 100%;
            background: #0066cc;
            color: white;
            border: none;
            padding: 1rem;
            border-radius: 8px;
            font-size: 1rem;
            font-weight: 500;
            cursor: pointer;
            transition: opacity 0.2s;
        }
        .login-btn:hover {
            opacity: 0.9;
        }
        .login-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
        .error-message {
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid #ef4444;
            color: #ef4444;
            padding: 1rem;
            border-radius: 8px;
            margin-bottom: 1.5rem;
            font-size: 0.9rem;
        }
    </style>
</head>
<body>
    <div class="login-container">
        <h1 class="login-title">⚙️ 管理后台</h1>
        <div id="messageContainer"></div>
        <form id="loginForm">
            <div class="form-group">
                <label class="form-label" for="username">用户名</label>
                <input type="text" id="username" name="username" class="form-input" required>
            </div>
            <div class="form-group">
                <label class="form-label" for="password">密码</label>
                <input type="password" id="password" name="password" class="form-input" required>
            </div>
            <button type="submit" class="login-btn" id="loginBtn">登录</button>
        </form>
    </div>
    <script>
        function showMessage(message, type = 'error') {
            const container = document.getElementById('messageContainer');
            container.innerHTML = '<div class="error-message">' + message + '</div>';
        }

        async function handleLogin(event) {
            event.preventDefault();
            const btn = document.getElementById('loginBtn');
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;

            if (!username || !password) {
                showMessage('请输入用户名和密码');
                return;
            }

            btn.disabled = true;
            btn.textContent = '登录中...';

            try {
                const response = await fetch('/api/admin/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                const data = await response.json();

                if (data.success) {
                    window.location.href = '/';
                } else {
                    showMessage(data.message || '登录失败');
                }
            } catch (error) {
                showMessage('登录失败，请稍后重试');
            } finally {
                btn.disabled = false;
                btn.textContent = '登录';
            }
        }

        document.getElementById('loginForm').addEventListener('submit', handleLogin);
    </script>
</body>
</html>`;
}

function getAdminPageHTML() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>管理后台 - KYX 签到系统</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0f0f0f;
            color: #ffffff;
            line-height: 1.6;
        }
        .admin-container {
            min-height: 100vh;
            display: flex;
            flex-direction: column;
        }
        .admin-header {
            background: #1a1a1a;
            border-bottom: 1px solid #333;
            padding: 0 1.5rem;
            height: 64px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .admin-logo {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            font-weight: 600;
            font-size: 1.25rem;
        }
        .admin-nav {
            display: flex;
            gap: 1rem;
        }
        .nav-tab {
            padding: 0.5rem 1rem;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;
            color: #b3b3b3;
            text-decoration: none;
            border: 1px solid transparent;
        }
        .nav-tab:hover {
            background: #0f0f0f;
            color: #fff;
            border-color: #333;
        }
        .nav-tab.active {
            background: #0066cc;
            color: white;
            border-color: #0066cc;
        }
        .admin-main {
            flex: 1;
            padding: 2rem;
            max-width: 1400px;
            margin: 0 auto;
            width: 100%;
        }
        .page-content {
            display: none;
        }
        .page-content.active {
            display: block;
        }
        .page-title {
            font-size: 2rem;
            font-weight: 700;
            margin-bottom: 2rem;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 1.5rem;
            margin-bottom: 2rem;
        }
        .stat-card {
            background: #1a1a1a;
            border: 1px solid #333;
            border-radius: 12px;
            padding: 2rem;
            text-align: center;
            transition: transform 0.2s;
        }
        .stat-card:hover {
            transform: translateY(-2px);
        }
        .stat-value {
            font-size: 2.5rem;
            font-weight: 700;
            margin-bottom: 0.5rem;
        }
        .stat-label {
            color: #b3b3b3;
            font-size: 0.95rem;
        }
        .card {
            background: #1a1a1a;
            border: 1px solid #333;
            border-radius: 12px;
            margin-bottom: 2rem;
        }
        .card-header {
            padding: 1.5rem;
            border-bottom: 1px solid #333;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .card-title {
            font-size: 1.25rem;
            font-weight: 600;
        }
        .card-body {
            padding: 1.5rem;
        }
        .btn {
            background: #0066cc;
            color: white;
            border: none;
            padding: 0.5rem 1rem;
            border-radius: 8px;
            cursor: pointer;
            transition: opacity 0.2s;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
        }
        .btn:hover {
            opacity: 0.9;
        }
        .btn-secondary {
            background: #666;
        }
        .input {
            background: #0f0f0f;
            border: 1px solid #333;
            color: #fff;
            padding: 0.5rem 1rem;
            border-radius: 8px;
            outline: none;
        }
        .input:focus {
            border-color: #0066cc;
        }
        .input-group {
            display: flex;
            gap: 0.5rem;
            margin-bottom: 1rem;
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th, td {
            padding: 1rem;
            text-align: left;
            border-bottom: 1px solid #333;
        }
        th {
            background: #0f0f0f;
            font-weight: 600;
            color: #b3b3b3;
            font-size: 0.875rem;
        }
        tr:hover {
            background: #0f0f0f;
        }
        .badge {
            display: inline-flex;
            align-items: center;
            padding: 0.25rem 0.5rem;
            border-radius: 6px;
            font-size: 0.75rem;
            font-weight: 600;
        }
        .badge-success {
            background: rgba(16, 185, 129, 0.2);
            color: #10b981;
        }
        .badge-warning {
            background: rgba(245, 158, 11, 0.2);
            color: #f59e0b;
        }
        .badge-info {
            background: rgba(59, 130, 246, 0.2);
            color: #3b82f6;
        }
        .btn-sm {
            padding: 0.375rem 0.75rem;
            font-size: 0.875rem;
        }
        tbody tr {
            transition: background-color 0.2s ease;
        }
        tbody tr:nth-child(even) {
            background: rgba(255, 255, 255, 0.02);
        }
        tbody tr:hover {
            background: rgba(255, 255, 255, 0.05) !important;
        }
        .loading-row {
            text-align: center;
            padding: 2rem;
            color: #666;
            font-style: italic;
        }
        .error-row {
            text-align: center;
            padding: 2rem;
            color: #dc3545;
            background: rgba(220, 53, 69, 0.1);
        }
        .empty-row {
            text-align: center;
            padding: 2rem;
            color: #666;
        }
        .toast {
            position: fixed;
            top: 1rem;
            right: 1rem;
            background: #1a1a1a;
            border: 1px solid #333;
            border-radius: 8px;
            padding: 1rem;
            z-index: 1000;
            transform: translateX(100%);
            transition: transform 0.3s;
            min-width: 300px;
        }
        .toast.show {
            transform: translateX(0);
        }
        .toast.success {
            border-color: #10b981;
            background: rgba(16, 185, 129, 0.1);
        }
        .toast.error {
            border-color: #ef4444;
            background: rgba(239, 68, 68, 0.1);
        }
    </style>
</head>
<body>
    <div class="admin-container">
        <header class="admin-header">
            <div class="admin-logo">
                <span>⚙️</span>
                <span>KYX 管理后台</span>
            </div>
            <nav class="admin-nav">
                <a href="#" class="nav-tab active" data-page="dashboard">📊 仪表盘</a>
                <a href="#" class="nav-tab" data-page="codes">🎫 兑换码</a>
                <a href="#" class="nav-tab" data-page="users">👥 用户</a>
                <a href="#" class="nav-tab" data-page="checkins">📅 签到</a>
                <button class="btn btn-secondary" onclick="logout()">登出</button>
            </nav>
        </header>
        <main class="admin-main">
            <div class="page-content active" id="page-dashboard">
                <h1 class="page-title">仪表盘</h1>
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-value" id="statTotal">-</div>
                        <div class="stat-label">总兑换码数</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value" id="statUndistributed">-</div>
                        <div class="stat-label">未发放</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value" id="statDistributed">-</div>
                        <div class="stat-label">已发放</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value" id="statRate">-</div>
                        <div class="stat-label">发放率</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value" id="statUsers">-</div>
                        <div class="stat-label">总用户数</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value" id="statCheckins">-</div>
                        <div class="stat-label">总签到次数</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value" id="statActiveUsers">-</div>
                        <div class="stat-label">活跃用户(30天)</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value" id="statActiveDays">-</div>
                        <div class="stat-label">活跃天数(30天)</div>
                    </div>
                </div>
                <div class="card">
                    <div class="card-header">
                        <h2 class="card-title">快速操作</h2>
                    </div>
                    <div class="card-body">
                        <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
                            <button class="btn" onclick="refreshStats()">🔄 刷新统计</button>
                            <button class="btn btn-secondary" onclick="showGenerateModal()">🎫 生成兑换码</button>
                            <button class="btn btn-secondary" onclick="showUploadModal()">📤 上传兑换码</button>
                        </div>
                    </div>
                </div>
            </div>
            <div class="page-content" id="page-codes">
                <h1 class="page-title">兑换码管理</h1>
                <div class="card">
                    <div class="card-header">
                        <h2 class="card-title">兑换码列表</h2>
                        <div class="input-group" style="margin-bottom: 0; width: 300px;">
                            <input type="text" class="input" placeholder="搜索兑换码..." id="codeSearch">
                            <button class="btn" onclick="searchCodes()">搜索</button>
                        </div>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>兑换码</th>
                                <th>金额</th>
                                <th>状态</th>
                                <th>发放给</th>
                                <th>创建时间</th>
                                <th>操作</th>
                            </tr>
                        </thead>
                        <tbody id="codesTableBody">
                            <tr>
                                <td colspan="6" style="text-align: center; padding: 2rem;">加载中...</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
            <div class="page-content" id="page-users">
                <h1 class="page-title">用户管理</h1>
                <div class="card">
                    <div class="card-header">
                        <h2 class="card-title">用户列表</h2>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>用户名</th>
                                <th>Linux Do ID</th>
                                <th>签到次数</th>
                                <th>兑换码数量</th>
                                <th>注册时间</th>
                                <th>操作</th>
                            </tr>
                        </thead>
                        <tbody id="usersTableBody">
                            <tr>
                                <td colspan="6" style="text-align: center; padding: 2rem;">加载中...</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
            <div class="page-content" id="page-checkins">
                <h1 class="page-title">签到记录</h1>
                <div class="card">
                    <div class="card-header">
                        <h2 class="card-title">签到记录</h2>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>用户</th>
                                <th>签到日期</th>
                                <th>兑换码</th>
                                <th>状态</th>
                                <th>签到时间</th>
                            </tr>
                        </thead>
                        <tbody id="checkinsTableBody">
                            <tr>
                                <td colspan="5" style="text-align: center; padding: 2rem;">加载中...</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </main>
    </div>
    <div id="toastContainer"></div>
    <script>
        let currentPage = 'dashboard';

        function showToast(message, type = 'info') {
            const toast = document.createElement('div');
            toast.className = 'toast ' + type;
            toast.textContent = message;
            document.getElementById('toastContainer').appendChild(toast);
            setTimeout(() => toast.classList.add('show'), 100);
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }

        async function apiRequest(url, options = {}) {
            try {
                console.log('API Request:', url, options);
                const response = await fetch(url, {
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json', ...options.headers },
                    ...options
                });

                console.log('API Response status:', response.status);

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('API Error:', response.status, errorText);
                    throw new Error('HTTP ' + response.status + ': ' + errorText);
                }

                const data = await response.json();
                console.log('API Response data:', data);
                return data;
            } catch (error) {
                console.error('API Request failed:', error);
                throw error;
            }
        }

        function switchPage(pageName) {
            console.log('🔄 Switching to page:', pageName);

            try {
                // 更新导航标签状态
                document.querySelectorAll('.nav-tab').forEach(tab => {
                    tab.classList.remove('active');
                    if (tab.dataset.page === pageName) {
                        tab.classList.add('active');
                        console.log('✅ Activated nav tab:', pageName);
                    }
                });

                // 更新页面内容显示
                document.querySelectorAll('.page-content').forEach(page => {
                    page.classList.remove('active');
                });

                const targetPage = document.getElementById('page-' + pageName);
                if (targetPage) {
                    targetPage.classList.add('active');
                    console.log('✅ Activated page content:', pageName);
                } else {
                    console.error('❌ Page content not found:', 'page-' + pageName);
                    showToast('页面不存在: ' + pageName, 'error');
                    return;
                }

                currentPage = pageName;

                // 加载页面数据
                loadPageData(pageName);

            } catch (error) {
                console.error('❌ Error switching page:', error);
                showToast('切换页面失败: ' + error.message, 'error');
            }
        }

        async function loadPageData(pageName) {
            console.log('📊 Loading data for page:', pageName);

            try {
                switch (pageName) {
                    case 'dashboard':
                        await loadDashboardData();
                        break;
                    case 'codes':
                        await loadCodesData();
                        break;
                    case 'users':
                        await loadUsersData();
                        break;
                    case 'checkins':
                        await loadCheckinsData();
                        break;
                    default:
                        console.warn('⚠️ Unknown page:', pageName);
                }
            } catch (error) {
                console.error('❌ Error loading page data:', error);
                showToast('加载页面数据失败: ' + error.message, 'error');
            }
        }

        async function loadDashboardData() {
            console.log('📊 Loading dashboard data...');
            try {
                const data = await apiRequest('/api/admin/stats');
                console.log('📊 Dashboard data received:', data);

                if (data && data.success && data.stats) {
                    // 更新统计数据，添加空值检查
                    const updateStat = (id, value) => {
                        const element = document.getElementById(id);
                        if (element) {
                            element.textContent = value || 0;
                        } else {
                            console.warn('⚠️ Element not found:', id);
                        }
                    };

                    updateStat('statTotal', data.stats.total);
                    updateStat('statUndistributed', data.stats.undistributed);
                    updateStat('statDistributed', data.stats.distributed);

                    const rate = data.stats.total > 0 ?
                        ((data.stats.distributed / data.stats.total) * 100).toFixed(1) + '%' : '0%';
                    updateStat('statRate', rate);

                    updateStat('statUsers', data.stats.total_users);
                    updateStat('statCheckins', data.stats.total_checkins);
                    updateStat('statActiveUsers', data.stats.active_users);
                    updateStat('statActiveDays', data.stats.active_days);

                    console.log('✅ Dashboard data loaded successfully');
                } else {
                    console.error('❌ Invalid dashboard data:', data);
                    showToast('获取统计数据失败: ' + (data?.message || '数据格式错误'), 'error');
                }
            } catch (error) {
                console.error('❌ Load dashboard error:', error);
                showToast('加载仪表盘数据失败: ' + error.message, 'error');
            }
        }

        async function loadCodesData() {
            console.log('🎫 Loading codes data...');
            try {
                const data = await apiRequest('/api/admin/codes?page=1&limit=50');
                console.log('🎫 Codes data received:', data);

                const tbody = document.getElementById('codesTableBody');
                if (!tbody) {
                    console.error('❌ codesTableBody element not found');
                    showToast('页面元素缺失，请刷新页面', 'error');
                    return;
                }

                if (data && data.success) {
                    const codes = data.codes || [];
                    console.log('🎫 Processing', codes.length, 'codes');

                    if (codes.length === 0) {
                        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: #666;">暂无兑换码</td></tr>';
                        return;
                    }

                    const rows = codes.map(code => {
                        const safeCode = (code.code || '').replace(/'/g, "\\'");
                        return '<tr>' +
                            '<td style="font-family: monospace; font-weight: bold;">' + (code.code || '') + '</td>' +
                            '<td style="color: #28a745; font-weight: bold;">$' + parseFloat(code.amount || 0).toFixed(2) + '</td>' +
                            '<td><span class="badge ' + (code.is_distributed ? 'badge-success' : 'badge-warning') + '">' +
                            (code.is_distributed ? '已发放' : '未发放') + '</span></td>' +
                            '<td>' + (code.distributed_to_username || '-') + '</td>' +
                            '<td>' + (code.created_at ? new Date(code.created_at).toLocaleDateString('zh-CN') : '-') + '</td>' +
                            '<td><button class="btn btn-secondary btn-sm" onclick="viewCodeDetails(\'' + safeCode + '\')">查看</button></td>' +
                            '</tr>';
                    });

                    tbody.innerHTML = rows.join('');
                    console.log('✅ Codes table updated with', codes.length, 'rows');
                } else {
                    console.error('❌ Invalid codes data:', data);
                    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: #dc3545;">获取兑换码失败: ' +
                        (data?.message || '未知错误') + '</td></tr>';
                    showToast('获取兑换码失败: ' + (data?.message || '未知错误'), 'error');
                }
            } catch (error) {
                console.error('❌ Load codes error:', error);
                const tbody = document.getElementById('codesTableBody');
                if (tbody) {
                    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: #dc3545;">加载失败: ' +
                        error.message + '</td></tr>';
                }
                showToast('加载兑换码数据失败: ' + error.message, 'error');
            }
        }

        async function loadUsersData() {
            console.log('👥 Loading users data...');
            try {
                const data = await apiRequest('/api/admin/users?page=1&limit=50');
                console.log('👥 Users data received:', data);

                const tbody = document.getElementById('usersTableBody');
                if (!tbody) {
                    console.error('❌ usersTableBody element not found');
                    showToast('页面元素缺失，请刷新页面', 'error');
                    return;
                }

                if (data && data.success) {
                    const users = data.users || [];
                    console.log('👥 Processing', users.length, 'users');

                    if (users.length === 0) {
                        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: #666;">暂无用户</td></tr>';
                        return;
                    }

                    const rows = users.map(user =>
                        '<tr>' +
                        '<td style="font-weight: bold;">' + (user.username || '') + '</td>' +
                        '<td>' + (user.linux_do_id || '') + '</td>' +
                        '<td><span class="badge badge-info">' + (user.checkin_count || 0) + '</span></td>' +
                        '<td><span class="badge badge-success">' + (user.code_count || 0) + '</span></td>' +
                        '<td>' + (user.created_at ? new Date(user.created_at).toLocaleDateString('zh-CN') : '-') + '</td>' +
                        '<td><button class="btn btn-secondary btn-sm" onclick="viewUserDetails(' + (user.id || 0) + ')">查看</button></td>' +
                        '</tr>'
                    );

                    tbody.innerHTML = rows.join('');
                    console.log('✅ Users table updated with', users.length, 'rows');
                } else {
                    console.error('❌ Invalid users data:', data);
                    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: #dc3545;">获取用户失败: ' +
                        (data?.message || '未知错误') + '</td></tr>';
                    showToast('获取用户失败: ' + (data?.message || '未知错误'), 'error');
                }
            } catch (error) {
                console.error('❌ Load users error:', error);
                const tbody = document.getElementById('usersTableBody');
                if (tbody) {
                    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: #dc3545;">加载失败: ' +
                        error.message + '</td></tr>';
                }
                showToast('加载用户数据失败: ' + error.message, 'error');
            }
        }

        async function loadCheckinsData() {
            console.log('📅 Loading checkins data...');
            try {
                const data = await apiRequest('/api/admin/checkins?page=1&limit=50');
                console.log('📅 Checkins data received:', data);

                const tbody = document.getElementById('checkinsTableBody');
                if (!tbody) {
                    console.error('❌ checkinsTableBody element not found');
                    showToast('页面元素缺失，请刷新页面', 'error');
                    return;
                }

                if (data && data.success) {
                    const checkins = data.checkins || [];
                    console.log('📅 Processing', checkins.length, 'checkins');

                    if (checkins.length === 0) {
                        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem; color: #666;">暂无签到记录</td></tr>';
                        return;
                    }

                    const rows = checkins.map(checkin =>
                        '<tr>' +
                        '<td style="font-weight: bold;">' + (checkin.username || '') + '</td>' +
                        '<td>' + (checkin.check_in_date || '') + '</td>' +
                        '<td style="font-family: monospace; color: #007bff;">' + (checkin.redemption_code || '-') + '</td>' +
                        '<td><span class="badge ' + (checkin.status === 'completed' ? 'badge-success' : 'badge-warning') + '">' +
                        (checkin.status === 'completed' ? '已完成' : '待分配') + '</span></td>' +
                        '<td>' + (checkin.check_in_time ? new Date(checkin.check_in_time).toLocaleString('zh-CN') : '-') + '</td>' +
                        '</tr>'
                    );

                    tbody.innerHTML = rows.join('');
                    console.log('✅ Checkins table updated with', checkins.length, 'rows');
                } else {
                    console.error('❌ Invalid checkins data:', data);
                    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem; color: #dc3545;">获取签到数据失败: ' +
                        (data?.message || '未知错误') + '</td></tr>';
                    showToast('获取签到数据失败: ' + (data?.message || '未知错误'), 'error');
                }
            } catch (error) {
                console.error('❌ Load checkins error:', error);
                const tbody = document.getElementById('checkinsTableBody');
                if (tbody) {
                    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem; color: #dc3545;">加载失败: ' +
                        error.message + '</td></tr>';
                }
                showToast('加载签到数据失败: ' + error.message, 'error');
            }
        }

        async function refreshStats() {
            await loadDashboardData();
            showToast('统计数据已刷新', 'success');
        }

        function showGenerateModal() {
            const count = prompt('请输入要生成的兑换码数量 (1-1000):', '10');
            if (!count || isNaN(count) || count <= 0 || count > 1000) {
                showToast('请输入有效的数量 (1-1000)', 'error');
                return;
            }

            const amount = prompt('请输入兑换码金额 ($):', '10.00');
            if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
                showToast('请输入有效的金额', 'error');
                return;
            }

            generateCodes(parseInt(count), parseFloat(amount));
        }

        async function generateCodes(count, amount) {
            try {
                const data = await apiRequest('/api/admin/codes/generate', {
                    method: 'POST',
                    body: JSON.stringify({
                        count: count,
                        amount: amount,
                        adminId: 1 // TODO: 从session获取真实的admin ID
                    })
                });

                if (data.success) {
                    showToast(data.message, 'success');
                    if (currentPage === 'codes') {
                        await loadCodesData();
                    }
                    await loadDashboardData();
                } else {
                    showToast(data.message || '生成失败', 'error');
                }
            } catch (error) {
                console.error('Generate codes error:', error);
                showToast('生成兑换码失败: ' + error.message, 'error');
            }
        }

        function showUploadModal() {
            showToast('上传功能正在开发中', 'info');
        }

        async function searchCodes() {
            const query = document.getElementById('codeSearch').value;
            if (!query.trim()) {
                await loadCodesData();
                return;
            }
            try {
                const data = await apiRequest('/api/admin/codes/search?q=' + encodeURIComponent(query));
                if (data.success) {
                    const tbody = document.getElementById('codesTableBody');
                    if (data.codes.length === 0) {
                        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem;">未找到匹配的兑换码</td></tr>';
                        return;
                    }
                    tbody.innerHTML = data.codes.map(code =>
                        '<tr>' +
                        '<td style="font-family: monospace;">' + code.code + '</td>' +
                        '<td>$' + parseFloat(code.amount).toFixed(2) + '</td>' +
                        '<td><span class="badge ' + (code.is_distributed ? 'badge-success' : 'badge-warning') + '">' +
                        (code.is_distributed ? '已发放' : '未发放') + '</span></td>' +
                        '<td>' + (code.distributed_to_username || '-') + '</td>' +
                        '<td>' + new Date(code.created_at).toLocaleDateString() + '</td>' +
                        '<td><button class="btn btn-secondary" onclick="viewCodeDetails(\'' + code.code + '\')">查看</button></td>' +
                        '</tr>'
                    ).join('');
                }
            } catch (error) {
                showToast('搜索失败', 'error');
            }
        }

        function viewCodeDetails(code) {
            showToast('查看兑换码 ' + code + ' 的详情功能正在开发中', 'info');
        }

        function viewUserDetails(userId) {
            showToast('查看用户 ' + userId + ' 的详情功能正在开发中', 'info');
        }

        async function logout() {
            try {
                await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' });
                window.location.href = '/login';
            } catch (error) {
                showToast('登出失败', 'error');
            }
        }

        // 初始化管理面板
        function initializeAdminPanel() {
            console.log('🚀 Initializing admin panel...');

            try {
                // 绑定导航事件
                const navTabs = document.querySelectorAll('.nav-tab');
                console.log('📋 Found nav tabs:', navTabs.length);

                navTabs.forEach(tab => {
                    tab.addEventListener('click', (e) => {
                        e.preventDefault();
                        const pageName = tab.dataset.page;
                        console.log('🔄 Switching to page:', pageName);
                        if (pageName) switchPage(pageName);
                    });
                });

                // 绑定搜索事件
                const searchInput = document.getElementById('codeSearch');
                if (searchInput) {
                    console.log('🔍 Binding search input');
                    searchInput.addEventListener('keypress', (e) => {
                        if (e.key === 'Enter') searchCodes();
                    });
                } else {
                    console.warn('⚠️ Search input not found');
                }

                // 绑定其他按钮事件
                const refreshBtn = document.getElementById('refreshStats');
                if (refreshBtn) {
                    refreshBtn.addEventListener('click', refreshStats);
                }

                const generateBtn = document.getElementById('generateCodes');
                if (generateBtn) {
                    generateBtn.addEventListener('click', showGenerateModal);
                }

                // 检查必要的DOM元素
                const requiredElements = ['codesTableBody', 'usersTableBody', 'checkinsTableBody'];
                const missingElements = requiredElements.filter(id => !document.getElementById(id));

                if (missingElements.length > 0) {
                    console.error('❌ Missing required elements:', missingElements);
                    showToast('页面元素缺失，请刷新页面', 'error');
                    return;
                }

                console.log('✅ All required elements found');

                // 加载初始数据
                console.log('📊 Loading initial dashboard data...');
                loadPageData('dashboard');

            } catch (error) {
                console.error('❌ Failed to initialize admin panel:', error);
                showToast('初始化失败: ' + error.message, 'error');
            }
        }

        // 等待DOM加载完成后初始化
        if (document.readyState === 'loading') {
            console.log('⏳ Waiting for DOM to load...');
            document.addEventListener('DOMContentLoaded', initializeAdminPanel);
        } else {
            console.log('✅ DOM already loaded, initializing immediately...');
            // 延迟一点确保所有元素都已渲染
            setTimeout(initializeAdminPanel, 100);
        }
    </script>
</body>
</html>`;
}

// ============================================
// 主路由处理
// ============================================

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // 处理 CORS 预检请求
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: corsHeaders(),
      });
    }

    try {
      // 登录页面路由
      if (method === 'GET' && path === '/login') {
        return htmlResponse(getAdminLoginHTML());
      }

      // 主页面路由（需要验证）
      if (method === 'GET' && path === '/') {
        const sessionId = request.headers.get('cookie')?.match(/admin_session=([^;]+)/)?.[1];
        if (sessionId) {
          const session = await verifyAdminSession(env, sessionId);
          if (session) {
            return htmlResponse(getAdminPageHTML());
          }
        }
        return new Response('', {
          status: 302,
          headers: {
            'Location': '/login',
            ...corsHeaders(),
          },
        });
      }

      // 管理员登录API
      if (path === '/api/admin/login' && method === 'POST') {
        try {
          const data = await request.json();
          const { username, password } = data;

          const result = await adminLogin(env, username, password);

          if (result.success) {
            return new Response(JSON.stringify({ success: true, message: '登录成功' }), {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                'Set-Cookie': `admin_session=${result.sessionId}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${24 * 60 * 60}`,
                ...corsHeaders(),
              },
            });
          } else {
            return jsonResponse({ success: false, message: result.message });
          }
        } catch (error) {
          console.error('Admin login error:', error);
          return errorResponse('登录失败', 500);
        }
      }

      // 管理员登出API
      if (path === '/api/admin/logout' && method === 'POST') {
        const sessionId = request.headers.get('cookie')?.match(/admin_session=([^;]+)/)?.[1];
        if (sessionId) {
          await adminLogout(env, sessionId);
        }
        return new Response('', {
          status: 302,
          headers: {
            'Location': '/login',
            'Set-Cookie': 'admin_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0',
            ...corsHeaders(),
          },
        });
      }

      // API路由（需要验证）
      if (path.startsWith('/api/admin/')) {
        const sessionId = request.headers.get('cookie')?.match(/admin_session=([^;]+)/)?.[1];
        if (!sessionId) {
          return errorResponse('未登录', 401);
        }

        const session = await verifyAdminSession(env, sessionId);
        if (!session) {
          return errorResponse('会话无效', 401);
        }

        switch (path) {
          case '/api/admin/stats':
            if (method === 'GET') {
              return await handleStats(env);
            }
            break;

          case '/api/admin/codes':
            if (method === 'GET') {
              return await handleCodes(request, env);
            }
            break;

          case '/api/admin/codes/search':
            if (method === 'GET') {
              return await handleCodesSearch(request, env);
            }
            break;

          case '/api/admin/codes/import':
            if (method === 'POST') {
              return await handleCodesImport(request, env);
            }
            break;

          case '/api/admin/codes/generate':
            if (method === 'POST') {
              return await handleGenerateCodes(request, env);
            }
            break;

          case '/api/admin/codes/delete':
            if (method === 'POST') {
              return await handleDeleteCode(request, env);
            }
            break;

          case '/api/admin/distribute':
            if (method === 'POST') {
              return await handleBatchDistribute(request, env);
            }
            break;

          case '/api/admin/users':
            if (method === 'GET') {
              return await handleUsers(request, env);
            }
            break;

          case '/api/admin/checkins':
            if (method === 'GET') {
              return await handleCheckins(request, env);
            }
            break;
        }

        // 处理用户详情API (动态路由)
        if (path.startsWith('/api/admin/users/') && method === 'GET') {
          return await handleUserDetails(request, env);
        }
      }

      // 404 处理
      return errorResponse('页面未找到', 404);

    } catch (error) {
      console.error('Request error:', error);
      return errorResponse('服务器内部错误', 500);
    }
  }
};
