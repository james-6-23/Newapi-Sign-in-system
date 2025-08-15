/**
 * KYX 签到系统 - 用户端 V7 (集成 KV 缓存)
 * 包含登录页面、主页面和用户相关的后端逻辑
 * 支持连续签到奖励、用户等级、完整统计等功能
 * 时间精确到秒，货币单位统一为$，UTC+8时区
 * 
 * 新增 KV 缓存支持，大幅提升性能
 *
 * 环境变量要求：
 * - OAUTH_CLIENT_ID: Linux Do OAuth2 客户端ID
 * - OAUTH_CLIENT_SECRET: Linux Do OAuth2 客户端密钥
 * 
 * 可选环境变量：
 * - FRONTEND_URL: 前端URL（用于CORS和OAuth回调，默认使用当前域名）
 *
 * 绑定要求：
 * - DB: D1数据库实例
 * - KV: KV命名空间实例
 */

// 导入 KV 缓存工具
import {
  getCachedSession,
  cacheUserSession,
  deleteCachedSession,
  getCachedUserStats,
  cacheUserStats,
  getCachedCheckinRewards,
  cacheCheckinRewards,
  getCachedInventory,
  updateInventoryCache,
  getOrCompute,
  cacheHealthCheck
} from './kv-cache-utils.js';

// ============================================
// 时间工具函数
// ============================================

function getUTC8Time() {
  const now = new Date();
  return new Date(now.getTime() + (8 * 60 * 60 * 1000));
}

function getUTC8DateString() {
  return getUTC8Time().toISOString().split('T')[0];
}

function getUTC8TimestampString() {
  return getUTC8Time().toISOString().replace(/\.\d{3}Z$/, '');
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
// 响应工具函数
// ============================================

function corsHeaders(env, request = null) {
  let allowOrigin = '*';
  if (env.FRONTEND_URL) {
    allowOrigin = env.FRONTEND_URL;
  } else if (request) {
    const origin = request.headers.get('Origin');
    if (origin) {
      allowOrigin = origin;
    }
  }
  
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  };
}

function jsonResponse(data, status = 200, env, request = null) {
  return new Response(JSON.stringify(data), {
    status: status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(env, request),
    },
  });
}

function errorResponse(message, status = 400, env, request = null) {
  return jsonResponse({ error: message }, status, env, request);
}

function htmlResponse(html, status = 200, env, request = null) {
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      ...corsHeaders(env, request),
    },
  });
}

// ============================================
// 会话管理（KV 优化版）
// ============================================

/**
 * 创建用户会话（优先使用 KV）
 */
async function createSession(env, userId) {
  const sessionId = generateRandomString(32);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7天后过期
  
  // 同时写入数据库和 KV
  await env.DB.prepare(`
    INSERT INTO sessions (session_id, user_id, expires_at, created_at)
    VALUES (?, ?, ?, datetime('now'))
  `).bind(sessionId, userId, expiresAt.toISOString()).run();
  
  // 缓存会话信息到 KV
  const sessionData = {
    session_id: sessionId,
    user_id: userId,
    expires_at: expiresAt.toISOString(),
    created_at: new Date().toISOString()
  };
  
  await cacheUserSession(env, sessionId, sessionData);
  
  return sessionId;
}

/**
 * 获取会话信息（优先从 KV 读取）
 */
async function getSession(env, sessionId) {
  // 先尝试从 KV 获取
  let session = await getCachedSession(env, sessionId);
  
  if (!session) {
    // KV 未命中，从数据库查询
    session = await env.DB.prepare(`
      SELECT s.*, u.username, u.linux_do_id, u.email, u.avatar_url
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.session_id = ? AND s.expires_at > datetime('now')
    `).bind(sessionId).first();
    
    if (session) {
      // 回写到 KV
      await cacheUserSession(env, sessionId, session);
    }
  }
  
  return session;
}

/**
 * 删除会话（同时清理 KV 和数据库）
 */
async function deleteSession(env, sessionId) {
  // 从数据库删除
  await env.DB.prepare('DELETE FROM sessions WHERE session_id = ?').bind(sessionId).run();
  
  // 从 KV 删除
  await deleteCachedSession(env, sessionId);
}

// ============================================
// 用户统计（KV 优化版）
// ============================================

/**
 * 获取用户签到统计（优先从 KV 读取）
 */
async function getCheckInStats(env, userId) {
  // 先尝试从 KV 获取
  let stats = await getCachedUserStats(env, userId);
  
  if (!stats) {
    // KV 未命中，从数据库计算
    const user = await env.DB.prepare(`
      SELECT
        total_checkins,
        consecutive_days,
        max_consecutive_days,
        last_checkin_date,
        level,
        experience
      FROM users WHERE id = ?
    `).bind(userId).first();

    if (!user) {
      return null;
    }

    // 获取最近30天签到次数
    const thirtyDaysAgo = new Date(getUTC8Time().getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const recentStats = await env.DB.prepare(`
      SELECT COUNT(*) as last_30_days
      FROM check_ins
      WHERE user_id = ? AND check_in_date >= ?
    `).bind(userId, thirtyDaysAgo).first();

    stats = {
      total_checkins: user.total_checkins || 0,
      consecutive_days: user.consecutive_days || 0,
      max_consecutive_days: user.max_consecutive_days || 0,
      last_checkin_date: user.last_checkin_date,
      level: user.level || 1,
      experience: user.experience || 0,
      last_30_days: recentStats.last_30_days || 0
    };
    
    // 缓存到 KV（1小时）
    await cacheUserStats(env, userId, stats);
  }
  
  return stats;
}

// ============================================
// 签到奖励配置（KV 优化版）
// ============================================

/**
 * 获取签到奖励配置（优先从 KV 读取）
 */
async function getCheckinRewards(env) {
  // 先尝试从 KV 获取
  let rewards = await getCachedCheckinRewards(env);
  
  if (!rewards) {
    // KV 未命中，从数据库查询
    const result = await env.DB.prepare(`
      SELECT * FROM checkin_rewards
      WHERE is_active = TRUE
      ORDER BY consecutive_days ASC
    `).all();
    
    rewards = result.results || [];
    
    // 缓存到 KV（24小时）
    await cacheCheckinRewards(env, rewards);
  }
  
  return rewards;
}

// ============================================
// 库存管理（KV 优化版）
// ============================================

/**
 * 获取库存统计（优先从 KV 读取）
 */
async function getInventoryStats(env) {
  // 先尝试从 KV 获取
  let inventory = await getCachedInventory(env);
  
  if (!inventory) {
    // KV 未命中，从数据库查询
    const result = await env.DB.prepare(`
      SELECT
        amount,
        COUNT(*) as total,
        SUM(CASE WHEN is_distributed = FALSE THEN 1 ELSE 0 END) as available
      FROM redemption_codes
      GROUP BY amount
      ORDER BY amount ASC
    `).all();
    
    inventory = {};
    for (const row of result.results || []) {
      inventory[row.amount] = {
        total: row.total,
        available: row.available,
        distributed: row.total - row.available
      };
    }
    
    // 缓存到 KV（30分钟）
    await cacheInventory(env, inventory);
  }
  
  return inventory;
}

// ============================================
// 高性能签到处理
// ============================================

/**
 * 执行签到（集成 KV 缓存）
 */
async function performCheckIn(env, userId) {
  const today = getUTC8DateString();
  
  // 检查今天是否已签到
  const existingCheckIn = await env.DB.prepare(`
    SELECT * FROM check_ins WHERE user_id = ? AND check_in_date = ?
  `).bind(userId, today).first();
  
  if (existingCheckIn) {
    return { success: false, message: '今天已经签到过了' };
  }
  
  // 获取签到奖励配置（从 KV 缓存）
  const rewards = await getCheckinRewards(env);
  
  // 计算连续签到天数
  const consecutiveDays = await calculateConsecutiveDays(env, userId);
  
  // 确定奖励金额
  let rewardAmount = 5.00; // 默认奖励
  for (const reward of rewards) {
    if (consecutiveDays >= reward.consecutive_days) {
      rewardAmount = reward.reward_amount;
    }
  }
  
  // 查找可用的兑换码（优先使用缓存的库存信息）
  const codes = await env.DB.prepare(`
    SELECT * FROM redemption_codes
    WHERE is_distributed = FALSE AND amount >= ?
    ORDER BY amount ASC, created_at ASC
    LIMIT 1
  `).bind(rewardAmount).all();
  
  if (!codes.results || codes.results.length === 0) {
    // 没有可用兑换码，记录签到但不发放
    await env.DB.prepare(`
      INSERT INTO check_ins (
        user_id, check_in_date, check_in_time,
        consecutive_days, reward_amount, status
      ) VALUES (?, ?, ?, ?, ?, 'pending')
    `).bind(userId, today, getUTC8TimestampString(), consecutiveDays, rewardAmount).run();
    
    return { success: false, message: '签到成功，但暂无可用兑换码，请联系管理员' };
  }
  
  const code = codes.results[0];
  
  // 标记兑换码为已发放
  await env.DB.prepare(`
    UPDATE redemption_codes
    SET is_distributed = TRUE,
        distributed_to = ?,
        distributed_at = ?,
        distribution_type = 'checkin'
    WHERE code = ?
  `).bind(userId, getUTC8TimestampString(), code.code).run();
  
  // 记录签到
  await env.DB.prepare(`
    INSERT INTO check_ins (
      user_id, check_in_date, check_in_time, redemption_code,
      consecutive_days, reward_amount, status
    ) VALUES (?, ?, ?, ?, ?, ?, 'completed')
  `).bind(userId, today, getUTC8TimestampString(), code.code, consecutiveDays, rewardAmount).run();
  
  // 更新用户统计
  await env.DB.prepare(`
    UPDATE users SET
      total_checkins = total_checkins + 1,
      consecutive_days = ?,
      max_consecutive_days = MAX(max_consecutive_days, ?),
      last_checkin_date = ?,
      experience = experience + ?
    WHERE id = ?
  `).bind(consecutiveDays, consecutiveDays, today, Math.floor(rewardAmount), userId).run();
  
  // 更新 KV 缓存
  await updateInventoryCache(env, code.amount, -1);
  
  // 清除用户统计缓存（强制下次重新计算）
  await clearUserCache(env, userId);
  
  return {
    success: true,
    message: '签到成功！',
    data: {
      code: code.code,
      amount: code.amount,
      consecutiveDays: consecutiveDays,
      rewardAmount: rewardAmount
    }
  };
}

// ============================================
// 主路由处理
// ============================================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS 预检请求
    if (method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders(env, request),
      });
    }

    try {
      // KV 健康检查（可选）
      if (path === '/api/health/kv') {
        const isHealthy = await cacheHealthCheck(env);
        return jsonResponse({
          success: true,
          kv_healthy: isHealthy,
          timestamp: new Date().toISOString()
        }, 200, env, request);
      }

      // 其他路由处理...
      // 这里可以继续添加其他路由的处理逻辑
      
      return new Response('Not Found', {
        status: 404,
        headers: corsHeaders(env, request)
      });

    } catch (error) {
      console.error('Request error:', error);
      return errorResponse('Internal Server Error', 500, env, request);
    }
  },
};
