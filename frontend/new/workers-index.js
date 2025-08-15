/**
 * KYX 签到系统 - 用户端 V6
 * 包含登录页面、主页面和用户相关的后端逻辑
 * 支持连续签到奖励、用户等级、完整统计等功能
 * 时间精确到秒，货币单位统一为$，UTC+8时区
 *
 * 环境变量要求：
 * - OAUTH_CLIENT_ID: Linux Do OAuth2 客户端ID
 * - OAUTH_CLIENT_SECRET: Linux Do OAuth2 客户端密钥
 *
 * 可选环境变量：
 * - FRONTEND_URL: 前端URL（用于CORS和OAuth回调，默认使用当前域名）
 *
 * D1数据库绑定：
 * - DB: D1数据库实例
 */

// ============================================
// 数据库初始化
// ============================================

/**
 * 初始化所有必要的数据库表
 */
async function initDatabase(env) {
  try {
    console.log('开始初始化数据库表...');

    // 创建用户表
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        linux_do_id INTEGER UNIQUE NOT NULL,
        username TEXT NOT NULL,
        email TEXT,
        avatar_url TEXT,
        total_checkins INTEGER DEFAULT 0,
        consecutive_checkins INTEGER DEFAULT 0,
        max_consecutive_checkins INTEGER DEFAULT 0,
        total_amount DECIMAL(10,2) DEFAULT 0.00,
        last_checkin_date DATE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // 创建会话表
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT UNIQUE NOT NULL,
        user_id INTEGER NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `).run();

    // 创建签到记录表（使用实际的表结构）
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS check_ins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        check_in_date DATE NOT NULL,
        check_in_time DATETIME,
        redemption_code TEXT,
        consecutive_days INTEGER DEFAULT 1,
        reward_amount DECIMAL(10,2) DEFAULT 0.00,
        status TEXT DEFAULT 'completed',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        UNIQUE(user_id, check_in_date)
      )
    `).run();

    // 创建兑换码表
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS redemption_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        is_distributed BOOLEAN DEFAULT FALSE,
        distributed_to INTEGER,
        distributed_at DATETIME,
        distribution_type TEXT,
        is_used BOOLEAN DEFAULT FALSE,
        used_by INTEGER,
        used_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (distributed_to) REFERENCES users(id),
        FOREIGN KEY (used_by) REFERENCES users(id)
      )
    `).run();

    // 创建签到奖励配置表
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS checkin_rewards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reward_type TEXT NOT NULL,
        condition_value INTEGER DEFAULT 0,
        amount DECIMAL(10,2) NOT NULL,
        description TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // 插入默认的签到奖励配置
    await env.DB.prepare(`
      INSERT OR IGNORE INTO checkin_rewards (reward_type, condition_value, amount, description) VALUES
      ('base', 0, 1.00, '基础签到奖励'),
      ('consecutive', 7, 0.50, '连续签到7天奖励'),
      ('consecutive', 15, 1.00, '连续签到15天奖励'),
      ('consecutive', 30, 2.00, '连续签到30天奖励')
    `).run();

    await initModalControlTables(env);

    console.log('数据库表初始化完成');
  } catch (error) {
    console.error('数据库初始化失败:', error);
    throw error;
  }
}

/**
 * 升级 check_ins 表结构
 */
async function upgradeCheckInsTable(env) {
  try {
    console.log('检查并升级 check_ins 表结构...');

    // 检查表是否存在必要的列
    const columns = [
      { name: 'base_amount', type: 'DECIMAL(10,2)', default: '0.00' },
      { name: 'bonus_amount', type: 'DECIMAL(10,2)', default: '0.00' },
      { name: 'total_amount', type: 'DECIMAL(10,2)', default: '0.00' },
      { name: 'consecutive_days', type: 'INTEGER', default: '1' },
      { name: 'status', type: 'TEXT', default: "'completed'" },
      { name: 'ip_address', type: 'TEXT', default: 'NULL' },
      { name: 'user_agent', type: 'TEXT', default: 'NULL' },
      { name: 'timezone_offset', type: 'INTEGER', default: '480' },
      { name: 'check_in_time', type: 'DATETIME', default: 'NULL' }
    ];

    for (const column of columns) {
      try {
        // 尝试添加列，如果列已存在会失败但不影响程序继续
        await env.DB.prepare(`
          ALTER TABLE check_ins
          ADD COLUMN ${column.name} ${column.type} DEFAULT ${column.default}
        `).run();
        console.log(`添加列 ${column.name} 成功`);
      } catch (error) {
        if (error.message.includes('duplicate column name')) {
          console.log(`列 ${column.name} 已存在，跳过`);
        } else {
          console.log(`添加列 ${column.name} 失败: ${error.message}`);
        }
      }
    }

    console.log('check_ins 表结构升级完成');
  } catch (error) {
    console.error('升级 check_ins 表结构失败:', error);
  }
}

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
 * 生成兑换码
 */
function generateRedemptionCode() {
  const prefix = 'KYX';
  const randomPart = generateRandomString(8);
  return `${prefix}${randomPart}`;
}

/**
 * 设置CORS头
 */
function corsHeaders(env, request = null) {
  // 如果设置了 FRONTEND_URL，使用它；否则使用当前请求的域名或允许所有域名
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

/**
 * JSON响应
 */
function jsonResponse(data, status = 200, env, request = null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(env, request),
    },
  });
}

/**
 * 错误响应
 */
function errorResponse(message, status = 400, env, request = null) {
  return jsonResponse({ error: message }, status, env, request);
}

/**
 * HTML响应
 */
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
// 数据库操作函数
// ============================================

/**
 * 创建用户
 */
async function createUser(env, linuxDoId, username, email, avatarUrl) {
  const result = await env.DB.prepare(`
    INSERT INTO users (linux_do_id, username, email, avatar_url, created_at, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(linux_do_id) DO UPDATE SET
      username = excluded.username,
      email = excluded.email,
      avatar_url = excluded.avatar_url,
      updated_at = datetime('now')
  `).bind(linuxDoId, username, email, avatarUrl).run();
  
  return await env.DB.prepare('SELECT * FROM users WHERE linux_do_id = ?').bind(linuxDoId).first();
}

/**
 * 获取用户信息
 */
async function getUser(env, linuxDoId) {
  return await env.DB.prepare('SELECT * FROM users WHERE linux_do_id = ?').bind(linuxDoId).first();
}

/**
 * 创建会话
 */
async function createSession(env, userId, sessionId) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7天后过期
  
  await env.DB.prepare(`
    INSERT INTO sessions (session_id, user_id, expires_at, created_at)
    VALUES (?, ?, ?, datetime('now'))
  `).bind(sessionId, userId, expiresAt.toISOString()).run();
}

/**
 * 获取会话
 */
async function getSession(env, sessionId) {
  return await env.DB.prepare(`
    SELECT s.*, u.username, u.linux_do_id, u.email, u.avatar_url
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.session_id = ? AND s.expires_at > datetime('now')
  `).bind(sessionId).first();
}

/**
 * 删除会话
 */
async function deleteSession(env, sessionId) {
  await env.DB.prepare('DELETE FROM sessions WHERE session_id = ?').bind(sessionId).run();
}

/**
 * 清理过期会话
 */
async function cleanupSessions(env) {
  await env.DB.prepare('DELETE FROM sessions WHERE expires_at <= datetime("now")').run();
}

// ============================================
// 时间和时区工具函数
// ============================================

/**
 * 获取UTC+8时间
 */
function getUTC8Time() {
  const now = new Date();
  const utc8Time = new Date(now.getTime() + (8 * 60 * 60 * 1000));
  return utc8Time;
}

/**
 * 获取UTC+8日期字符串
 */
function getUTC8DateString() {
  return getUTC8Time().toISOString().split('T')[0];
}

/**
 * 获取UTC+8时间戳字符串（精确到秒）
 */
function getUTC8TimestampString() {
  return getUTC8Time().toISOString().replace(/\.\d{3}Z$/, '');
}

// ============================================
// 签到相关函数
// ============================================

/**
 * 检查今日签到
 */
async function getTodayCheckIn(env, userId) {
  try {
    const today = getUTC8DateString();
    console.log(`检查用户 ${userId} 在 ${today} 的签到记录`);

    const result = await env.DB.prepare(`
      SELECT * FROM check_ins
      WHERE user_id = ? AND check_in_date = ?
    `).bind(userId, today).first();

    console.log(`今日签到查询结果:`, result ? '已签到' : '未签到');
    return result;
  } catch (error) {
    console.error('检查今日签到失败:', error);
    throw error;
  }
}

/**
 * 获取签到奖励配置
 */
async function getCheckinRewards(env) {
  const rewards = await env.DB.prepare(`
    SELECT * FROM checkin_rewards
    WHERE is_active = TRUE
    ORDER BY consecutive_days ASC
  `).all();

  return rewards.results || [];
}

/**
 * 计算连续签到天数
 */
async function calculateConsecutiveDays(env, userId) {
  const today = getUTC8DateString();
  const yesterday = new Date(getUTC8Time().getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // 检查昨天是否签到
  const yesterdayCheckIn = await env.DB.prepare(`
    SELECT consecutive_days FROM check_ins
    WHERE user_id = ? AND check_in_date = ?
  `).bind(userId, yesterday).first();

  if (yesterdayCheckIn) {
    return yesterdayCheckIn.consecutive_days + 1;
  } else {
    // 检查是否有更早的签到记录
    const lastCheckIn = await env.DB.prepare(`
      SELECT check_in_date, consecutive_days FROM check_ins
      WHERE user_id = ? AND check_in_date < ?
      ORDER BY check_in_date DESC
      LIMIT 1
    `).bind(userId, today).first();

    if (!lastCheckIn) {
      return 1; // 首次签到
    }

    // 计算间隔天数
    const lastDate = new Date(lastCheckIn.check_in_date);
    const todayDate = new Date(today);
    const daysDiff = Math.floor((todayDate - lastDate) / (24 * 60 * 60 * 1000));

    if (daysDiff <= 2) { // 允许1天中断
      return lastCheckIn.consecutive_days + 1;
    } else {
      return 1; // 重新开始计数
    }
  }
}

/**
 * 计算签到奖励
 */
async function calculateCheckinReward(env, consecutiveDays) {
  try {
    console.log(`计算签到奖励，连续天数: ${consecutiveDays}`);

    const rewards = await getCheckinRewards(env);
    console.log(`获取到 ${rewards.length} 个奖励配置`);

    let totalReward = 5.0; // 默认基础奖励

    // 根据连续签到天数找到对应的奖励
    // 找到小于等于当前连续天数的最大奖励
    let bestReward = null;
    for (const reward of rewards) {
      if (consecutiveDays >= reward.consecutive_days) {
        if (!bestReward || reward.consecutive_days > bestReward.consecutive_days) {
          bestReward = reward;
        }
      }
    }

    if (bestReward) {
      totalReward = parseFloat(bestReward.reward_amount);
      console.log(`找到匹配的奖励配置: 连续${bestReward.consecutive_days}天，奖励${totalReward}`);
    } else {
      console.log(`未找到匹配的奖励配置，使用默认奖励: ${totalReward}`);
    }

    const result = {
      baseAmount: totalReward,
      bonusAmount: 0,
      totalAmount: totalReward,
      consecutiveDays: consecutiveDays
    };

    console.log('计算的奖励结果:', result);
    return result;
  } catch (error) {
    console.error('计算签到奖励失败:', error);
    // 返回默认奖励
    return {
      baseAmount: 5.0,
      bonusAmount: 0,
      totalAmount: 5.0,
      consecutiveDays: consecutiveDays
    };
  }
}

/**
 * 创建签到记录
 */
async function createCheckIn(env, userId, redemptionCode, rewardInfo, ipAddress = null, userAgent = null) {
  try {
    const today = getUTC8DateString();
    const now = getUTC8Time().toISOString().replace(/\.\d{3}Z$/, '');

    console.log('创建签到记录，使用实际表结构');

    // 使用实际的表结构字段
    const result = await env.DB.prepare(`
      INSERT INTO check_ins (
        user_id, check_in_date, check_in_time, redemption_code,
        consecutive_days, reward_amount, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'completed', ?)
    `).bind(
      userId, today, now, redemptionCode,
      rewardInfo.consecutiveDays, rewardInfo.totalAmount, now
    ).run();

    console.log('签到记录创建成功');
    return result;
  } catch (error) {
    console.error('创建签到记录失败:', error);
    throw error;
  }
}

/**
 * 获取签到统计
 */
async function getCheckInStats(env, userId) {
  const user = await env.DB.prepare(`
    SELECT
      total_checkins,
      consecutive_checkins,
      max_consecutive_checkins,
      total_amount,
      last_checkin_date
    FROM users
    WHERE id = ?
  `).bind(userId).first();

  if (!user) {
    return {
      total_days: 0,
      consecutive_days: 0,
      max_consecutive_days: 0,
      total_amount: 0,
      last_30_days: 0
    };
  }

  // 获取最近30天签到次数
  const thirtyDaysAgo = new Date(getUTC8Time().getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const recentStats = await env.DB.prepare(`
    SELECT COUNT(*) as last_30_days
    FROM check_ins
    WHERE user_id = ? AND check_in_date >= ?
  `).bind(userId, thirtyDaysAgo).first();

  return {
    total_days: user.total_checkins || 0,
    consecutive_days: user.consecutive_checkins || 0,
    max_consecutive_days: user.max_consecutive_checkins || 0,
    total_amount: parseFloat(user.total_amount || 0),
    last_30_days: recentStats.last_30_days || 0,
    last_checkin_date: user.last_checkin_date
  };
}

/**
 * 获取可用兑换码
 */
async function getAvailableCodes(amount, limit, env) {
  return await env.DB.prepare(`
    SELECT * FROM redemption_codes
    WHERE amount = ? AND is_used = FALSE
    ORDER BY created_at ASC
    LIMIT ?
  `).bind(amount, limit).all();
}

/**
 * 标记兑换码为已使用
 */
async function markCodeAsUsed(env, code, userId) {
  await env.DB.prepare(`
    UPDATE redemption_codes
    SET is_used = TRUE, used_by = ?, used_at = datetime('now'), distribution_time = datetime('now')
    WHERE code = ?
  `).bind(userId, code).run();
}

/**
 * 检查库存
 */
async function checkInventory(amount, env) {
  const result = await env.DB.prepare(`
    SELECT COUNT(*) as count FROM redemption_codes
    WHERE amount = ? AND is_used = FALSE
  `).bind(amount).first();

  return result.count;
}

/**
 * 获取库存统计
 */
async function getInventoryStats(env) {
  return await env.DB.prepare(`
    SELECT
      amount,
      COUNT(*) as total_count,
      SUM(CASE WHEN is_used = FALSE THEN 1 ELSE 0 END) as available_count,
      SUM(CASE WHEN is_used = TRUE THEN 1 ELSE 0 END) as used_count
    FROM redemption_codes
    GROUP BY amount
    ORDER BY amount ASC
  `).all();
}

// ============================================
// 弹窗控制函数
// ============================================

/**
 * 检查弹窗显示权限
 */
async function checkModalDisplayPermission(env, userId, modalType, modalKey) {
  const result = await env.DB.prepare(`
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
  `).bind(userId, modalType, modalKey).first();

  if (!result) {
    // 如果没有记录，检查配置
    const config = await env.DB.prepare(`
      SELECT max_display_count, is_enabled FROM modal_configs WHERE modal_type = ?
    `).bind(modalType).first();

    return {
      should_display: config ? config.is_enabled : true,
      reason: config && !config.is_enabled ? 'disabled' : 'allowed',
      display_count: 0,
      max_count: config ? config.max_display_count : 1
    };
  }

  const shouldDisplay = result.display_status === 'allowed';

  return {
    should_display: shouldDisplay,
    reason: result.display_status,
    display_count: result.display_count || 0,
    max_count: result.max_display_count || 1
  };
}

/**
 * 记录弹窗显示
 */
async function recordModalDisplay(env, userId, modalType, modalKey, notificationId = null) {
  await env.DB.prepare(`
    INSERT INTO modal_display_logs (
      user_id, notification_id, modal_type, modal_key,
      display_count, max_display_count, first_displayed_at, last_displayed_at
    ) VALUES (?, ?, ?, ?, 1, 1, datetime('now'), datetime('now'))
    ON CONFLICT(user_id, modal_type, modal_key) DO UPDATE SET
      display_count = display_count + 1,
      last_displayed_at = datetime('now'),
      updated_at = datetime('now')
  `).bind(userId, notificationId || null, modalType, modalKey).run();
}

/**
 * 标记弹窗为已关闭
 */
async function dismissModal(env, userId, modalType, modalKey) {
  await env.DB.prepare(`
    UPDATE modal_display_logs
    SET is_dismissed = TRUE, dismissed_at = datetime('now'), updated_at = datetime('now')
    WHERE user_id = ? AND modal_type = ? AND modal_key = ?
  `).bind(userId, modalType, modalKey).run();
}

// ============================================
// OAuth认证函数
// ============================================

/**
 * 获取OAuth授权URL
 */
function getOAuthUrl(env, request) {
  const clientId = env.OAUTH_CLIENT_ID;

  // 自动获取当前域名作为回调地址
  let baseUrl = env.FRONTEND_URL;
  if (!baseUrl && request) {
    const url = new URL(request.url);
    baseUrl = `${url.protocol}//${url.host}`;
  }
  if (!baseUrl) {
    baseUrl = 'https://your-domain.com'; // 最后的备用地址
  }

  const redirectUri = `${baseUrl}/api/oauth/callback`;
  const scope = 'read';
  const state = generateRandomString(32);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scope,
    state: state,
  });

  return `https://connect.linux.do/oauth2/authorize?${params.toString()}`;
}

/**
 * 处理OAuth回调
 */
async function handleOAuthCallback(env, code, state, request) {
  // 自动获取当前域名作为回调地址
  let baseUrl = env.FRONTEND_URL;
  if (!baseUrl && request) {
    const url = new URL(request.url);
    baseUrl = `${url.protocol}//${url.host}`;
  }
  if (!baseUrl) {
    baseUrl = 'https://your-domain.com'; // 最后的备用地址
  }

  const tokenResponse = await fetch('https://connect.linux.do/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: env.OAUTH_CLIENT_ID,
      client_secret: env.OAUTH_CLIENT_SECRET,
      code: code,
      redirect_uri: `${baseUrl}/api/oauth/callback`,
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error('Failed to get access token');
  }

  const tokenData = await tokenResponse.json();
  const accessToken = tokenData.access_token;

  // 获取用户信息
  const userResponse = await fetch('https://connect.linux.do/api/user', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!userResponse.ok) {
    throw new Error('Failed to get user info');
  }

  const userData = await userResponse.json();

  // 创建或更新用户
  const user = await createUser(
    env,
    userData.id,
    userData.username,
    userData.email,
    userData.avatar_url
  );

  // 创建会话
  const sessionId = generateRandomString(32);
  await createSession(env, user.id, sessionId);

  return { user, sessionId };
}

// ============================================
// API路由处理
// ============================================

/**
 * 处理签到API
 */
async function handleCheckin(request, env) {
  try {
    console.log('开始处理签到请求');

    const sessionId = request.headers.get('cookie')?.match(/session=([^;]+)/)?.[1];
    if (!sessionId) {
      console.log('签到失败：未找到会话ID');
      return errorResponse('未登录', 401, env);
    }

    const session = await getSession(env, sessionId);
    if (!session) {
      console.log('签到失败：会话无效');
      return errorResponse('会话无效', 401, env);
    }

    console.log(`用户 ${session.username} (ID: ${session.user_id}) 尝试签到`);

    // 检查今日是否已签到
    const existingCheckIn = await getTodayCheckIn(env, session.user_id);
    if (existingCheckIn) {
      console.log('用户今日已签到');
      return jsonResponse({
        success: false,
        message: '今日已签到',
        code: existingCheckIn.redemption_code,
        amount: existingCheckIn.reward_amount,
        checkedIn: true
      }, 200, env);
    }

    // 获取客户端信息
    const ipAddress = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
    const userAgent = request.headers.get('User-Agent') || 'unknown';

    // 计算连续签到天数
    const consecutiveDays = await calculateConsecutiveDays(env, session.user_id);
    console.log(`连续签到天数: ${consecutiveDays}`);

    // 计算签到奖励
    const rewardInfo = await calculateCheckinReward(env, consecutiveDays);
    console.log(`签到奖励信息:`, rewardInfo);

    // 检查是否有可用的兑换码
    let availableCode = null;

    // 查找未发放的兑换码（按金额匹配）
    const codes = await env.DB.prepare(`
      SELECT * FROM redemption_codes
      WHERE is_distributed = FALSE AND amount >= ?
      ORDER BY amount ASC, created_at ASC
      LIMIT 1
    `).bind(rewardInfo.totalAmount).all();

    console.log(`查找到 ${codes.results?.length || 0} 个可用兑换码`);

    if (codes.results && codes.results.length > 0) {
      availableCode = codes.results[0];
      console.log(`使用兑换码: ${availableCode.code}`);

      // 标记兑换码为已发放
      await env.DB.prepare(`
        UPDATE redemption_codes
        SET is_distributed = TRUE,
            distributed_to = ?,
            distributed_at = ?,
            distribution_type = 'checkin'
        WHERE code = ?
      `).bind(session.user_id, getUTC8Time().toISOString().replace(/\.\d{3}Z$/, ''), availableCode.code).run();
    }

    if (!availableCode) {
      console.log('没有可用兑换码，创建待分配记录');
      // 创建待分配记录
      const today = getUTC8DateString();
      const now = getUTC8Time().toISOString().replace(/\.\d{3}Z$/, '');

      // 使用实际的表结构创建待分配记录
      await env.DB.prepare(`
        INSERT INTO check_ins (
          user_id, check_in_date, check_in_time,
          consecutive_days, reward_amount, status, created_at
        ) VALUES (?, ?, ?, ?, ?, 'pending_distribution', ?)
      `).bind(
        session.user_id, today, now,
        consecutiveDays, rewardInfo.totalAmount, now
      ).run();

      return jsonResponse({
        success: true,
        status: 'pending_distribution',
        message: '签到成功！兑换码待管理员分配',
        reward: rewardInfo
      }, 200, env);
    }

    // 创建签到记录
    await createCheckIn(env, session.user_id, availableCode.code, rewardInfo, ipAddress, userAgent);
    console.log('签到记录创建成功');

    // 获取签到统计
    const stats = await getCheckInStats(env, session.user_id);

    console.log('签到成功完成');
    return jsonResponse({
      success: true,
      status: 'completed',
      message: '签到成功！',
      redemptionCode: availableCode.code,
      amount: rewardInfo.totalAmount,
      baseAmount: rewardInfo.baseAmount,
      bonusAmount: rewardInfo.bonusAmount,
      consecutiveDays: consecutiveDays,
      stats: stats
    }, 200, env);

  } catch (error) {
    console.error('签到处理过程中发生错误:', error);
    console.error('错误堆栈:', error.stack);
    return errorResponse(`签到失败: ${error.message}`, 500, env);
  }
}

/**
 * 处理用户信息API
 */
async function handleUserInfo(request, env) {
  const sessionId = request.headers.get('cookie')?.match(/session=([^;]+)/)?.[1];
  if (!sessionId) {
    return errorResponse('未登录', 401, env);
  }

  const session = await getSession(env, sessionId);
  if (!session) {
    return errorResponse('会话无效', 401, env);
  }

  return jsonResponse({
    success: true,
    user: {
      id: session.user_id,
      username: session.username,
      linux_do_id: session.linux_do_id,
      email: session.email,
      avatar_url: session.avatar_url
    }
  }, 200, env);
}

/**
 * 处理登出API
 */
async function handleLogout(request, env) {
  const sessionId = request.headers.get('cookie')?.match(/session=([^;]+)/)?.[1];
  if (sessionId) {
    await deleteSession(env, sessionId);
  }

  return new Response('', {
    status: 302,
    headers: {
      'Location': '/login',
      'Set-Cookie': 'session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0',
      ...corsHeaders(env, request),
    },
  });
}

/**
 * 处理弹窗检查API
 */
async function handleModalCheck(request, env) {
  const url = new URL(request.url);
  const modalType = url.searchParams.get('type');
  const modalKey = url.searchParams.get('key');

  if (!modalType || !modalKey) {
    return errorResponse('缺少必要参数', 400, env);
  }

  const sessionId = request.headers.get('cookie')?.match(/session=([^;]+)/)?.[1];
  if (!sessionId) {
    return errorResponse('未登录', 401, env);
  }

  const session = await getSession(env, sessionId);
  if (!session) {
    return errorResponse('会话无效', 401, env);
  }

  const permission = await checkModalDisplayPermission(env, session.user_id, modalType, modalKey);

  return jsonResponse({
    success: true,
    ...permission
  }, 200, env);
}

/**
 * 处理弹窗显示记录API
 */
async function handleModalDisplay(request, env) {
  const sessionId = request.headers.get('cookie')?.match(/session=([^;]+)/)?.[1];
  if (!sessionId) {
    return errorResponse('未登录', 401, env);
  }

  const session = await getSession(env, sessionId);
  if (!session) {
    return errorResponse('会话无效', 401, env);
  }

  const { type: modalType, key: modalKey, notification_id } = await request.json();

  if (!modalType || !modalKey) {
    return errorResponse('缺少必要参数', 400, env);
  }

  await recordModalDisplay(env, session.user_id, modalType, modalKey, notification_id);

  return jsonResponse({
    success: true,
    message: '弹窗显示已记录'
  }, 200, env);
}

/**
 * 处理弹窗关闭API
 */
async function handleModalDismiss(request, env) {
  const sessionId = request.headers.get('cookie')?.match(/session=([^;]+)/)?.[1];
  if (!sessionId) {
    return errorResponse('未登录', 401, env);
  }

  const session = await getSession(env, sessionId);
  if (!session) {
    return errorResponse('会话无效', 401, env);
  }

  const { type: modalType, key: modalKey } = await request.json();

  if (!modalType || !modalKey) {
    return errorResponse('缺少必要参数', 400, env);
  }

  await dismissModal(env, session.user_id, modalType, modalKey);

  return jsonResponse({
    success: true,
    message: '弹窗已标记为关闭'
  }, 200, env);
}

/**
 * 处理用户统计API
 */
async function handleUserStats(request, env) {
  const sessionId = request.headers.get('cookie')?.match(/session=([^;]+)/)?.[1];
  if (!sessionId) {
    return errorResponse('未登录', 401, env);
  }

  const session = await getSession(env, sessionId);
  if (!session) {
    return errorResponse('会话无效', 401, env);
  }

  try {
    const stats = await getCheckInStats(env, session.user_id);

    // 获取兑换码统计
    const codeStats = await env.DB.prepare(`
      SELECT
        COUNT(*) as codeCount,
        SUM(amount) as totalAmount
      FROM redemption_codes
      WHERE distributed_to = ?
    `).bind(session.user_id).first();

    return jsonResponse({
      success: true,
      stats: {
        totalDays: stats.total_days || 0,
        consecutiveDays: stats.consecutive_days || 0,
        maxConsecutiveDays: stats.max_consecutive_days || 0,
        monthlyDays: stats.last_30_days || 0,
        codeCount: codeStats.codeCount || 0,
        totalAmount: parseFloat(codeStats.totalAmount || 0).toFixed(2)
      }
    }, 200, env);
  } catch (error) {
    console.error('User stats error:', error);
    return errorResponse('获取统计数据失败', 500, env);
  }
}

/**
 * 处理最近兑换码API
 */
async function handleRecentCodes(request, env) {
  const sessionId = request.headers.get('cookie')?.match(/session=([^;]+)/)?.[1];
  if (!sessionId) {
    return errorResponse('未登录', 401, env);
  }

  const session = await getSession(env, sessionId);
  if (!session) {
    return errorResponse('会话无效', 401, env);
  }

  try {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '5'), 50);
    const offset = (page - 1) * limit;

    const codes = await env.DB.prepare(`
      SELECT code, amount, distributed_at as created_at
      FROM redemption_codes
      WHERE distributed_to = ?
      ORDER BY distributed_at DESC
      LIMIT ? OFFSET ?
    `).bind(session.user_id, limit, offset).all();

    // 获取总数
    const totalResult = await env.DB.prepare(`
      SELECT COUNT(*) as total
      FROM redemption_codes
      WHERE distributed_to = ?
    `).bind(session.user_id).first();

    return jsonResponse({
      success: true,
      codes: codes.results || [],
      pagination: {
        page: page,
        limit: limit,
        total: totalResult.total || 0,
        totalPages: Math.ceil((totalResult.total || 0) / limit)
      }
    }, 200, env);
  } catch (error) {
    console.error('Recent codes error:', error);
    return errorResponse('获取兑换码列表失败', 500, env);
  }
}

/**
 * 处理签到状态API
 */
async function handleCheckinStatus(request, env) {
  const sessionId = request.headers.get('cookie')?.match(/session=([^;]+)/)?.[1];
  if (!sessionId) {
    return errorResponse('未登录', 401, env);
  }

  const session = await getSession(env, sessionId);
  if (!session) {
    return errorResponse('会话无效', 401, env);
  }

  try {
    const existingCheckIn = await getTodayCheckIn(env, session.user_id);

    return jsonResponse({
      success: true,
      checkedIn: !!existingCheckIn,
      checkIn: existingCheckIn
    }, 200, env);
  } catch (error) {
    console.error('Checkin status error:', error);
    return errorResponse('获取签到状态失败', 500, env);
  }
}

/**
 * 处理调试状态API
 */
async function handleDebugStatus(request, env) {
  try {
    const sessionId = request.headers.get('cookie')?.match(/session=([^;]+)/)?.[1];
    let userInfo = null;

    if (sessionId) {
      const session = await getSession(env, sessionId);
      if (session) {
        userInfo = {
          user_id: session.user_id,
          username: session.username,
          linux_do_id: session.linux_do_id
        };
      }
    }

    // 检查数据库表是否存在
    const tables = {};
    const tableNames = ['users', 'sessions', 'check_ins', 'redemption_codes', 'checkin_rewards'];

    for (const tableName of tableNames) {
      try {
        const result = await env.DB.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).first();
        tables[tableName] = { exists: true, count: result.count };
      } catch (error) {
        tables[tableName] = { exists: false, error: error.message };
      }
    }

    // 检查签到奖励配置
    let rewardsConfig = [];
    try {
      const rewards = await env.DB.prepare(`
        SELECT * FROM checkin_rewards WHERE is_active = TRUE ORDER BY condition_value ASC
      `).all();
      rewardsConfig = rewards.results || [];
    } catch (error) {
      rewardsConfig = { error: error.message };
    }

    // 检查可用兑换码数量
    let availableCodes = 0;
    try {
      const result = await env.DB.prepare(`
        SELECT COUNT(*) as count FROM redemption_codes WHERE is_distributed = FALSE
      `).first();
      availableCodes = result.count;
    } catch (error) {
      availableCodes = { error: error.message };
    }

    return jsonResponse({
      success: true,
      timestamp: new Date().toISOString(),
      user: userInfo,
      database: {
        initialized: env.DATABASE_INITIALIZED || false,
        tables: tables
      },
      checkin: {
        rewards_config: rewardsConfig,
        available_codes: availableCodes
      },
      environment: {
        has_oauth_client_id: !!env.OAUTH_CLIENT_ID,
        has_oauth_client_secret: !!env.OAUTH_CLIENT_SECRET,
        frontend_url: env.FRONTEND_URL || 'not_set'
      }
    }, 200, env);
  } catch (error) {
    console.error('Debug status error:', error);
    return errorResponse(`调试状态获取失败: ${error.message}`, 500, env);
  }
}

// ============================================
// 前端HTML模板
// ============================================

/**
 * 登录页面HTML
 */
function getLoginPageHTML() {
  return `<!DOCTYPE html>
<html lang="zh-CN" data-theme="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>欢迎使用 KYX 签到系统</title>
    <style>
        /* CSS变量 */
        :root {
            --color-primary: #ffffff;
            --color-secondary: #f5f5f5;
            --color-accent: #0066cc;
            --color-bg-primary: #0f0f0f;
            --color-bg-elevated: #1a1a1a;
            --color-text-primary: #ffffff;
            --color-text-secondary: #b3b3b3;
            --color-border-primary: #333333;
            --spacing-xs: 0.25rem;
            --spacing-sm: 0.5rem;
            --spacing-md: 1rem;
            --spacing-lg: 1.5rem;
            --spacing-xl: 2rem;
            --radius-sm: 0.375rem;
            --radius-md: 0.5rem;
            --radius-lg: 0.75rem;
            --font-family-base: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        /* 基础样式 */
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: var(--font-family-base);
            background: var(--color-bg-primary);
            color: var(--color-text-primary);
            line-height: 1.6;
        }

        /* 登录页面样式 */
        .login-container {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #0f0f0f;
            position: relative;
            overflow: hidden;
        }

        .bg-decoration {
            position: absolute;
            width: 100%;
            height: 100%;
            overflow: hidden;
            pointer-events: none;
        }

        .grid-bg {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-image:
                linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
            background-size: 50px 50px;
            animation: gridMove 20s linear infinite;
        }

        @keyframes gridMove {
            0% { transform: translate(0, 0); }
            100% { transform: translate(50px, 50px); }
        }

        .admin-login-trigger {
            position: fixed;
            top: var(--spacing-lg);
            right: var(--spacing-lg);
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            color: var(--color-text-secondary);
            padding: var(--spacing-sm) var(--spacing-md);
            border-radius: var(--radius-md);
            font-size: 0.875rem;
            cursor: pointer;
            transition: all 0.2s ease;
            backdrop-filter: blur(10px);
            z-index: 10;
        }

        .admin-login-trigger:hover {
            background: rgba(255, 255, 255, 0.15);
            color: var(--color-text-primary);
            transform: translateY(-1px);
        }

        .login-card {
            background: rgba(26, 26, 26, 0.95);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: var(--spacing-lg);
            padding: var(--spacing-xl);
            width: 100%;
            max-width: 400px;
            text-align: center;
            backdrop-filter: blur(20px);
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
            position: relative;
            z-index: 1;
        }

        .logo-container {
            margin-bottom: var(--spacing-xl);
        }

        .logo-icon {
            width: 80px;
            height: 80px;
            background: linear-gradient(135deg, #ffffff, #f0f0f0);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto var(--spacing-md);
            font-size: 2rem;
            box-shadow: 0 8px 24px rgba(255, 255, 255, 0.1);
        }

        .logo-text {
            font-size: 2.25rem;
            font-weight: 700;
            margin-bottom: var(--spacing-sm);
            background: linear-gradient(135deg, #ffffff, #cccccc);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            animation: pulse 2s ease-in-out infinite;
        }

        @keyframes pulse {
            0% {
                transform: scale(1);
                opacity: 1;
                text-shadow: 0 0 10px rgba(255, 255, 255, 0.3);
            }
            50% {
                transform: scale(1.08);
                opacity: 0.85;
                text-shadow: 0 0 20px rgba(255, 255, 255, 0.6), 0 0 30px rgba(255, 255, 255, 0.4);
            }
            100% {
                transform: scale(1);
                opacity: 1;
                text-shadow: 0 0 10px rgba(255, 255, 255, 0.3);
            }
        }

        .logo-subtitle {
            color: var(--color-text-secondary);
            font-size: 1.25rem;
            margin-bottom: var(--spacing-xl);
            font-weight: 500;
            letter-spacing: 0.5px;
            animation: fadeInUp 1s ease-out 0.5s both;
        }

        @keyframes fadeInUp {
            0% {
                opacity: 0;
                transform: translateY(20px);
            }
            100% {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .login-form {
            display: flex;
            flex-direction: column;
            gap: var(--spacing-lg);
        }

        .btn {
            background: linear-gradient(135deg, #ffffff, #f0f0f0);
            color: #0f0f0f;
            border: none;
            padding: calc(var(--spacing-md) * 1.5) calc(var(--spacing-lg) * 1.5);
            border-radius: var(--radius-md);
            font-size: 1.5rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            position: relative;
            overflow: hidden;
            transform: scale(1.5);
            margin: calc(var(--spacing-lg) * 1.5) 0;
        }

        .btn:hover {
            transform: scale(1.5) translateY(-3px);
            box-shadow: 0 12px 36px rgba(255, 255, 255, 0.3);
        }

        .btn:active {
            transform: scale(1.45);
        }

        .btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
        }

        .loading-spinner {
            display: none;
            width: 20px;
            height: 20px;
            border: 2px solid transparent;
            border-top: 2px solid #0f0f0f;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-right: var(--spacing-sm);
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        .error-message {
            background: rgba(220, 38, 38, 0.1);
            border: 1px solid rgba(220, 38, 38, 0.3);
            color: #fca5a5;
            padding: var(--spacing-md);
            border-radius: var(--radius-md);
            font-size: 0.875rem;
            display: none;
        }

        .error-message.active {
            display: block;
        }

        .login-footer {
            margin-top: var(--spacing-xl);
            padding-top: var(--spacing-lg);
            border-top: 1px solid rgba(255, 255, 255, 0.1);
            color: var(--color-text-secondary);
            font-size: 0.875rem;
        }

        /* 响应式设计 */
        @media (max-width: 480px) {
            .login-card {
                margin: var(--spacing-lg);
                padding: var(--spacing-lg);
            }

            .admin-login-trigger {
                top: var(--spacing-md);
                right: var(--spacing-md);
                font-size: 0.8rem;
                padding: var(--spacing-xs) var(--spacing-sm);
            }
        }
    </style>
</head>
<body>
    <div class="login-container">
        <!-- 背景装饰 -->
        <div class="bg-decoration"></div>
        <div class="grid-bg"></div>

        <!-- 管理员登录入口 -->
        <button class="admin-login-trigger" id="adminLoginTrigger">
            管理员登录
        </button>

        <!-- 登录卡片 -->
        <div class="login-card">
            <div class="logo-container">
                <div class="logo-icon">
                    <span style="color: #0f0f0f;">📅</span>
                </div>
                <h1 class="logo-text">KYX 公益 签到系统</h1>
                <p class="logo-subtitle">每日签到 · 领取兑换码</p>
            </div>

            <form class="login-form" id="loginForm">
                <div class="error-message" id="errorMessage"></div>

                <button type="submit" class="btn" id="loginBtn">
                    <span class="loading-spinner" id="loadingSpinner"></span>
                    <span id="loginBtnText">使用 Linux Do 账号登录</span>
                </button>
            </form>

            <div class="login-footer">
                <p>使用 Linux Do 账号安全登录</p>
            </div>
        </div>
    </div>

    <script>
        // 配置
        const API_BASE_URL = window.location.origin;

        // DOM元素
        const loginForm = document.getElementById('loginForm');
        const loginBtn = document.getElementById('loginBtn');
        const loginBtnText = document.getElementById('loginBtnText');
        const loadingSpinner = document.getElementById('loadingSpinner');
        const errorMessage = document.getElementById('errorMessage');
        const adminLoginTrigger = document.getElementById('adminLoginTrigger');

        // 显示加载状态
        function showLoading(show) {
            if (show) {
                loadingSpinner.style.display = 'inline-block';
                loginBtnText.textContent = '登录中...';
                loginBtn.disabled = true;
            } else {
                loadingSpinner.style.display = 'none';
                loginBtnText.textContent = '使用 Linux Do 账号登录';
                loginBtn.disabled = false;
            }
        }

        // 显示错误信息
        function showError(message) {
            errorMessage.textContent = message;
            errorMessage.classList.add('active');
        }

        // 处理OAuth登录
        async function handleLogin() {
            showLoading(true);
            errorMessage.classList.remove('active');

            try {
                const response = await fetch(\`\${API_BASE_URL}/api/auth/login\`, {
                    method: 'GET',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                if (!response.ok) {
                    throw new Error('获取登录链接失败');
                }

                const data = await response.json();

                if (data.success && data.authUrl) {
                    // 跳转到OAuth授权页面
                    window.location.href = data.authUrl;
                } else {
                    throw new Error(data.error || '登录失败');
                }
            } catch (error) {
                console.error('Login error:', error);
                showError(error.message || '网络错误，请稍后重试');
                showLoading(false);
            }
        }

        // 绑定事件
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            handleLogin();
        });

        adminLoginTrigger.addEventListener('click', () => {
            window.location.href = '/admin';
        });

        // 检查是否已登录
        async function checkAuth() {
            try {
                const response = await fetch(\`\${API_BASE_URL}/api/user\`, {
                    credentials: 'include'
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.success) {
                        window.location.href = '/';
                    }
                }
            } catch (error) {
                console.log('Not logged in');
            }
        }

        // 页面加载时检查登录状态
        checkAuth();
    </script>
</body>
</html>`;
}

/**
 * 主页面HTML
 */
function getIndexPageHTML() {
  return `<!DOCTYPE html>
<html lang="zh-CN" data-theme="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>KYX 签到系统</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        /* CSS变量 */
        :root {
            --color-primary: #ffffff;
            --color-secondary: #f5f5f5;
            --color-accent: #0066cc;
            --color-success: #10b981;
            --color-warning: #f59e0b;
            --color-error: #ef4444;
            --color-info: #3b82f6;
            --color-bg-primary: #0f0f0f;
            --color-bg-elevated: #1a1a1a;
            --color-bg-overlay: rgba(0, 0, 0, 0.8);
            --color-text-primary: #ffffff;
            --color-text-secondary: #b3b3b3;
            --color-border-primary: #333333;
            --spacing-xs: 0.25rem;
            --spacing-sm: 0.5rem;
            --spacing-md: 1rem;
            --spacing-lg: 1.5rem;
            --spacing-xl: 2rem;
            --radius-sm: 0.375rem;
            --radius-md: 0.5rem;
            --radius-lg: 0.75rem;
            --font-family-base: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            --z-modal: 1000;
            --z-modal-backdrop: 999;
        }

        /* 基础样式 */
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: var(--font-family-base);
            background: var(--color-bg-primary);
            color: var(--color-text-primary);
            line-height: 1.6;
        }

        /* 页面布局 */
        .app-container {
            min-height: 100vh;
            background: var(--color-bg-primary);
            display: flex;
            flex-direction: column;
        }

        /* 导航栏 */
        .navbar {
            background: var(--color-bg-elevated);
            border-bottom: 1px solid var(--color-border-primary);
            padding: var(--spacing-md) 0;
            position: sticky;
            top: 0;
            z-index: 100;
        }

        .navbar-content {
            max-width: 1200px;
            margin: 0 auto;
            padding: 0 var(--spacing-lg);
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .navbar-brand {
            display: flex;
            align-items: center;
            gap: var(--spacing-sm);
            font-weight: 600;
            font-size: 1.125rem;
        }

        .navbar-logo {
            font-size: 1.5rem;
        }

        .navbar-actions {
            display: flex;
            align-items: center;
            gap: var(--spacing-md);
        }

        .theme-toggle {
            background: none;
            border: 1px solid var(--color-border-primary);
            color: var(--color-text-primary);
            padding: var(--spacing-sm);
            border-radius: var(--radius-md);
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .theme-toggle:hover {
            background: var(--color-bg-primary);
        }

        .user-menu {
            display: flex;
            align-items: center;
            gap: var(--spacing-sm);
        }

        .user-avatar {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: var(--color-accent);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.875rem;
            overflow: hidden;
        }

        .user-avatar img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        .user-info {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
        }

        .user-name {
            font-weight: 500;
            font-size: 0.9rem;
        }

        .user-level {
            font-size: 0.75rem;
            color: var(--color-text-secondary);
        }

        .btn {
            background: var(--color-accent);
            color: white;
            border: none;
            padding: var(--spacing-sm) var(--spacing-md);
            border-radius: var(--radius-md);
            font-size: 0.875rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            justify-content: center;
        }

        .btn:hover {
            opacity: 0.9;
            transform: translateY(-1px);
        }

        .btn-sm {
            padding: var(--spacing-xs) var(--spacing-sm);
            font-size: 0.8rem;
        }

        .btn-ghost {
            background: transparent;
            border: 1px solid var(--color-border-primary);
            color: var(--color-text-primary);
        }

        .btn-ghost:hover {
            background: var(--color-bg-primary);
        }

        /* 主内容 */
        .main-content {
            flex: 1;
            max-width: 1200px;
            margin: 0 auto;
            padding: var(--spacing-xl) var(--spacing-lg);
            width: 100%;
        }

        /* 签到卡片 */
        .checkin-card {
            background: var(--color-bg-elevated);
            border: 1px solid var(--color-border-primary);
            border-radius: var(--radius-lg);
            padding: var(--spacing-xl);
            text-align: center;
            margin-bottom: var(--spacing-xl);
        }

        .checkin-title {
            font-size: 2rem;
            font-weight: 700;
            margin-bottom: var(--spacing-md);
            background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }

        .checkin-subtitle {
            color: var(--color-text-secondary);
            margin-bottom: var(--spacing-xl);
            font-size: 1.1rem;
        }

        .checkin-btn {
            background: linear-gradient(135deg, var(--color-success), #059669);
            color: white;
            border: none;
            padding: var(--spacing-lg) var(--spacing-xl);
            border-radius: var(--radius-lg);
            font-size: 1.125rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
        }

        .checkin-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 24px rgba(16, 185, 129, 0.4);
        }

        .checkin-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
        }

        .checkin-btn.checked-in {
            background: linear-gradient(135deg, var(--color-text-secondary), #6b7280);
            box-shadow: none;
        }

        /* 统计卡片 */
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: var(--spacing-lg);
            margin-bottom: var(--spacing-xl);
        }

        .stat-card {
            background: var(--color-bg-elevated);
            border: 1px solid var(--color-border-primary);
            border-radius: var(--radius-lg);
            padding: var(--spacing-lg);
            text-align: center;
        }

        .stat-label {
            color: var(--color-text-secondary);
            font-size: 0.875rem;
            margin-bottom: var(--spacing-sm);
        }

        .stat-value {
            font-size: 2rem;
            font-weight: 700;
            color: var(--color-primary);
        }

        /* 兑换码列表 */
        .codes-section {
            background: var(--color-bg-elevated);
            border: 1px solid var(--color-border-primary);
            border-radius: var(--radius-lg);
            padding: var(--spacing-xl);
        }

        .codes-title {
            font-size: 1.5rem;
            font-weight: 600;
            margin-bottom: var(--spacing-lg);
        }

        .code-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: var(--spacing-md);
            border: 1px solid var(--color-border-primary);
            border-radius: var(--radius-md);
            margin-bottom: var(--spacing-md);
        }

        .code-info {
            flex: 1;
        }

        .code-value {
            font-family: 'Courier New', monospace;
            font-weight: 600;
            margin-bottom: var(--spacing-xs);
        }

        .code-meta {
            color: var(--color-text-secondary);
            font-size: 0.875rem;
        }

        .copy-btn {
            background: var(--color-accent);
            color: white;
            border: none;
            padding: var(--spacing-sm) var(--spacing-md);
            border-radius: var(--radius-sm);
            font-size: 0.875rem;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .copy-btn:hover {
            opacity: 0.9;
        }

        /* 分页控件 */
        .pagination {
            display: flex;
            justify-content: center;
            gap: var(--spacing-sm);
            margin-top: var(--spacing-lg);
            padding: var(--spacing-lg);
        }

        .page-btn {
            background: var(--color-bg-primary);
            border: 1px solid var(--color-border-primary);
            color: var(--color-text-primary);
            padding: var(--spacing-sm) var(--spacing-md);
            border-radius: var(--radius-sm);
            cursor: pointer;
            transition: all 0.2s ease;
            min-width: 40px;
        }

        .page-btn:hover {
            background: var(--color-accent);
            border-color: var(--color-accent);
            color: white;
        }

        .page-btn.active {
            background: var(--color-accent);
            border-color: var(--color-accent);
            color: white;
        }

        /* 模态框 */
        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: var(--z-modal);
            align-items: center;
            justify-content: center;
            padding: var(--spacing-lg);
        }

        .modal.active {
            display: flex;
        }

        .modal-backdrop {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: var(--color-bg-overlay);
            backdrop-filter: blur(4px);
            z-index: var(--z-modal-backdrop);
        }

        .modal-content {
            background: var(--color-bg-elevated);
            border: 1px solid var(--color-border-primary);
            border-radius: var(--radius-lg);
            padding: var(--spacing-xl);
            max-width: 400px;
            width: 100%;
            position: relative;
            z-index: var(--z-modal);
            text-align: center;
        }

        .modal-header h3 {
            margin-bottom: var(--spacing-md);
            font-size: 1.25rem;
        }

        .modal-body {
            margin-bottom: var(--spacing-lg);
        }

        .code-display {
            background: var(--color-bg-primary);
            border: 1px solid var(--color-border-primary);
            border-radius: var(--radius-md);
            padding: var(--spacing-md);
            margin: var(--spacing-md) 0;
        }

        .code-display input {
            background: none;
            border: none;
            color: var(--color-text-primary);
            font-family: 'Courier New', monospace;
            font-size: 1.125rem;
            font-weight: 600;
            text-align: center;
            width: 100%;
            outline: none;
        }

        .modal-footer {
            display: flex;
            gap: var(--spacing-md);
            justify-content: center;
        }

        /* Toast通知 */
        .toast {
            position: fixed;
            top: var(--spacing-lg);
            right: var(--spacing-lg);
            background: var(--color-bg-elevated);
            border: 1px solid var(--color-border-primary);
            border-radius: var(--radius-md);
            padding: var(--spacing-md) var(--spacing-lg);
            z-index: 1100;
            transform: translateX(100%);
            transition: transform 0.3s ease;
        }

        .toast.show {
            transform: translateX(0);
        }

        .toast.success {
            border-color: var(--color-success);
            background: rgba(16, 185, 129, 0.1);
        }

        .toast.error {
            border-color: var(--color-error);
            background: rgba(239, 68, 68, 0.1);
        }

        .toast.warning {
            border-color: var(--color-warning);
            background: rgba(245, 158, 11, 0.1);
        }

        .toast.info {
            border-color: var(--color-info);
            background: rgba(59, 130, 246, 0.1);
        }

        /* 响应式设计 */
        @media (max-width: 768px) {
            .navbar-content {
                padding: 0 var(--spacing-md);
            }

            .main-content {
                padding: var(--spacing-lg) var(--spacing-md);
            }

            .stats-grid {
                grid-template-columns: 1fr;
            }

            .code-item {
                flex-direction: column;
                align-items: flex-start;
                gap: var(--spacing-sm);
            }

            .modal-content {
                margin: var(--spacing-md);
            }
        }
    </style>
</head>
<body>
    <div class="app-container">
        <!-- 顶部导航 -->
        <nav class="navbar">
            <div class="navbar-content">
                <div class="navbar-brand">
                    <div class="navbar-logo">📅</div>
                    <span>KYX 签到系统</span>
                </div>
                <div class="navbar-actions">
                    <button class="theme-toggle" id="themeToggle" title="切换主题">
                        <span id="themeIcon">🌙</span>
                    </button>
                    <div class="user-menu" id="userMenu">
                        <div class="user-avatar" id="userAvatar">
                            <span>👤</span>
                        </div>
                        <div class="user-info">
                            <span class="user-name" id="userName">加载中...</span>
                            <span class="user-level" id="userLevel">信任等级: -</span>
                        </div>
                    </div>
                    <button class="btn btn-sm btn-ghost" id="logoutBtn">退出</button>
                </div>
            </div>
        </nav>

        <!-- 主内容 -->
        <main class="main-content">
            <!-- 签到卡片 -->
            <div class="checkin-card">
                <h1 class="checkin-title">每日签到</h1>
                <p class="checkin-subtitle" id="checkinSubtitle">今日还未签到，点击下方按钮完成签到</p>
                <button class="checkin-btn" id="checkinBtn">
                    <span id="checkinBtnText">立即签到</span>
                </button>
            </div>

            <!-- 统计信息 -->
            <div class="stats-grid" id="statsGrid">
                <div class="stat-card">
                    <div class="stat-label">总签到天数</div>
                    <div class="stat-value" id="totalDays">-</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">连续签到天数</div>
                    <div class="stat-value" id="consecutiveDays">-</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">最大连续天数</div>
                    <div class="stat-value" id="maxConsecutiveDays">-</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">本月签到</div>
                    <div class="stat-value" id="monthlyDays">-</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">兑换码数量</div>
                    <div class="stat-value" id="codeCount">-</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">累计金额</div>
                    <div class="stat-value" id="totalAmount">-</div>
                </div>
            </div>

            <!-- 最近兑换码 -->
            <div class="codes-section">
                <h2 class="codes-title">最近兑换码</h2>
                <div id="codesList">
                    <div style="text-align: center; color: var(--color-text-secondary); padding: var(--spacing-xl);">
                        加载中...
                    </div>
                </div>
            </div>
        </main>
    </div>

    <!-- 兑换码弹窗 -->
    <div class="modal" id="codeModal">
        <div class="modal-backdrop" onclick="closeModal()"></div>
        <div class="modal-content">
            <div class="modal-header">
                <h3>签到成功！</h3>
            </div>
            <div class="modal-body">
                <p style="margin-bottom: var(--spacing-md);">恭喜您获得兑换码：</p>
                <div class="code-display">
                    <input type="text" id="modalCodeInput" readonly>
                </div>
                <p style="color: var(--color-text-secondary); font-size: 0.875rem;">
                    金额：<span id="modalCodeAmount">-</span> 元
                </p>
            </div>
            <div class="modal-footer">
                <button class="btn" onclick="copyModalCode()">复制兑换码</button>
                <button class="btn btn-ghost" onclick="closeModal()">关闭</button>
            </div>
        </div>
    </div>

    <!-- Toast容器 -->
    <div id="toastContainer"></div>

    <script>
        // 配置
        const API_BASE_URL = window.location.origin;

        // 全局状态
        let currentUser = null;
        let isCheckedIn = false;

        // 工具函数
        function showToast(message, type = 'info') {
            const toast = document.createElement('div');
            toast.className = \`toast \${type}\`;
            toast.textContent = message;

            const container = document.getElementById('toastContainer');
            container.appendChild(toast);

            setTimeout(() => toast.classList.add('show'), 100);
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => container.removeChild(toast), 300);
            }, 3000);
        }

        async function copyToClipboard(text) {
            try {
                await navigator.clipboard.writeText(text);
                return true;
            } catch (err) {
                console.error('Failed to copy:', err);
                return false;
            }
        }

        // API请求函数
        async function apiRequest(url, options = {}) {
            const response = await fetch(url, {
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });

            if (!response.ok) {
                throw new Error(\`HTTP \${response.status}\`);
            }

            return response.json();
        }

        // 检查登录状态
        async function checkAuth() {
            try {
                const data = await apiRequest('/api/user');
                if (data.success) {
                    currentUser = data.user;
                    updateUserInfo();
                    return true;
                }
            } catch (error) {
                console.error('Auth check failed:', error);
                window.location.href = '/login';
            }
            return false;
        }

        // 更新用户信息显示
        function updateUserInfo() {
            if (currentUser) {
                document.getElementById('userName').textContent = currentUser.username;
                document.getElementById('userLevel').textContent = \`信任等级: \${currentUser.trust_level || 0}\`;
                if (currentUser.avatar_url) {
                    document.getElementById('userAvatar').innerHTML = \`<img src="\${currentUser.avatar_url}" alt="Avatar">\`;
                }
            }
        }

        // 加载签到状态
        async function loadCheckinStatus() {
            try {
                const data = await apiRequest('/api/checkin/status');
                if (data.success) {
                    isCheckedIn = data.checkedIn;
                    updateCheckinUI();
                }
            } catch (error) {
                console.error('Failed to load checkin status:', error);
            }
        }

        // 更新签到UI
        function updateCheckinUI() {
            const btn = document.getElementById('checkinBtn');
            const subtitle = document.getElementById('checkinSubtitle');
            const btnText = document.getElementById('checkinBtnText');

            if (isCheckedIn) {
                btn.classList.add('checked-in');
                btn.disabled = true;
                btnText.textContent = '今日已签到';
                subtitle.textContent = '今日签到已完成，明天再来吧！';
            } else {
                btn.classList.remove('checked-in');
                btn.disabled = false;
                btnText.textContent = '立即签到';
                subtitle.textContent = '今日还未签到，点击下方按钮完成签到';
            }
        }

        // 处理签到
        async function handleCheckin() {
            if (isCheckedIn) {
                showToast('今日已签到', 'info');
                return;
            }

            const btn = document.getElementById('checkinBtn');
            const btnText = document.getElementById('checkinBtnText');
            const originalText = btnText.textContent;

            try {
                btn.disabled = true;
                btnText.textContent = '签到中...';

                const data = await apiRequest('/api/checkin', { method: 'POST' });

                if (data.success) {
                    isCheckedIn = true;
                    updateCheckinUI();

                    if (data.status === 'completed' && data.redemptionCode) {
                        showCodeModal(data.redemptionCode, data.amount, data.consecutiveDays, data.baseAmount, data.bonusAmount);
                        let message = '签到成功！';
                        if (data.bonusAmount > 0) {
                            message += \`连续签到\${data.consecutiveDays}天，获得额外奖励！\`;
                        }
                        showToast(message, 'success');
                    } else if (data.status === 'pending_distribution') {
                        showToast('签到成功！兑换码待管理员分配', 'info');
                    }

                    // 重新加载数据
                    loadStats();
                    loadRecentCodes();
                } else {
                    showToast(data.message || '签到失败', 'error');
                    btn.disabled = false;
                    btnText.textContent = originalText;
                }
            } catch (error) {
                console.error('Checkin failed:', error);
                showToast('签到失败，请稍后重试', 'error');
                btn.disabled = false;
                btnText.textContent = originalText;
            }
        }

        // 显示兑换码弹窗
        function showCodeModal(code, amount, consecutiveDays = 0, baseAmount = 0, bonusAmount = 0) {
            const modal = document.getElementById('codeModal');
            const codeInput = document.getElementById('modalCodeInput');
            const amountSpan = document.getElementById('modalCodeAmount');

            codeInput.value = code;
            amountSpan.textContent = '$' + parseFloat(amount || 0).toFixed(2);

            // 更新弹窗标题和内容
            const modalTitle = modal.querySelector('h3');
            const modalBody = modal.querySelector('.modal-body p');

            if (bonusAmount > 0) {
                modalTitle.textContent = '签到成功！连续奖励！';
                modalBody.innerHTML = \`
                    <p>恭喜您连续签到 <strong>\${consecutiveDays}</strong> 天！</p>
                    <p>基础奖励：$\${parseFloat(baseAmount).toFixed(2)}</p>
                    <p>连续奖励：$\${parseFloat(bonusAmount).toFixed(2)}</p>
                    <p>总计获得兑换码：</p>
                \`;
            } else {
                modalTitle.textContent = '签到成功！';
                modalBody.innerHTML = '<p>恭喜您获得兑换码：</p>';
            }

            modal.classList.add('active');

            // 记录弹窗显示
            recordModalDisplay('checkin', code);
        }

        // 关闭弹窗
        function closeModal() {
            const modal = document.getElementById('codeModal');
            modal.classList.remove('active');

            // 标记弹窗为已关闭
            const code = document.getElementById('modalCodeInput').value;
            if (code) {
                dismissModal('checkin', code);
            }
        }

        // 复制兑换码
        async function copyModalCode() {
            const codeInput = document.getElementById('modalCodeInput');
            const success = await copyToClipboard(codeInput.value);

            if (success) {
                showToast('兑换码已复制', 'success');
                closeModal(); // 复制后自动关闭弹窗
            } else {
                showToast('复制失败，请手动复制', 'error');
            }
        }

        // 记录弹窗显示
        async function recordModalDisplay(type, key) {
            try {
                await apiRequest('/api/modal/display', {
                    method: 'POST',
                    body: JSON.stringify({ type, key })
                });
            } catch (error) {
                console.error('Failed to record modal display:', error);
            }
        }

        // 标记弹窗为已关闭
        async function dismissModal(type, key) {
            try {
                await apiRequest('/api/modal/dismiss', {
                    method: 'POST',
                    body: JSON.stringify({ type, key })
                });
            } catch (error) {
                console.error('Failed to dismiss modal:', error);
            }
        }

        // 加载统计数据
        async function loadStats() {
            try {
                const data = await apiRequest('/api/stats');
                if (data.success) {
                    document.getElementById('totalDays').textContent = data.stats.totalDays || 0;
                    document.getElementById('consecutiveDays').textContent = data.stats.consecutiveDays || 0;
                    document.getElementById('maxConsecutiveDays').textContent = data.stats.maxConsecutiveDays || 0;
                    document.getElementById('monthlyDays').textContent = data.stats.monthlyDays || 0;
                    document.getElementById('codeCount').textContent = data.stats.codeCount || 0;
                    document.getElementById('totalAmount').textContent = '$' + (parseFloat(data.stats.totalAmount || 0).toFixed(2));
                }
            } catch (error) {
                console.error('Failed to load stats:', error);
            }
        }

        // 加载最近兑换码
        async function loadRecentCodes(page = 1) {
            try {
                const data = await apiRequest(\`/api/codes/recent?page=\${page}&limit=5\`);
                if (data.success) {
                    const container = document.getElementById('codesList');

                    if (data.codes.length === 0) {
                        container.innerHTML = '<div style="text-align: center; color: var(--color-text-secondary); padding: var(--spacing-xl);">暂无兑换码</div>';
                        return;
                    }

                    let html = data.codes.map(code => \`
                        <div class="code-item">
                            <div class="code-info">
                                <div class="code-value">\${code.code}</div>
                                <div class="code-meta">金额: $\${parseFloat(code.amount).toFixed(2)} · \${new Date(code.created_at).toLocaleDateString()}</div>
                            </div>
                            <button class="copy-btn" onclick="copyCode('\${code.code}')">复制</button>
                        </div>
                    \`).join('');

                    // 添加分页控件
                    if (data.pagination && data.pagination.totalPages > 1) {
                        html += '<div class="pagination">';
                        for (let i = 1; i <= data.pagination.totalPages; i++) {
                            const activeClass = i === data.pagination.page ? ' active' : '';
                            html += \`<button class="page-btn\${activeClass}" onclick="loadRecentCodes(\${i})">\${i}</button>\`;
                        }
                        html += '</div>';
                    }

                    container.innerHTML = html;
                }
            } catch (error) {
                console.error('Failed to load recent codes:', error);
            }
        }

        // 复制兑换码
        async function copyCode(code) {
            const success = await copyToClipboard(code);
            if (success) {
                showToast('兑换码已复制', 'success');
            } else {
                showToast('复制失败', 'error');
            }
        }

        // 登出
        async function logout() {
            try {
                await fetch('/api/logout', {
                    method: 'POST',
                    credentials: 'include'
                });
                window.location.href = '/login';
            } catch (error) {
                console.error('Logout failed:', error);
                window.location.href = '/login';
            }
        }

        // 主题切换
        function toggleTheme() {
            const html = document.documentElement;
            const currentTheme = html.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

            html.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);

            const icon = document.getElementById('themeIcon');
            icon.textContent = newTheme === 'dark' ? '🌙' : '☀️';
        }

        // 初始化
        async function init() {
            // 设置主题
            const savedTheme = localStorage.getItem('theme') || 'dark';
            document.documentElement.setAttribute('data-theme', savedTheme);
            document.getElementById('themeIcon').textContent = savedTheme === 'dark' ? '🌙' : '☀️';

            // 检查登录状态
            const isLoggedIn = await checkAuth();
            if (!isLoggedIn) return;

            // 加载数据
            await Promise.all([
                loadCheckinStatus(),
                loadStats(),
                loadRecentCodes()
            ]);

            // 绑定事件
            document.getElementById('checkinBtn').addEventListener('click', handleCheckin);
            document.getElementById('logoutBtn').addEventListener('click', logout);
            document.getElementById('themeToggle').addEventListener('click', toggleTheme);

            // 点击弹窗外部关闭
            document.getElementById('codeModal').addEventListener('click', (e) => {
                if (e.target.id === 'codeModal') {
                    closeModal();
                }
            });
        }

        // 页面加载完成后初始化
        document.addEventListener('DOMContentLoaded', init);

        // ============================================
        // 弹窗管理器集成
        // ============================================

        class ModalManager {
            constructor(apiBaseUrl = '') {
                this.apiBaseUrl = apiBaseUrl;
                this.activeModals = new Map();
                this.modalHistory = new Map();
                this.config = {
                    autoCloseDelay: 5000,
                    maxDisplayCount: 1,
                    enableAutoClose: false
                };
                this.init();
            }

            init() {
                this.bindGlobalEvents();
                this.restoreState();
            }

            bindGlobalEvents() {
                window.addEventListener('beforeunload', () => {
                    this.saveState();
                });

                document.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape') {
                        this.closeAllModals();
                    }
                });
            }

            async checkDisplayPermission(type, key) {
                try {
                    const localKey = \`\${type}_\${key}\`;
                    const localHistory = this.modalHistory.get(localKey);

                    if (localHistory && localHistory.isDismissed) {
                        return {
                            shouldDisplay: false,
                            reason: 'dismissed_locally',
                            displayCount: localHistory.displayCount,
                            maxCount: this.config.maxDisplayCount
                        };
                    }

                    const response = await fetch(\`\${this.apiBaseUrl}/api/modal/check?type=\${type}&key=\${encodeURIComponent(key)}\`, {
                        credentials: 'include'
                    });

                    if (!response.ok) {
                        throw new Error(\`HTTP \${response.status}\`);
                    }

                    const data = await response.json();
                    return data;
                } catch (error) {
                    console.error('Failed to check modal display permission:', error);
                    return {
                        shouldDisplay: true,
                        reason: 'error_fallback',
                        displayCount: 0,
                        maxCount: this.config.maxDisplayCount
                    };
                }
            }

            async showModal(type, key, options = {}) {
                const modalKey = \`\${type}_\${key}\`;

                if (this.activeModals.has(modalKey)) {
                    return false;
                }

                const permission = await this.checkDisplayPermission(type, key);
                if (!permission.shouldDisplay) {
                    return false;
                }

                const modalConfig = {
                    type,
                    key,
                    modalKey,
                    element: null,
                    displayedAt: new Date(),
                    autoCloseTimer: null,
                    ...options
                };

                try {
                    await this.recordDisplay(type, key, options.notificationId);
                    const success = this.displayModal(modalConfig);
                    if (success) {
                        this.activeModals.set(modalKey, modalConfig);
                        this.updateLocalHistory(modalKey, 'displayed');

                        if (this.config.enableAutoClose && options.autoClose !== false) {
                            this.setAutoClose(modalKey, options.autoCloseDelay || this.config.autoCloseDelay);
                        }

                        return true;
                    }
                } catch (error) {
                    console.error(\`Failed to show modal \${modalKey}:\`, error);
                }

                return false;
            }

            displayModal(config) {
                const { type, key } = config;

                switch (type) {
                    case 'checkin':
                        return this.showCheckinModal(key, config);
                    case 'gift':
                        return this.showGiftModal(key, config);
                    case 'pending':
                        return this.showPendingModal(key, config);
                    default:
                        return false;
                }
            }

            showCheckinModal(code, config) {
                const modal = document.getElementById('codeModal');
                if (!modal) return false;

                const codeInput = document.getElementById('modalCodeInput');
                const amountSpan = document.getElementById('modalCodeAmount');

                if (codeInput) codeInput.value = code;
                if (amountSpan) amountSpan.textContent = config.amount || '-';

                modal.classList.add('active');
                config.element = modal;

                this.bindModalCloseEvents(modal, config);
                return true;
            }

            showGiftModal(code, config) {
                const modal = document.getElementById('giftModal');
                if (!modal) return false;

                const codeInput = document.getElementById('giftCodeInput');
                const amountSpan = document.getElementById('giftAmount');
                const messageSpan = modal.querySelector('.gift-subtitle');

                if (codeInput) codeInput.value = code;
                if (amountSpan) amountSpan.textContent = config.amount || 10;
                if (messageSpan) messageSpan.textContent = config.message || '恭喜您获得兑换码奖励！';

                modal.classList.add('active');
                config.element = modal;

                this.bindModalCloseEvents(modal, config);
                return true;
            }

            showPendingModal(key, config) {
                const modal = document.getElementById('pendingModal');
                if (!modal) return false;

                modal.classList.add('active');
                config.element = modal;

                this.bindModalCloseEvents(modal, config);
                return true;
            }

            bindModalCloseEvents(modal, config) {
                const { modalKey } = config;

                const backdrop = modal.querySelector('.modal-backdrop');
                if (backdrop) {
                    backdrop.addEventListener('click', () => {
                        this.closeModal(modalKey, 'backdrop_click');
                    });
                }

                const closeButtons = modal.querySelectorAll('.modal-close-btn, [onclick*="close"]');
                closeButtons.forEach(btn => {
                    btn.addEventListener('click', () => {
                        this.closeModal(modalKey, 'close_button');
                    });
                });

                const copyButtons = modal.querySelectorAll('[onclick*="copy"]');
                copyButtons.forEach(btn => {
                    btn.addEventListener('click', () => {
                        setTimeout(() => {
                            this.closeModal(modalKey, 'copy_action');
                        }, 500);
                    });
                });
            }

            async closeModal(modalKey, reason = 'user_action') {
                const config = this.activeModals.get(modalKey);
                if (!config) return;

                try {
                    if (config.element) {
                        config.element.classList.remove('active');
                    }

                    if (config.autoCloseTimer) {
                        clearTimeout(config.autoCloseTimer);
                    }

                    await this.recordDismiss(config.type, config.key, reason);
                    this.updateLocalHistory(modalKey, 'dismissed', reason);
                    this.activeModals.delete(modalKey);
                } catch (error) {
                    console.error(\`Failed to close modal \${modalKey}:\`, error);
                }
            }

            closeAllModals() {
                const activeKeys = Array.from(this.activeModals.keys());
                activeKeys.forEach(modalKey => {
                    this.closeModal(modalKey, 'escape_key');
                });
            }

            setAutoClose(modalKey, delay) {
                const config = this.activeModals.get(modalKey);
                if (!config) return;

                config.autoCloseTimer = setTimeout(() => {
                    this.closeModal(modalKey, 'auto_close');
                }, delay);
            }

            async recordDisplay(type, key, notificationId = null) {
                try {
                    const response = await fetch(\`\${this.apiBaseUrl}/api/modal/display\`, {
                        method: 'POST',
                        credentials: 'include',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            type,
                            key,
                            notification_id: notificationId
                        })
                    });

                    if (!response.ok) {
                        throw new Error(\`HTTP \${response.status}\`);
                    }

                    return await response.json();
                } catch (error) {
                    console.error('Failed to record modal display:', error);
                    throw error;
                }
            }

            async recordDismiss(type, key, reason) {
                try {
                    const response = await fetch(\`\${this.apiBaseUrl}/api/modal/dismiss\`, {
                        method: 'POST',
                        credentials: 'include',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            type,
                            key,
                            reason
                        })
                    });

                    if (!response.ok) {
                        throw new Error(\`HTTP \${response.status}\`);
                    }

                    return await response.json();
                } catch (error) {
                    console.error('Failed to record modal dismiss:', error);
                }
            }

            updateLocalHistory(modalKey, action, reason = null) {
                const history = this.modalHistory.get(modalKey) || {
                    displayCount: 0,
                    isDismissed: false,
                    lastAction: null,
                    lastActionAt: null
                };

                if (action === 'displayed') {
                    history.displayCount++;
                } else if (action === 'dismissed') {
                    history.isDismissed = true;
                    history.dismissReason = reason;
                }

                history.lastAction = action;
                history.lastActionAt = new Date().toISOString();

                this.modalHistory.set(modalKey, history);
            }

            saveState() {
                try {
                    const state = {
                        modalHistory: Object.fromEntries(this.modalHistory),
                        timestamp: new Date().toISOString()
                    };
                    localStorage.setItem('modalManager_state', JSON.stringify(state));
                } catch (error) {
                    console.error('Failed to save modal manager state:', error);
                }
            }

            restoreState() {
                try {
                    const saved = localStorage.getItem('modalManager_state');
                    if (saved) {
                        const state = JSON.parse(saved);

                        const savedTime = new Date(state.timestamp);
                        const now = new Date();
                        const hoursDiff = (now - savedTime) / (1000 * 60 * 60);

                        if (hoursDiff < 24) {
                            this.modalHistory = new Map(Object.entries(state.modalHistory));
                        } else {
                            localStorage.removeItem('modalManager_state');
                        }
                    }
                } catch (error) {
                    console.error('Failed to restore modal manager state:', error);
                }
            }
        }

        // 初始化弹窗管理器
        const modalManager = new ModalManager(window.location.origin);
        window.modalManager = modalManager;

        // 重写弹窗函数以使用弹窗管理器
        function showCodeModal(code, amount, consecutiveDays = 0, baseAmount = 0, bonusAmount = 0) {
            // 直接显示弹窗，不使用弹窗管理器的复杂逻辑
            const modal = document.getElementById('codeModal');
            const codeInput = document.getElementById('modalCodeInput');
            const amountSpan = document.getElementById('modalCodeAmount');

            if (codeInput) codeInput.value = code;
            if (amountSpan) amountSpan.textContent = '$' + parseFloat(amount || 0).toFixed(2);

            // 更新弹窗标题和内容
            const modalTitle = modal.querySelector('h3');
            const modalBody = modal.querySelector('.modal-body p');

            if (bonusAmount > 0) {
                modalTitle.textContent = '签到成功！连续奖励！';
                modalBody.innerHTML = \`
                    <p>恭喜您连续签到 <strong>\${consecutiveDays}</strong> 天！</p>
                    <p>基础奖励：$\${parseFloat(baseAmount).toFixed(2)}</p>
                    <p>连续奖励：$\${parseFloat(bonusAmount).toFixed(2)}</p>
                    <p>总计获得兑换码：</p>
                \`;
            } else {
                modalTitle.textContent = '签到成功！';
                modalBody.innerHTML = '<p>恭喜您获得兑换码：</p>';
            }

            modal.classList.add('active');
            console.log('显示兑换码弹窗:', code, amount);
        }

        function showGiftModal(code, amount, message) {
            modalManager.showModal('gift', code, { amount, message });
        }

        function closeModal() {
            modalManager.closeAllModals();
        }

        // 导出全局函数
        window.copyCode = copyCode;
        window.copyModalCode = copyModalCode;
        window.closeModal = closeModal;
        window.showCodeModal = showCodeModal;
        window.showGiftModal = showGiftModal;
    </script>
</body>
</html>`;
}

// ============================================
// 主路由处理
// ============================================

export default {
  async fetch(request, env, ctx) {
    try {
      // 初始化数据库（仅在首次访问时执行）
      if (!env.DATABASE_INITIALIZED) {
        console.log('首次访问，开始初始化数据库...');
        await initDatabase(env);
        env.DATABASE_INITIALIZED = true;
        console.log('数据库初始化完成');
      }

      // 清理过期会话
      await cleanupSessions(env);
    } catch (initError) {
      console.error('Initialization error:', initError);
      // 即使初始化失败，也继续处理请求
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // 处理CORS预检请求
    if (method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders(env, request),
      });
    }

    // 定期清理过期会话
    ctx.waitUntil(cleanupSessions(env));

    try {
      // 静态页面路由
      if (method === 'GET') {
        switch (path) {
          case '/':
            return htmlResponse(getIndexPageHTML(), 200, env);
          case '/login':
            return htmlResponse(getLoginPageHTML(), 200, env);
        }
      }

      // API路由
      if (path.startsWith('/api/')) {
        switch (path) {
          case '/api/auth/login':
            if (method === 'GET') {
              const authUrl = getOAuthUrl(env, request);
              return jsonResponse({ success: true, authUrl }, 200, env, request);
            }
            break;

          case '/api/oauth/callback':
            if (method === 'GET') {
              const code = url.searchParams.get('code');
              const state = url.searchParams.get('state');

              if (!code) {
                return errorResponse('授权码缺失', 400, env);
              }

              try {
                const { sessionId } = await handleOAuthCallback(env, code, state, request);

                return new Response('', {
                  status: 302,
                  headers: {
                    'Location': '/',
                    'Set-Cookie': `session=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${7 * 24 * 60 * 60}`,
                    ...corsHeaders(env, request),
                  },
                });
              } catch (error) {
                console.error('OAuth callback error:', error);
                return new Response('', {
                  status: 302,
                  headers: {
                    'Location': '/login?error=' + encodeURIComponent(error.message),
                    ...corsHeaders(env, request),
                  },
                });
              }
            }
            break;

          case '/api/user':
            if (method === 'GET') {
              return await handleUserInfo(request, env);
            }
            break;

          case '/api/logout':
            if (method === 'POST') {
              return await handleLogout(request, env);
            }
            break;

          case '/api/checkin':
            if (method === 'POST') {
              return await handleCheckin(request, env);
            }
            break;

          case '/api/modal/check':
            if (method === 'GET') {
              return await handleModalCheck(request, env);
            }
            break;

          case '/api/modal/display':
            if (method === 'POST') {
              return await handleModalDisplay(request, env);
            }
            break;

          case '/api/modal/dismiss':
            if (method === 'POST') {
              return await handleModalDismiss(request, env);
            }
            break;

          case '/api/stats':
            if (method === 'GET') {
              return await handleUserStats(request, env);
            }
            break;

          case '/api/codes/recent':
            if (method === 'GET') {
              return await handleRecentCodes(request, env);
            }
            break;

          case '/api/checkin/status':
            if (method === 'GET') {
              return await handleCheckinStatus(request, env);
            }
            break;

          case '/api/debug/status':
            if (method === 'GET') {
              return await handleDebugStatus(request, env);
            }
            break;
        }
      }

      // 404 处理
      return new Response('Not Found', {
        status: 404,
        headers: corsHeaders(env, request)
      });

    } catch (error) {
      console.error('Request handling error:', error);
      return errorResponse('服务器内部错误', 500, env);
    }
  },
};
