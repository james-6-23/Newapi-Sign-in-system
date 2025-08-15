/**
 * KYX 签到系统 - 超级管理后台 V7
 * 集成用户等级系统和管理员配置功能
 * 支持13级修仙境界等级体系和完整的管理员权限控制
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

function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// ============================================
// 数据库初始化函数
// ============================================

async function initializeDatabase(env) {
  try {
    // 首先确保基础表存在
    await createBaseTables(env);

    // 检查是否需要初始化等级系统表
    const levelTableExists = await env.DB.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='user_levels'
    `).first();

    if (!levelTableExists) {
      console.log('🎯 初始化等级系统数据库表...');
      await createLevelSystemTables(env);
      await insertLevelSystemData(env);
      console.log('✅ 等级系统数据库初始化完成');
    }

    // 检查是否需要初始化管理员配置表
    const adminPermTableExists = await env.DB.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='admin_permissions'
    `).first();

    if (!adminPermTableExists) {
      console.log('⚙️ 初始化管理员配置系统表...');
      await createAdminConfigTables(env);
      await insertAdminConfigData(env);
      console.log('✅ 管理员配置系统初始化完成');
    }

    // 确保用户表有等级相关字段
    await updateUserTableForLevelSystem(env);

    // 抽奖系统相关表与默认配置
    await createLotteryTables(env);

    // 如果系统配置表为空，插入默认配置
    const lotteryConfigCount = await env.DB.prepare(`
      SELECT COUNT(*) as cnt FROM lottery_system_config
    `).first().catch(() => null);

    if (!lotteryConfigCount || lotteryConfigCount.cnt === 0) {
      console.log('🎰 初始化抽奖系统默认配置...');
      await insertLotteryConfigDefaults(env);
      console.log('✅ 抽奖系统默认配置初始化完成');
    }

    // 注意：管理员账户需要在数据库中手动创建

  } catch (error) {
    console.error('❌ 数据库初始化失败:', error);
  }
}

async function createBaseTables(env) {
  // 创建基础表（如果不存在）
  const baseTables = [
    // 管理员表
    `CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      email TEXT,
      role TEXT DEFAULT 'admin',
      is_active BOOLEAN DEFAULT TRUE,
      created_at TEXT NOT NULL,
      last_login_at TEXT,
      created_by INTEGER,
      notes TEXT
    )`,

    // 管理员会话表
    `CREATE TABLE IF NOT EXISTS admin_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT UNIQUE NOT NULL,
      admin_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_accessed_at TEXT,
      is_active BOOLEAN DEFAULT TRUE,
      ip_address TEXT,
      user_agent TEXT,
      FOREIGN KEY (admin_id) REFERENCES admins (id)
    )`,

    // 用户表
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      linux_do_id INTEGER UNIQUE,
      username TEXT NOT NULL,
      email TEXT,
      avatar_url TEXT,
      total_checkins INTEGER DEFAULT 0,
      consecutive_days INTEGER DEFAULT 0,
      max_consecutive_days INTEGER DEFAULT 0,
      last_checkin_date TEXT,
      level INTEGER DEFAULT 1,
      experience INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      is_active BOOLEAN DEFAULT TRUE
    )`,

    // 签到记录表
    `CREATE TABLE IF NOT EXISTS check_ins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      check_in_date TEXT NOT NULL,
      consecutive_days INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users (id),
      UNIQUE(user_id, check_in_date)
    )`,

    // 兑换码表
    `CREATE TABLE IF NOT EXISTS redemption_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      amount REAL NOT NULL,
      is_used BOOLEAN DEFAULT FALSE,
      is_distributed BOOLEAN DEFAULT FALSE,
      used_by INTEGER,
      used_at TEXT,
      distributed_to INTEGER,
      distributed_at TEXT,
      distributed_by INTEGER,
      distribution_type TEXT,
      distribution_time TEXT,
      batch_id INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY (used_by) REFERENCES users (id),
      FOREIGN KEY (distributed_to) REFERENCES users (id),
      FOREIGN KEY (distributed_by) REFERENCES admins (id),
      FOREIGN KEY (batch_id) REFERENCES upload_batches (id)
    )`,

    // 弹窗配置表
    `CREATE TABLE IF NOT EXISTS modal_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      modal_type TEXT UNIQUE NOT NULL,
      max_display_count INTEGER DEFAULT 1,
      cooldown_minutes INTEGER DEFAULT 0,
      description TEXT,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TEXT DEFAULT (datetime('now'))
    )`,

    // 上传批次表
    `CREATE TABLE IF NOT EXISTS upload_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      amount REAL NOT NULL,
      total_codes INTEGER NOT NULL,
      valid_codes INTEGER NOT NULL,
      duplicate_codes INTEGER NOT NULL,
      invalid_codes INTEGER NOT NULL,
      uploaded_by INTEGER NOT NULL,
      uploaded_at TEXT NOT NULL,
      processed_at TEXT,
      upload_status TEXT DEFAULT 'pending',
      notes TEXT,
      FOREIGN KEY (uploaded_by) REFERENCES admins (id)
    )`,

    // 操作日志表
    `CREATE TABLE IF NOT EXISTS operation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operator_type TEXT NOT NULL,
      operator_id INTEGER NOT NULL,
      operation_type TEXT NOT NULL,
      operation_detail TEXT,
      target_type TEXT,
      target_id INTEGER,
      result TEXT NOT NULL,
      created_at TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT
    )`,

    // 发放日志表
    `CREATE TABLE IF NOT EXISTS distribution_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER NOT NULL,
      operation_type TEXT NOT NULL,
      target_users TEXT,
      amount REAL,
      codes_distributed INTEGER NOT NULL,
      codes_failed INTEGER NOT NULL,
      status TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      FOREIGN KEY (admin_id) REFERENCES admins (id)
    )`,

    // 弹窗显示记录表
    `CREATE TABLE IF NOT EXISTS modal_display_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      notification_id TEXT,
      modal_type TEXT NOT NULL,
      modal_key TEXT NOT NULL,
      display_count INTEGER DEFAULT 1,
      is_dismissed BOOLEAN DEFAULT FALSE,
      created_at TEXT DEFAULT (datetime('now')),
      dismissed_at TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users (id)
    )`,

    // 签到奖励配置表
    `CREATE TABLE IF NOT EXISTS checkin_rewards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      consecutive_days INTEGER NOT NULL,
      reward_amount REAL NOT NULL,
      reward_type TEXT DEFAULT 'money',
      description TEXT,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TEXT DEFAULT (datetime('now'))
    )`
  ];

  for (const sql of baseTables) {
    await env.DB.prepare(sql).run();
  }

  // 创建基础索引
  const baseIndexes = [
    'CREATE INDEX IF NOT EXISTS idx_users_linux_do_id ON users(linux_do_id)',
    'CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)',
    'CREATE INDEX IF NOT EXISTS idx_checkins_user_date ON check_ins(user_id, check_in_date)',
    'CREATE INDEX IF NOT EXISTS idx_codes_code ON redemption_codes(code)',
    'CREATE INDEX IF NOT EXISTS idx_codes_distributed ON redemption_codes(is_distributed)',
    'CREATE INDEX IF NOT EXISTS idx_admin_sessions_session_id ON admin_sessions(session_id)',
    'CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin_id ON admin_sessions(admin_id)'
  ];

  for (const sql of baseIndexes) {
    await env.DB.prepare(sql).run();
  }
}

async function updateUserTableForLevelSystem(env) {
  try {
    // 检查用户表是否有等级相关字段，如果没有则添加
    const tableInfo = await env.DB.prepare(`PRAGMA table_info(users)`).all();
    const columns = tableInfo.results.map(col => col.name);

    if (!columns.includes('level')) {
      await env.DB.prepare(`ALTER TABLE users ADD COLUMN level INTEGER DEFAULT 1`).run();
    }

    if (!columns.includes('experience')) {
      await env.DB.prepare(`ALTER TABLE users ADD COLUMN experience INTEGER DEFAULT 0`).run();
    }

    // 为现有用户初始化等级数据
    await env.DB.prepare(`
      UPDATE users
      SET level = 1, experience = 0
      WHERE level IS NULL OR experience IS NULL
    `).run();

  } catch (error) {
    console.error('更新用户表失败:', error);
  }
}



async function createLevelSystemTables(env) {
  const tables = [
    // 等级配置表
    `CREATE TABLE IF NOT EXISTS user_levels (
      id INTEGER PRIMARY KEY,
      level_name TEXT NOT NULL,
      level_description TEXT,
      required_experience INTEGER NOT NULL,
      required_checkin_days INTEGER NOT NULL,
      required_consecutive_days INTEGER DEFAULT 0,
      daily_experience_bonus INTEGER DEFAULT 0,
      checkin_reward_multiplier REAL DEFAULT 1.0,
      special_privileges TEXT,
      level_color TEXT DEFAULT '#666666',
      level_icon TEXT,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,

    // 用户经验记录表
    `CREATE TABLE IF NOT EXISTS user_experience_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      experience_type TEXT NOT NULL,
      experience_amount INTEGER NOT NULL,
      source_id INTEGER,
      source_type TEXT,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users (id)
    )`,

    // 用户等级历史表
    `CREATE TABLE IF NOT EXISTS user_level_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      old_level INTEGER NOT NULL,
      new_level INTEGER NOT NULL,
      old_experience INTEGER NOT NULL,
      new_experience INTEGER NOT NULL,
      level_up_reason TEXT,
      level_up_time TEXT DEFAULT (datetime('now')),
      checkin_days_at_levelup INTEGER,
      consecutive_days_at_levelup INTEGER,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )`,

    // 等级奖励配置表
    `CREATE TABLE IF NOT EXISTS level_rewards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level_id INTEGER NOT NULL,
      reward_type TEXT NOT NULL,
      reward_amount REAL NOT NULL,
      reward_description TEXT,
      is_one_time BOOLEAN DEFAULT TRUE,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (level_id) REFERENCES user_levels (id)
    )`,

    // 用户等级奖励领取记录表
    `CREATE TABLE IF NOT EXISTS user_level_rewards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      level_id INTEGER NOT NULL,
      reward_id INTEGER NOT NULL,
      reward_amount REAL NOT NULL,
      claimed_at TEXT DEFAULT (datetime('now')),
      status TEXT DEFAULT 'claimed',
      FOREIGN KEY (user_id) REFERENCES users (id),
      FOREIGN KEY (level_id) REFERENCES user_levels (id),
      FOREIGN KEY (reward_id) REFERENCES level_rewards (id),
      UNIQUE(user_id, reward_id)
    )`,

    // 经验获取规则配置表
    `CREATE TABLE IF NOT EXISTS experience_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_name TEXT NOT NULL,
      rule_type TEXT NOT NULL,
      base_experience INTEGER NOT NULL,
      bonus_conditions TEXT,
      max_daily_gain INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT TRUE,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`
  ];

  for (const sql of tables) {
    await env.DB.prepare(sql).run();
  }

  // 创建索引
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_users_level ON users(level)',
    'CREATE INDEX IF NOT EXISTS idx_users_experience ON users(experience)',
    'CREATE INDEX IF NOT EXISTS idx_exp_logs_user_id ON user_experience_logs(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_exp_logs_type ON user_experience_logs(experience_type)',
    'CREATE INDEX IF NOT EXISTS idx_level_history_user_id ON user_level_history(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_level_rewards_level ON level_rewards(level_id)',
    'CREATE INDEX IF NOT EXISTS idx_user_rewards_user ON user_level_rewards(user_id)'
  ];

  for (const sql of indexes) {
    await env.DB.prepare(sql).run();
  }
}

// 创建抽奖系统相关表
async function createLotteryTables(env) {
  const tables = [
    // 奖品池表
    `CREATE TABLE IF NOT EXISTS prize_pool (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prize_name TEXT NOT NULL,
      prize_description TEXT,
      prize_type TEXT NOT NULL, -- redemption_code | experience | signin_effect
      prize_value REAL NOT NULL,
      prize_rarity TEXT NOT NULL, -- common | rare | epic | legendary
      prize_icon TEXT,
      prize_color TEXT,
      effect_duration INTEGER DEFAULT 0, -- 小时
      effect_multiplier REAL DEFAULT 1.0,
      is_punishment BOOLEAN DEFAULT FALSE,
      min_user_level INTEGER DEFAULT 1,
      max_user_level INTEGER DEFAULT 13,
      is_active BOOLEAN DEFAULT TRUE,
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT
    )`,

    // 转盘配置表
    `CREATE TABLE IF NOT EXISTS wheel_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      config_name TEXT NOT NULL,
      target_user_level INTEGER NOT NULL,
      max_daily_spins INTEGER DEFAULT 3,
      spin_cost_type TEXT DEFAULT 'free',
      spin_cost_amount REAL DEFAULT 0,
      pity_threshold INTEGER DEFAULT 10,
      pity_prize_id INTEGER,
      active_start_time TEXT,
      active_end_time TEXT,
      description TEXT,
      is_active BOOLEAN DEFAULT TRUE,
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT,
      FOREIGN KEY (pity_prize_id) REFERENCES prize_pool (id)
    )`,

    // 转盘物品表
    `CREATE TABLE IF NOT EXISTS wheel_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wheel_config_id INTEGER NOT NULL,
      prize_id INTEGER NOT NULL,
      probability INTEGER NOT NULL,
      position_index INTEGER NOT NULL,
      is_pity_item BOOLEAN DEFAULT FALSE,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (wheel_config_id) REFERENCES wheel_config (id),
      FOREIGN KEY (prize_id) REFERENCES prize_pool (id)
    )`,

    // 用户抽奖记录表
    `CREATE TABLE IF NOT EXISTS user_lottery_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      wheel_config_id INTEGER NOT NULL,
      prize_id INTEGER NOT NULL,
      spin_result_position INTEGER,
      is_pity_triggered BOOLEAN DEFAULT FALSE,
      user_level_at_spin INTEGER,
      user_experience_at_spin INTEGER,
      spin_timestamp TEXT DEFAULT (datetime('now')),
      reward_delivered BOOLEAN DEFAULT FALSE,
      delivery_status TEXT,
      delivery_error TEXT,
      FOREIGN KEY (user_id) REFERENCES users (id),
      FOREIGN KEY (wheel_config_id) REFERENCES wheel_config (id),
      FOREIGN KEY (prize_id) REFERENCES prize_pool (id)
    )`,

    // 用户抽奖统计表
    `CREATE TABLE IF NOT EXISTS user_lottery_stats (
      user_id INTEGER NOT NULL,
      wheel_config_id INTEGER NOT NULL,
      total_spins INTEGER DEFAULT 0,
      daily_spins INTEGER DEFAULT 0,
      pity_counter INTEGER DEFAULT 0,
      last_spin_date TEXT,
      total_rewards_value REAL DEFAULT 0,
      best_prize_rarity TEXT DEFAULT 'common',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT,
      PRIMARY KEY (user_id, wheel_config_id)
    )`,

    // 抽奖系统配置表
    `CREATE TABLE IF NOT EXISTS lottery_system_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      config_key TEXT UNIQUE NOT NULL,
      config_value TEXT NOT NULL,
      config_type TEXT NOT NULL, -- boolean | integer | float | json | text
      config_description TEXT,
      is_editable BOOLEAN DEFAULT TRUE,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT
    )`,

    // 用户活动效果表（用于签到效果等增益）
    `CREATE TABLE IF NOT EXISTS user_activity_effects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      effect_type TEXT NOT NULL, -- signin_effect 等
      effect_value REAL DEFAULT 0,
      effect_multiplier REAL DEFAULT 1.0,
      source_prize_id INTEGER,
      source_lottery_id INTEGER,
      start_time TEXT DEFAULT (datetime('now')),
      end_time TEXT,
      description TEXT,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users (id),
      FOREIGN KEY (source_prize_id) REFERENCES prize_pool (id),
      FOREIGN KEY (source_lottery_id) REFERENCES user_lottery_records (id)
    )`
  ];

  for (const sql of tables) {
    await env.DB.prepare(sql).run();
  }

  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_prize_type ON prize_pool(prize_type)',
    'CREATE INDEX IF NOT EXISTS idx_prize_rarity ON prize_pool(prize_rarity)',
    'CREATE INDEX IF NOT EXISTS idx_wheel_target_level ON wheel_config(target_user_level)',
    'CREATE INDEX IF NOT EXISTS idx_wheel_active ON wheel_config(is_active)',
    'CREATE INDEX IF NOT EXISTS idx_wheel_items_wheel ON wheel_items(wheel_config_id)',
    'CREATE INDEX IF NOT EXISTS idx_user_lottery_records_user ON user_lottery_records(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_user_lottery_records_wheel ON user_lottery_records(wheel_config_id)',
    'CREATE INDEX IF NOT EXISTS idx_user_activity_effects_user ON user_activity_effects(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_user_activity_effects_type ON user_activity_effects(effect_type)'
  ];

  for (const sql of indexes) {
    await env.DB.prepare(sql).run();
  }
}

// 插入抽奖系统默认配置
async function insertLotteryConfigDefaults(env) {
  const defaults = [
    ['system_enabled', 'true', 'boolean', '是否启用抽奖系统', true],
    ['max_daily_spins_global', '10', 'integer', '全局每日最大抽奖次数（可被转盘覆盖）', true],
    ['pity_system_enabled', 'true', 'boolean', '是否启用保底机制', true]
  ];

  for (const [key, value, type, desc, editable] of defaults) {
    await env.DB.prepare(`
      INSERT OR IGNORE INTO lottery_system_config
      (config_key, config_value, config_type, config_description, is_editable)
      VALUES (?, ?, ?, ?, ?)
    `).bind(key, value, type, desc, editable ? 1 : 0).run();
  }
}

async function createAdminConfigTables(env) {
  const tables = [
    // 管理员权限表
    `CREATE TABLE IF NOT EXISTS admin_permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER NOT NULL,
      permission_type TEXT NOT NULL,
      permission_level TEXT NOT NULL,
      granted_by INTEGER,
      granted_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT,
      is_active BOOLEAN DEFAULT TRUE,
      notes TEXT,
      FOREIGN KEY (admin_id) REFERENCES admins (id),
      FOREIGN KEY (granted_by) REFERENCES admins (id),
      UNIQUE(admin_id, permission_type)
    )`,

    // 管理员操作日志表
    `CREATE TABLE IF NOT EXISTS admin_operation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER NOT NULL,
      operation_type TEXT NOT NULL,
      operation_target TEXT NOT NULL,
      target_id INTEGER,
      old_values TEXT,
      new_values TEXT,
      operation_reason TEXT,
      affected_users_count INTEGER DEFAULT 0,
      operation_status TEXT DEFAULT 'pending',
      approved_by INTEGER,
      approved_at TEXT,
      applied_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      ip_address TEXT,
      user_agent TEXT,
      FOREIGN KEY (admin_id) REFERENCES admins (id),
      FOREIGN KEY (approved_by) REFERENCES admins (id)
    )`,

    // 等级配置版本表
    `CREATE TABLE IF NOT EXISTS level_config_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version_name TEXT NOT NULL,
      version_description TEXT,
      config_data TEXT NOT NULL,
      created_by INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      is_active BOOLEAN DEFAULT FALSE,
      effective_from TEXT,
      effective_until TEXT,
      rollback_version_id INTEGER,
      FOREIGN KEY (created_by) REFERENCES admins (id)
    )`,

    // 配置变更审核表
    `CREATE TABLE IF NOT EXISTS config_change_approvals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      change_type TEXT NOT NULL,
      change_id INTEGER NOT NULL,
      submitted_by INTEGER NOT NULL,
      submitted_at TEXT DEFAULT (datetime('now')),
      approval_status TEXT DEFAULT 'pending',
      approver_id INTEGER,
      approval_comments TEXT,
      approved_at TEXT,
      priority_level TEXT DEFAULT 'normal',
      estimated_impact TEXT,
      rollback_plan TEXT,
      FOREIGN KEY (submitted_by) REFERENCES admins (id),
      FOREIGN KEY (approver_id) REFERENCES admins (id)
    )`,

    // 系统配置参数表
    `CREATE TABLE IF NOT EXISTS system_config_parameters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      config_category TEXT NOT NULL,
      config_key TEXT NOT NULL,
      config_value TEXT NOT NULL,
      config_type TEXT NOT NULL,
      config_description TEXT,
      default_value TEXT,
      validation_rules TEXT,
      is_editable BOOLEAN DEFAULT TRUE,
      requires_approval BOOLEAN DEFAULT FALSE,
      last_modified_by INTEGER,
      last_modified_at TEXT,
      FOREIGN KEY (last_modified_by) REFERENCES admins (id),
      UNIQUE(config_category, config_key)
    )`
  ];

  for (const sql of tables) {
    await env.DB.prepare(sql).run();
  }

  // 创建索引
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_admin_permissions_admin ON admin_permissions(admin_id)',
    'CREATE INDEX IF NOT EXISTS idx_admin_permissions_type ON admin_permissions(permission_type)',
    'CREATE INDEX IF NOT EXISTS idx_admin_logs_admin ON admin_operation_logs(admin_id)',
    'CREATE INDEX IF NOT EXISTS idx_admin_logs_type ON admin_operation_logs(operation_type)',
    'CREATE INDEX IF NOT EXISTS idx_approvals_status ON config_change_approvals(approval_status)',
    'CREATE INDEX IF NOT EXISTS idx_system_config_category ON system_config_parameters(config_category)'
  ];

  for (const sql of indexes) {
    await env.DB.prepare(sql).run();
  }
}

async function insertLevelSystemData(env) {
  // 插入13个修仙境界等级
  const levels = [
    [1, '炼气', '修仙入门境界，初窥修炼门径', 0, 0, 0, 10, 1.0, '{"description": "新手修炼者"}', '#8B4513', '🌱'],
    [2, '筑基', '巩固根基，为后续修炼打下坚实基础', 100, 7, 3, 15, 1.1, '{"description": "根基稳固", "bonus": "签到奖励+10%"}', '#CD853F', '🏗️'],
    [3, '结丹', '凝聚金丹，修为大幅提升', 300, 15, 5, 20, 1.2, '{"description": "金丹凝聚", "bonus": "签到奖励+20%"}', '#DAA520', '💊'],
    [4, '元婴', '元婴出窍，神识大增', 600, 30, 7, 25, 1.3, '{"description": "元婴境界", "bonus": "签到奖励+30%"}', '#FF6347', '👶'],
    [5, '化神', '化神通玄，掌握神通', 1000, 50, 10, 30, 1.4, '{"description": "化神境界", "bonus": "签到奖励+40%"}', '#FF4500', '🔮'],
    [6, '炼虚', '炼化虚空，超脱凡俗', 1500, 75, 15, 35, 1.5, '{"description": "炼虚境界", "bonus": "签到奖励+50%"}', '#9370DB', '🌌'],
    [7, '合体', '天人合一，与道相合', 2200, 100, 20, 40, 1.6, '{"description": "合体境界", "bonus": "签到奖励+60%"}', '#4169E1', '☯️'],
    [8, '大乘', '大乘境界，接近仙道', 3000, 150, 25, 50, 1.8, '{"description": "大乘境界", "bonus": "签到奖励+80%"}', '#0000FF', '🌟'],
    [9, '真仙', '踏入仙境，超脱生死', 4000, 200, 30, 60, 2.0, '{"description": "真仙境界", "bonus": "签到奖励翻倍"}', '#FFD700', '✨'],
    [10, '金仙', '金仙之体，不朽不灭', 5500, 300, 40, 75, 2.5, '{"description": "金仙境界", "bonus": "签到奖励+150%"}', '#FFA500', '👑'],
    [11, '太乙', '太乙境界，掌控时空', 7500, 450, 50, 100, 3.0, '{"description": "太乙境界", "bonus": "签到奖励+200%"}', '#FF1493', '⏰'],
    [12, '大罗', '大罗金仙，超越时空', 10000, 600, 60, 150, 4.0, '{"description": "大罗金仙", "bonus": "签到奖励+300%"}', '#DC143C', '🌠'],
    [13, '道祖', '道祖境界，开天辟地', 15000, 1000, 100, 200, 5.0, '{"description": "道祖境界", "bonus": "签到奖励+400%"}', '#8A2BE2', '🌍']
  ];

  for (const level of levels) {
    await env.DB.prepare(`
      INSERT OR REPLACE INTO user_levels
      (id, level_name, level_description, required_experience, required_checkin_days, required_consecutive_days,
       daily_experience_bonus, checkin_reward_multiplier, special_privileges, level_color, level_icon, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(...level, getUTC8TimestampString(), getUTC8TimestampString()).run();
  }

  // 插入等级奖励
  const rewards = [
    [2, 'money', 20.00, '筑基成功奖励'],
    [3, 'money', 50.00, '结丹成功奖励'],
    [4, 'money', 100.00, '元婴出窍奖励'],
    [5, 'money', 200.00, '化神通玄奖励'],
    [6, 'money', 350.00, '炼虚超脱奖励'],
    [7, 'money', 500.00, '天人合一奖励'],
    [8, 'money', 800.00, '大乘境界奖励'],
    [9, 'money', 1200.00, '踏入仙境奖励'],
    [10, 'money', 2000.00, '金仙不朽奖励'],
    [11, 'money', 3500.00, '太乙时空奖励'],
    [12, 'money', 6000.00, '大罗金仙奖励'],
    [13, 'money', 10000.00, '道祖至尊奖励']
  ];

  for (const reward of rewards) {
    await env.DB.prepare(`
      INSERT OR REPLACE INTO level_rewards (level_id, reward_type, reward_amount, reward_description, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(...reward, getUTC8TimestampString()).run();
  }

  // 插入经验规则
  const rules = [
    ['每日签到', 'daily_checkin', 10, '{"consecutive_multiplier": 1.1}', '每日签到基础经验'],
    ['连续签到奖励', 'consecutive_bonus', 5, '{"min_consecutive": 3}', '连续签到3天以上额外奖励'],
    ['完美签到', 'perfect_checkin', 20, '{"consecutive_days": 7}', '连续签到7天完美奖励'],
    ['月度坚持', 'monthly_bonus', 100, '{"consecutive_days": 30}', '连续签到30天月度奖励']
  ];

  for (const rule of rules) {
    await env.DB.prepare(`
      INSERT OR REPLACE INTO experience_rules (rule_name, rule_type, base_experience, bonus_conditions, description, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(...rule, getUTC8TimestampString()).run();
  }
}

async function insertAdminConfigData(env) {
  // 插入系统配置参数
  const configs = [
    ['level_system', 'max_level', '13', 'integer', '系统最大等级数', '13'],
    ['level_system', 'enable_level_rewards', 'true', 'boolean', '是否启用等级奖励', 'true'],
    ['experience_system', 'daily_exp_limit', '1000', 'integer', '每日经验获取上限', '1000'],
    ['experience_system', 'consecutive_bonus_cap', '5.0', 'float', '连续签到加成上限倍数', '5.0'],
    ['admin_system', 'require_approval_for_level_changes', 'false', 'boolean', '等级配置变更是否需要审核', 'false'],
    ['admin_system', 'require_approval_for_experience_changes', 'false', 'boolean', '经验规则变更是否需要审核', 'false']
  ];

  for (const config of configs) {
    await env.DB.prepare(`
      INSERT OR REPLACE INTO system_config_parameters
      (config_category, config_key, config_value, config_type, config_description, default_value, last_modified_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(...config, getUTC8TimestampString()).run();
  }

  // 为超级管理员分配权限（假设admin_id=1是超级管理员）
  const permissions = [
    [1, 'level_config', 'admin', 1, '超级管理员默认权限'],
    [1, 'experience_rules', 'admin', 1, '超级管理员默认权限'],
    [1, 'rewards_config', 'admin', 1, '超级管理员默认权限'],
    [1, 'system_settings', 'admin', 1, '超级管理员默认权限']
  ];

  for (const perm of permissions) {
    await env.DB.prepare(`
      INSERT OR IGNORE INTO admin_permissions (admin_id, permission_type, permission_level, granted_by, notes, granted_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(...perm, getUTC8TimestampString()).run();
  }
}

// ============================================
// 性能优化 - KV缓存管理器
// ============================================

class CacheManager {
  constructor(env) {
    this.env = env;
    this.KV = env.KV;
    this.isKVAvailable = !!env.KV;

    // 详细的KV连接检测
    console.log('🔍 KV连接检测:', {
      'env.KV存在': !!env.KV,
      'KV类型': typeof env.KV,
      'KV对象': env.KV ? 'KV对象已绑定' : 'KV对象未绑定',
      '所有环境变量': Object.keys(env)
    });

    if (!this.isKVAvailable) {
      console.warn('⚠️ KV not bound - caching disabled, falling back to direct DB queries');
      console.warn('💡 请检查wrangler.toml中的KV绑定配置或Cloudflare Dashboard中的KV绑定设置');
    } else {
      console.log('✅ KV已成功绑定，缓存功能已启用');
      // 测试KV连接
      this.testKVConnection();
    }

    // 缓存策略配置
    this.cacheConfig = {
      // 静态数据 - 长缓存
      levelConfigs: { ttl: 24 * 3600, key: 'level_configs' },
      systemStats: { ttl: 12 * 3600, key: 'system_stats' },

      // 半静态数据 - 中等缓存
      leaderboard: { ttl: 5 * 60, key: 'leaderboard' },
      userStats: { ttl: 10 * 60, key: 'user_stats' },
      totalUsers: { ttl: 30 * 60, key: 'total_users' },

      // 动态数据 - 短缓存
      userList: { ttl: 2 * 60, key: 'user_list' },
      recentCheckins: { ttl: 1 * 60, key: 'recent_checkins' },
      userProfile: { ttl: 2 * 60, key: 'user_profile' }
    };
  }

  // 生成缓存键
  generateKey(type, params = {}) {
    const config = this.cacheConfig[type];
    if (!config) throw new Error(`Unknown cache type: ${type}`);

    const paramStr = Object.keys(params).length > 0 ?
      '_' + Object.entries(params).map(([k, v]) => `${k}:${v}`).join('_') : '';

    return `${config.key}${paramStr}`;
  }

  // 测试KV连接
  async testKVConnection() {
    try {
      console.log('🧪 测试KV连接...');
      const testKey = 'kv_connection_test';
      const testValue = { timestamp: Date.now(), test: true };

      // 测试写入
      await this.KV.put(testKey, JSON.stringify(testValue));
      console.log('✅ KV写入测试成功');

      // 测试读取
      const retrieved = await this.KV.get(testKey, 'json');
      if (retrieved && retrieved.test) {
        console.log('✅ KV读取测试成功');
        console.log('🎉 KV连接完全正常，缓存功能可用！');
      } else {
        console.error('❌ KV读取测试失败');
      }

      // 清理测试数据
      await this.KV.delete(testKey);
      console.log('🧹 清理KV测试数据完成');

    } catch (error) {
      console.error('❌ KV连接测试失败:', error);
      console.error('💡 可能的原因: KV绑定配置错误或权限问题');
      this.isKVAvailable = false;
    }
  }

  // 获取缓存数据
  async get(type, params = {}) {
    try {
      const key = this.generateKey(type, params);
      const cached = await this.KV.get(key, 'json');

      if (cached && cached.timestamp) {
        const config = this.cacheConfig[type];
        const age = (Date.now() - cached.timestamp) / 1000;

        if (age < config.ttl) {
          console.log(`🎯 Cache HIT: ${key} (age: ${Math.round(age)}s)`);
          return cached.data;
        } else {
          console.log(`⏰ Cache EXPIRED: ${key} (age: ${Math.round(age)}s)`);
        }
      }

      console.log(`❌ Cache MISS: ${key}`);
      return null;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  // 设置缓存数据
  async set(type, data, params = {}) {
    try {
      const key = this.generateKey(type, params);
      const config = this.cacheConfig[type];

      const cacheData = {
        data: data,
        timestamp: Date.now(),
        type: type
      };

      await this.KV.put(key, JSON.stringify(cacheData), {
        expirationTtl: config.ttl
      });

      console.log(`✅ Cache SET: ${key} (TTL: ${config.ttl}s)`);
      return true;
    } catch (error) {
      console.error('Cache set error:', error);
      return false;
    }
  }

  // 删除缓存
  async delete(type, params = {}) {
    try {
      const key = this.generateKey(type, params);
      await this.KV.delete(key);
      console.log(`🗑️ Cache DELETE: ${key}`);
      return true;
    } catch (error) {
      console.error('Cache delete error:', error);
      return false;
    }
  }

  // 批量删除相关缓存
  async invalidatePattern(pattern) {
    try {
      // 由于KV不支持模式删除，我们维护一个缓存键列表
      const keyListKey = 'cache_keys_list';
      const keysList = await this.KV.get(keyListKey, 'json') || [];

      const keysToDelete = keysList.filter(key => key.includes(pattern));

      await Promise.all(keysToDelete.map(key => this.KV.delete(key)));

      // 更新键列表
      const remainingKeys = keysList.filter(key => !key.includes(pattern));
      await this.KV.put(keyListKey, JSON.stringify(remainingKeys));

      console.log(`🧹 Cache INVALIDATE: ${keysToDelete.length} keys deleted for pattern: ${pattern}`);
      return keysToDelete.length;
    } catch (error) {
      console.error('Cache invalidate error:', error);
      return 0;
    }
  }

  // 预热缓存
  async warmup() {
    console.log('🔥 Starting comprehensive cache warmup...');

    try {
      const startTime = Date.now();

      // 并行预热所有重要数据
      await Promise.all([
        this.warmupLevelConfigs(),
        this.warmupLeaderboard(),
        this.warmupSystemStats(),
        this.warmupUserList(),
        this.warmupRecentCheckins()
      ]);

      const duration = Date.now() - startTime;
      console.log(`✅ Cache warmup completed in ${duration}ms`);

      return {
        success: true,
        duration: duration,
        message: `缓存预热完成，耗时 ${duration}ms`
      };
    } catch (error) {
      console.error('❌ Cache warmup failed:', error);
      throw error;
    }
  }

  async warmupLevelConfigs() {
    const cached = await this.get('levelConfigs');
    if (!cached) {
      const configs = await this.env.DB.prepare(`
        SELECT * FROM user_levels ORDER BY id ASC
      `).all();

      await this.set('levelConfigs', configs.results || []);
    }
  }

  async warmupLeaderboard() {
    const cached = await this.get('leaderboard');
    if (!cached) {
      const leaderboard = await this.env.DB.prepare(`
        SELECT u.id, u.username, u.avatar_url, u.linux_do_id, u.level,
               ul.level_name, ul.level_color, ul.level_icon,
               u.experience, u.total_checkins, u.consecutive_days, u.max_consecutive_days,
               ROW_NUMBER() OVER (ORDER BY u.level DESC, u.experience DESC, u.total_checkins DESC) as rank
        FROM users u
        LEFT JOIN user_levels ul ON u.level = ul.id
        WHERE u.is_active = TRUE
        ORDER BY u.level DESC, u.experience DESC, u.total_checkins DESC
        LIMIT 50
      `).all();

      await this.set('leaderboard', leaderboard.results || []);
    }
  }

  async warmupSystemStats() {
    const cached = await this.get('systemStats');
    if (!cached) {
      const stats = await this.env.DB.prepare(`
        SELECT
          COUNT(*) as total_users,
          COUNT(CASE WHEN last_checkin_date = date('now') THEN 1 END) as today_checkins,
          COUNT(CASE WHEN last_checkin_date >= date('now', '-7 days') THEN 1 END) as week_active_users
        FROM users WHERE is_active = 1
      `).first();

      await this.set('systemStats', stats);
      console.log('🔥 Warmed up system stats');
    }
  }

  async warmupUserList() {
    // 预热前3页用户数据
    for (let page = 1; page <= 3; page++) {
      const cached = await this.get('userList', { page, limit: 10 });
      if (!cached) {
        const offset = (page - 1) * 10;
        const users = await this.env.DB.prepare(`
          SELECT u.id, u.linux_do_id, u.username, u.email, u.avatar_url,
                 u.total_checkins, u.consecutive_days, u.max_consecutive_days,
                 u.last_checkin_date, u.level, u.experience, u.created_at,
                 u.updated_at, u.is_active,
                 ul.level_name, ul.level_color, ul.level_icon
          FROM users u
          LEFT JOIN user_levels ul ON u.level = ul.id
          WHERE u.is_active = 1
          ORDER BY u.id ASC
          LIMIT 10 OFFSET ?
        `).bind(offset).all();

        const totalUsers = await this.get('totalUsers') || 0;

        const result = {
          users: users.results || [],
          total: totalUsers,
          page: page,
          limit: 10,
          totalPages: Math.ceil(totalUsers / 10)
        };

        await this.set('userList', result, { page, limit: 10 });
      }
    }
    console.log('🔥 Warmed up user list (pages 1-3)');
  }

  async warmupRecentCheckins() {
    const cached = await this.get('recentCheckins');
    if (!cached) {
      const checkins = await this.env.DB.prepare(`
        SELECT c.id, c.user_id, u.username, u.email, u.avatar_url, u.linux_do_id, u.level,
               ul.level_name, ul.level_color, ul.level_icon,
               c.check_in_date, c.check_in_time, c.redemption_code, c.consecutive_days,
               c.reward_amount, c.status, c.created_at
        FROM check_ins c
        LEFT JOIN users u ON c.user_id = u.id
        LEFT JOIN user_levels ul ON u.level = ul.id
        ORDER BY c.created_at DESC
        LIMIT 50
      `).all();

      await this.set('recentCheckins', checkins.results || []);
      console.log('🔥 Warmed up recent checkins');
    }
  }
}

// ============================================
// 测试数据生成函数
// ============================================

async function generateTestUsers(env) {
  console.log('🧪 开始生成测试用户数据...');

  const testUsers = [
    { username: '修仙小白', linux_do_id: 10001, level: 1, experience: 50, consecutive_days: 3, avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4' },
    { username: '炼气高手', linux_do_id: 10002, level: 2, experience: 280, consecutive_days: 7, avatar_url: 'https://avatars.githubusercontent.com/u/2?v=4' },
    { username: '筑基达人', linux_do_id: 10003, level: 3, experience: 650, consecutive_days: 15, avatar_url: 'https://avatars.githubusercontent.com/u/3?v=4' },
    { username: '结丹强者', linux_do_id: 10004, level: 4, experience: 1200, consecutive_days: 25, avatar_url: 'https://avatars.githubusercontent.com/u/4?v=4' },
    { username: '元婴老祖', linux_do_id: 10005, level: 5, experience: 2100, consecutive_days: 40, avatar_url: 'https://avatars.githubusercontent.com/u/5?v=4' },
    { username: '化神真人', linux_do_id: 10006, level: 6, experience: 3500, consecutive_days: 60, avatar_url: 'https://avatars.githubusercontent.com/u/6?v=4' },
    { username: '炼虚大能', linux_do_id: 10007, level: 7, experience: 5500, consecutive_days: 80, avatar_url: 'https://avatars.githubusercontent.com/u/7?v=4' },
    { username: '合体至尊', linux_do_id: 10008, level: 8, experience: 8500, consecutive_days: 100, avatar_url: 'https://avatars.githubusercontent.com/u/8?v=4' },
    { username: '大乘圣者', linux_do_id: 10009, level: 9, experience: 13000, consecutive_days: 120, avatar_url: 'https://avatars.githubusercontent.com/u/9?v=4' },
    { username: '真仙境界', linux_do_id: 10010, level: 10, experience: 20000, consecutive_days: 150, avatar_url: 'https://avatars.githubusercontent.com/u/10?v=4' },
    { username: '金仙无敌', linux_do_id: 10011, level: 11, experience: 30000, consecutive_days: 180, avatar_url: 'https://avatars.githubusercontent.com/u/11?v=4' },
    { username: '太乙金仙', linux_do_id: 10012, level: 12, experience: 45000, consecutive_days: 200, avatar_url: 'https://avatars.githubusercontent.com/u/12?v=4' },
    { username: '大罗金仙', linux_do_id: 10013, level: 13, experience: 65000, consecutive_days: 250, avatar_url: 'https://avatars.githubusercontent.com/u/13?v=4' },
    { username: '道祖转世', linux_do_id: 10014, level: 13, experience: 80000, consecutive_days: 300, avatar_url: 'https://avatars.githubusercontent.com/u/14?v=4' },
    { username: '新手村长', linux_do_id: 10015, level: 1, experience: 20, consecutive_days: 1, avatar_url: 'https://avatars.githubusercontent.com/u/15?v=4' },
    { username: '修炼狂人', linux_do_id: 10016, level: 6, experience: 4200, consecutive_days: 90, avatar_url: 'https://avatars.githubusercontent.com/u/16?v=4' },
    { username: '天才少年', linux_do_id: 10017, level: 4, experience: 1500, consecutive_days: 30, avatar_url: 'https://avatars.githubusercontent.com/u/17?v=4' },
    { username: '散修前辈', linux_do_id: 10018, level: 8, experience: 9200, consecutive_days: 110, avatar_url: 'https://avatars.githubusercontent.com/u/18?v=4' },
    { username: '宗门弟子', linux_do_id: 10019, level: 5, experience: 2800, consecutive_days: 50, avatar_url: 'https://avatars.githubusercontent.com/u/19?v=4' },
    { username: '隐世高人', linux_do_id: 10020, level: 12, experience: 50000, consecutive_days: 220, avatar_url: 'https://avatars.githubusercontent.com/u/20?v=4' }
  ];

  let createdCount = 0;
  let updatedCount = 0;

  for (const userData of testUsers) {
    try {
      // 检查用户是否已存在
      const existingUser = await env.DB.prepare(`
        SELECT id FROM users WHERE linux_do_id = ?
      `).bind(userData.linux_do_id).first();

      if (existingUser) {
        // 更新现有用户
        await env.DB.prepare(`
          UPDATE users SET
            username = ?, level = ?, experience = ?, consecutive_days = ?,
            avatar_url = ?, total_checkins = ?, max_consecutive_days = ?,
            last_checkin_date = date('now', '-' || (? % 3) || ' days'),
            updated_at = datetime('now')
          WHERE linux_do_id = ?
        `).bind(
          userData.username, userData.level, userData.experience, userData.consecutive_days,
          userData.avatar_url, userData.consecutive_days + Math.floor(Math.random() * 50),
          userData.consecutive_days + Math.floor(Math.random() * 20),
          userData.consecutive_days, userData.linux_do_id
        ).run();
        updatedCount++;
      } else {
        // 创建新用户
        await env.DB.prepare(`
          INSERT INTO users (
            linux_do_id, username, email, avatar_url, level, experience,
            consecutive_days, total_checkins, max_consecutive_days,
            last_checkin_date, created_at, updated_at, is_active
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, date('now', '-' || (? % 3) || ' days'), datetime('now'), datetime('now'), 1)
        `).bind(
          userData.linux_do_id, userData.username,
          `${userData.username.toLowerCase()}@example.com`, userData.avatar_url,
          userData.level, userData.experience, userData.consecutive_days,
          userData.consecutive_days + Math.floor(Math.random() * 50),
          userData.consecutive_days + Math.floor(Math.random() * 20),
          userData.consecutive_days
        ).run();
        createdCount++;
      }

      // 为每个用户生成一些签到记录
      const userId = existingUser ? existingUser.id : (await env.DB.prepare(`
        SELECT id FROM users WHERE linux_do_id = ?
      `).bind(userData.linux_do_id).first()).id;

      // 生成最近几天的签到记录
      for (let i = 0; i < Math.min(userData.consecutive_days, 10); i++) {
        const checkinDate = new Date();
        checkinDate.setDate(checkinDate.getDate() - i);
        const dateStr = checkinDate.toISOString().split('T')[0];

        await env.DB.prepare(`
          INSERT OR IGNORE INTO check_ins (
            user_id, check_in_date, consecutive_days, reward_amount, status, created_at
          ) VALUES (?, ?, ?, ?, 'completed', datetime('now', '-' || ? || ' days'))
        `).bind(
          userId, dateStr, userData.consecutive_days - i,
          Math.floor(Math.random() * 20) + 5, i
        ).run();
      }

    } catch (error) {
      console.error(`❌ 创建用户 ${userData.username} 失败:`, error);
    }
  }

  console.log(`✅ 测试数据生成完成: 创建 ${createdCount} 个新用户，更新 ${updatedCount} 个现有用户`);

  return {
    created: createdCount,
    updated: updatedCount,
    total: testUsers.length
  };
}

// 修复所有用户等级
async function fixAllUserLevels(env) {
  console.log('🔧 开始修复所有用户等级...');

  try {
    // 获取所有活跃用户
    const users = await env.DB.prepare(`
      SELECT id, username, experience, total_checkins, consecutive_days, level
      FROM users
      WHERE is_active = 1
      ORDER BY id ASC
    `).all();

    let fixedCount = 0;
    let checkedCount = 0;

    for (const user of users.results || []) {
      checkedCount++;

      // 计算用户应该达到的等级
      const correctLevel = await env.DB.prepare(`
        SELECT id, level_name, required_experience, required_checkin_days, required_consecutive_days
        FROM user_levels
        WHERE required_experience <= ?
          AND required_checkin_days <= ?
          AND (required_consecutive_days <= ? OR required_consecutive_days = 0)
        ORDER BY id DESC
        LIMIT 1
      `).bind(
        user.experience || 0,
        user.total_checkins || 0,
        user.consecutive_days || 0
      ).first();

      if (correctLevel && correctLevel.id !== user.level) {
        // 更新用户等级
        await env.DB.prepare(`
          UPDATE users
          SET level = ?, updated_at = datetime('now')
          WHERE id = ?
        `).bind(correctLevel.id, user.id).run();

        console.log(`✅ 修复用户 ${user.username}(ID:${user.id}): ${user.level} → ${correctLevel.id}(${correctLevel.level_name})`);
        fixedCount++;

        // 记录等级变化历史
        try {
          await env.DB.prepare(`
            INSERT INTO user_level_history (
              user_id, old_level, new_level, old_experience, new_experience,
              level_up_reason, checkin_days_at_levelup, consecutive_days_at_levelup
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            user.id, user.level, correctLevel.id, user.experience, user.experience,
            '管理员批量修复等级', user.total_checkins, user.consecutive_days
          ).run();
        } catch (historyError) {
          console.log(`⚠️ 记录等级历史失败 (用户${user.id}):`, historyError.message);
        }
      }
    }

    console.log(`🎉 等级修复完成: 检查了 ${checkedCount} 个用户，修复了 ${fixedCount} 个用户的等级`);

    return {
      checked: checkedCount,
      fixed: fixedCount,
      message: `检查了 ${checkedCount} 个用户，修复了 ${fixedCount} 个用户的等级`
    };

  } catch (error) {
    console.error('❌ 修复用户等级失败:', error);
    throw error;
  }
}

// ============================================
// 用户等级升级检查函数
// ============================================

async function checkLevelUpgrade(env, userId, newExperience) {
  try {
    // 获取当前用户信息
    const user = await env.DB.prepare(`
      SELECT level, total_checkins, consecutive_days FROM users WHERE id = ?
    `).bind(userId).first();

    if (!user) return 1; // 默认等级

    // 获取用户应该达到的最高等级（考虑经验值、签到天数、连续签到天数）
    const targetLevel = await env.DB.prepare(`
      SELECT id, level_name, required_experience, required_checkin_days, required_consecutive_days
      FROM user_levels
      WHERE required_experience <= ?
        AND required_checkin_days <= ?
        AND (required_consecutive_days <= ? OR required_consecutive_days = 0)
      ORDER BY id DESC
      LIMIT 1
    `).bind(newExperience, user.total_checkins || 0, user.consecutive_days || 0).first();

    if (targetLevel && targetLevel.id > user.level) {
      console.log(`🎉 用户 ${userId} 从等级 ${user.level} 升级到 ${targetLevel.id}(${targetLevel.level_name})！`);
      console.log(`📊 升级条件: 经验值${newExperience}/${targetLevel.required_experience}, 签到${user.total_checkins}/${targetLevel.required_checkin_days}, 连续${user.consecutive_days}/${targetLevel.required_consecutive_days}`);
      return targetLevel.id;
    }

    return user.level;
  } catch (error) {
    console.error('❌ 检查等级升级失败:', error);
    return 1; // 出错时返回默认等级
  }
}

// ============================================
// 管理员认证和权限验证函数
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
      INSERT INTO admin_sessions (session_id, admin_id, expires_at, created_at, last_accessed_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(sessionId, admin.id, expiresAt.toISOString(), getUTC8TimestampString(), getUTC8TimestampString()).run();

    await env.DB.prepare(`
      UPDATE admins SET last_login_at = ? WHERE id = ?
    `).bind(getUTC8TimestampString(), admin.id).run();

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
    `).bind(sessionId, getUTC8TimestampString()).first();

    if (session) {
      await env.DB.prepare(`
        UPDATE admin_sessions SET last_accessed_at = ? WHERE session_id = ?
      `).bind(getUTC8TimestampString(), sessionId).run();
    }

    return session;
  } catch (error) {
    console.error('Session verification error:', error);
    return null;
  }
}

async function checkAdminPermission(env, adminId, permissionType, requiredLevel = 'read') {
  try {
    const permission = await env.DB.prepare(`
      SELECT permission_level, expires_at, is_active
      FROM admin_permissions
      WHERE admin_id = ? AND permission_type = ? AND is_active = TRUE
    `).bind(adminId, permissionType).first();

    if (!permission) return false;

    // 检查权限是否过期
    if (permission.expires_at && new Date(permission.expires_at) < new Date()) {
      return false;
    }

    // 权限级别检查
    const levels = { 'read': 1, 'write': 2, 'admin': 3 };
    return levels[permission.permission_level] >= levels[requiredLevel];
  } catch (error) {
    console.error('Permission check error:', error);
    return false;
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

// ============================================
// 等级系统核心功能
// ============================================

class UserLevelSystem {
  constructor(env) {
    this.env = env;
    this.levelCache = new Map();
    this.experienceRules = new Map();
  }

  async initialize() {
    await this.loadLevelConfigs();
    await this.loadExperienceRules();
  }

  async loadLevelConfigs() {
    const levels = await this.env.DB.prepare(`
      SELECT * FROM user_levels ORDER BY id
    `).all();

    if (levels.results) {
      levels.results.forEach(level => {
        this.levelCache.set(level.id, level);
      });
    }
  }

  async loadExperienceRules() {
    const rules = await this.env.DB.prepare(`
      SELECT * FROM experience_rules WHERE is_active = TRUE
    `).all();

    if (rules.results) {
      rules.results.forEach(rule => {
        this.experienceRules.set(rule.rule_type, rule);
      });
    }
  }

  async calculateCheckinExperience(userId, consecutiveDays, currentLevel) {
    const baseRule = this.experienceRules.get('daily_checkin');
    const levelConfig = this.levelCache.get(currentLevel);

    if (!baseRule || !levelConfig) {
      return 10; // 默认经验值
    }

    let experience = baseRule.base_experience;

    // 等级加成
    experience += levelConfig.daily_experience_bonus || 0;

    // 连续签到加成
    if (consecutiveDays >= 3) {
      const consecutiveBonus = this.experienceRules.get('consecutive_bonus');
      if (consecutiveBonus) {
        const bonusMultiplier = Math.min(consecutiveDays * 0.1, 2.0);
        experience += Math.floor(consecutiveBonus.base_experience * bonusMultiplier);
      }
    }

    // 特殊里程碑奖励
    if (consecutiveDays === 7) {
      const perfectRule = this.experienceRules.get('perfect_checkin');
      if (perfectRule) experience += perfectRule.base_experience;
    }

    if (consecutiveDays === 30) {
      const monthlyRule = this.experienceRules.get('monthly_bonus');
      if (monthlyRule) experience += monthlyRule.base_experience;
    }

    // 应用抽奖系统的签到增益效果
    try {
      const activeEffects = await this.env.DB.prepare(`
        SELECT effect_multiplier
        FROM user_activity_effects
        WHERE user_id = ? AND effect_type = 'signin_effect' AND is_active = TRUE
        AND (end_time IS NULL OR end_time > ?)
        ORDER BY effect_multiplier DESC
        LIMIT 1
      `).bind(userId, getUTC8TimestampString()).first();

      if (activeEffects && activeEffects.effect_multiplier) {
        experience = Math.floor(experience * activeEffects.effect_multiplier);
      }
    } catch (error) {
      console.error('Failed to apply lottery signin effects:', error);
      // 继续使用原始经验值，不因为抽奖系统错误影响签到
    }

    return Math.floor(experience);
  }

  async addUserExperience(userId, experienceAmount, experienceType, description, sourceId = null, sourceType = null) {
    try {
      // 更新用户经验值
      await this.env.DB.prepare(`
        UPDATE users
        SET experience = experience + ?, updated_at = datetime('now')
        WHERE id = ?
      `).bind(experienceAmount, userId).run();

      // 记录经验获得日志
      await this.env.DB.prepare(`
        INSERT INTO user_experience_logs
        (user_id, experience_type, experience_amount, source_id, source_type, description)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(userId, experienceType, experienceAmount, sourceId, sourceType, description).run();

      // 检查是否需要升级
      await this.checkAndProcessLevelUp(userId);
    } catch (error) {
      console.error('Add user experience error:', error);
    }
  }

  async checkAndProcessLevelUp(userId) {
    const user = await this.env.DB.prepare(`
      SELECT id, level, experience, total_checkins, consecutive_days
      FROM users WHERE id = ?
    `).bind(userId).first();

    if (!user) return;

    const newLevel = await this.calculateUserLevel(user.experience, user.total_checkins, user.consecutive_days);

    if (newLevel > user.level) {
      await this.processLevelUp(userId, user.level, newLevel, user.experience);
    }
  }

  async calculateUserLevel(experience, totalCheckins, consecutiveDays) {
    const levels = Array.from(this.levelCache.values()).sort((a, b) => b.id - a.id);

    for (const level of levels) {
      if (experience >= level.required_experience &&
          totalCheckins >= level.required_checkin_days &&
          (level.required_consecutive_days === 0 || consecutiveDays >= level.required_consecutive_days)) {
        return level.id;
      }
    }

    return 1; // 默认炼气境界
  }

  async processLevelUp(userId, oldLevel, newLevel, currentExperience) {
    try {
      // 更新用户等级
      await this.env.DB.prepare(`
        UPDATE users
        SET level = ?, updated_at = datetime('now')
        WHERE id = ?
      `).bind(newLevel, userId).run();

      // 记录等级变化历史
      await this.env.DB.prepare(`
        INSERT INTO user_level_history
        (user_id, old_level, new_level, old_experience, new_experience, level_up_reason)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(userId, oldLevel, newLevel, currentExperience, currentExperience, '经验值达到升级条件').run();

      // 发放升级奖励
      for (let level = oldLevel + 1; level <= newLevel; level++) {
        await this.grantLevelRewards(userId, level);
      }

      console.log(`🎉 用户 ${userId} 从 ${this.getLevelName(oldLevel)} 升级到 ${this.getLevelName(newLevel)}`);
    } catch (error) {
      console.error('Process level up error:', error);
    }
  }

  async grantLevelRewards(userId, levelId) {
    const rewards = await this.env.DB.prepare(`
      SELECT * FROM level_rewards
      WHERE level_id = ? AND is_active = TRUE
    `).bind(levelId).all();

    if (rewards.results) {
      for (const reward of rewards.results) {
        // 检查是否已经领取过
        const existing = await this.env.DB.prepare(`
          SELECT id FROM user_level_rewards
          WHERE user_id = ? AND reward_id = ?
        `).bind(userId, reward.id).first();

        if (!existing) {
          // 发放奖励
          await this.env.DB.prepare(`
            INSERT INTO user_level_rewards
            (user_id, level_id, reward_id, reward_amount, status)
            VALUES (?, ?, ?, ?, 'claimed')
          `).bind(userId, levelId, reward.id, reward.reward_amount).run();
        }
      }
    }
  }

  getLevelName(levelId) {
    const level = this.levelCache.get(levelId);
    return level ? level.level_name : '未知';
  }

  async handleUserCheckin(userId, consecutiveDays, checkinId) {
    const user = await this.env.DB.prepare(`
      SELECT level FROM users WHERE id = ?
    `).bind(userId).first();

    if (!user) return 0;

    // 计算签到经验
    const experience = await this.calculateCheckinExperience(userId, consecutiveDays, user.level);

    // 添加经验
    await this.addUserExperience(
      userId,
      experience,
      'checkin',
      `签到获得经验 (连续${consecutiveDays}天)`,
      checkinId,
      'checkin'
    );

    return experience;
  }
}

// ============================================
// 抽奖系统核心功能
// ============================================

class LotterySystem {
  constructor(env) {
    this.env = env;
    this.config = new Map();
  }

  async initialize() {
    await this.loadSystemConfig();
  }

  async loadSystemConfig() {
    try {
      const configs = await this.env.DB.prepare(`
        SELECT config_key, config_value, config_type
        FROM lottery_system_config
        WHERE is_editable = TRUE
      `).all();

      if (configs.results) {
        configs.results.forEach(config => {
          let value = config.config_value;
          switch (config.config_type) {
            case 'integer':
              value = parseInt(value);
              break;
            case 'float':
              value = parseFloat(value);
              break;
            case 'boolean':
              value = value === 'true';
              break;
            case 'json':
              try {
                value = JSON.parse(value);
              } catch (e) {
                console.error('Failed to parse JSON config:', config.config_key);
              }
              break;
          }
          this.config.set(config.config_key, value);
        });
      }
    } catch (error) {
      console.error('Failed to load lottery system config:', error);
      // 设置默认配置
      this.config.set('system_enabled', true);
      this.config.set('max_daily_spins_global', 10);
      this.config.set('pity_system_enabled', true);
    }
  }

  async performLottery(userId, wheelConfigId) {
    // 验证系统状态
    if (!this.config.get('system_enabled')) {
      throw new Error('抽奖系统暂时关闭');
    }

    // 验证用户状态
    const validation = await this.validateUserStatus(userId, wheelConfigId);

    // 获取转盘配置和物品
    const wheelItems = await this.getWheelItems(wheelConfigId);
    if (!wheelItems || wheelItems.length === 0) {
      throw new Error('转盘配置异常，请联系管理员');
    }

    // 获取用户统计数据
    const userStats = await this.getUserLotteryStats(userId, wheelConfigId);

    // 执行抽奖逻辑
    const winningItem = this.calculateWinningItem(wheelItems, userStats.pity_counter, validation.wheelConfig.pity_threshold);

    // 创建抽奖记录
    const lotteryRecord = await this.createLotteryRecord(userId, wheelConfigId, winningItem, userStats.pity_counter >= validation.wheelConfig.pity_threshold);

    // 发放奖励
    await this.deliverReward(userId, winningItem.prize, lotteryRecord.id);

    // 更新统计数据
    await this.updateUserStats(userId, wheelConfigId, winningItem.prize, userStats.pity_counter >= validation.wheelConfig.pity_threshold);

    return {
      lottery_record: lotteryRecord,
      prize_won: winningItem.prize,
      updated_stats: await this.getUserLotteryStats(userId, wheelConfigId)
    };
  }

  async validateUserStatus(userId, wheelConfigId) {
    // 验证用户等级
    const user = await this.env.DB.prepare(`
      SELECT u.id, u.level, ul.level_name
      FROM users u
      JOIN user_levels ul ON u.level = ul.id
      WHERE u.id = ? AND u.is_active = TRUE
    `).bind(userId).first();

    if (!user) {
      throw new Error('用户不存在或已禁用');
    }

    // 验证转盘权限
    const wheelConfig = await this.env.DB.prepare(`
      SELECT * FROM wheel_config
      WHERE id = ? AND target_user_level = ? AND is_active = TRUE
    `).bind(wheelConfigId, user.level).first();

    if (!wheelConfig) {
      throw new Error('无权使用此转盘或转盘已关闭');
    }

    // 检查活动时间
    const now = getUTC8TimestampString();
    if (wheelConfig.active_start_time && now < wheelConfig.active_start_time) {
      throw new Error('活动尚未开始');
    }
    if (wheelConfig.active_end_time && now > wheelConfig.active_end_time) {
      throw new Error('活动已结束');
    }

    // 验证抽奖次数
    const userStats = await this.getUserLotteryStats(userId, wheelConfigId);
    if (userStats.daily_spins >= wheelConfig.max_daily_spins) {
      throw new Error('今日抽奖次数已用完');
    }

    return { user, wheelConfig };
  }

  calculateWinningItem(wheelItems, pityCounter, pityThreshold) {
    // 检查是否触发保底
    if (pityCounter >= pityThreshold) {
      const pityItems = wheelItems.filter(item => item.is_pity_item ||
        ['epic', 'legendary'].includes(item.prize_rarity));
      if (pityItems.length > 0) {
        return pityItems[Math.floor(Math.random() * pityItems.length)];
      }
    }

    // 正常概率计算
    const totalWeight = wheelItems.reduce((sum, item) => sum + item.probability, 0);
    const randomValue = Math.random() * totalWeight;

    let currentWeight = 0;
    for (const item of wheelItems) {
      currentWeight += item.probability;
      if (randomValue <= currentWeight) {
        return item;
      }
    }

    // 兜底返回第一个物品
    return wheelItems[0];
  }

  async createLotteryRecord(userId, wheelConfigId, winningItem, isPityTriggered) {
    const user = await this.env.DB.prepare(`
      SELECT level, experience FROM users WHERE id = ?
    `).bind(userId).first();

    const result = await this.env.DB.prepare(`
      INSERT INTO user_lottery_records
      (user_id, wheel_config_id, prize_id, spin_result_position, is_pity_triggered,
       user_level_at_spin, user_experience_at_spin, spin_timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      userId, wheelConfigId, winningItem.prize_id, winningItem.position_index,
      isPityTriggered, user?.level || 1, user?.experience || 0, getUTC8TimestampString()
    ).run();

    return {
      id: result.meta.last_row_id,
      spin_result_position: winningItem.position_index,
      is_pity_triggered: isPityTriggered,
      spin_timestamp: getUTC8TimestampString()
    };
  }

  async deliverReward(userId, prize, lotteryRecordId) {
    try {
      switch (prize.prize_type) {
        case 'redemption_code':
          await this.deliverRedemptionCode(userId, prize.prize_value);
          break;
        case 'experience':
          await this.deliverExperience(userId, prize.prize_value, !prize.is_punishment);
          break;
        case 'signin_effect':
          await this.deliverSigninEffect(userId, prize, lotteryRecordId);
          break;
        default:
          throw new Error(`未知奖品类型: ${prize.prize_type}`);
      }

      // 更新发放状态
      await this.env.DB.prepare(`
        UPDATE user_lottery_records
        SET reward_delivered = TRUE, delivery_status = 'success'
        WHERE id = ?
      `).bind(lotteryRecordId).run();

    } catch (error) {
      // 记录发放失败
      await this.env.DB.prepare(`
        UPDATE user_lottery_records
        SET delivery_status = 'failed', delivery_error = ?
        WHERE id = ?
      `).bind(error.message, lotteryRecordId).run();

      throw error;
    }
  }

  async deliverRedemptionCode(userId, amount) {
    // 查找可用兑换码
    const availableCode = await this.env.DB.prepare(`
      SELECT id, code FROM redemption_codes
      WHERE is_distributed = FALSE AND amount = ?
      ORDER BY created_at ASC LIMIT 1
    `).bind(amount).first();

    if (!availableCode) {
      throw new Error(`暂无${amount}元兑换码可供发放`);
    }

    // 分配给用户
    await this.env.DB.prepare(`
      UPDATE redemption_codes
      SET is_distributed = TRUE, distributed_to = ?,
          distributed_at = ?, distribution_type = 'lottery'
      WHERE id = ?
    `).bind(userId, getUTC8TimestampString(), availableCode.id).run();

    return availableCode;
  }

  async deliverExperience(userId, amount, isPositive = true) {
    const finalAmount = isPositive ? Math.abs(amount) : -Math.abs(amount);

    // 调用现有经验系统
    const levelSystem = new UserLevelSystem(this.env);
    await levelSystem.initialize();

    await levelSystem.addUserExperience(
      userId,
      finalAmount,
      'lottery_reward',
      `抽奖${isPositive ? '获得' : '失去'}${Math.abs(amount)}点经验`
    );
  }

  async deliverSigninEffect(userId, prize, lotteryRecordId) {
    const endTime = prize.effect_duration > 0 ?
      new Date(Date.now() + prize.effect_duration * 60 * 60 * 1000).toISOString() : null;

    await this.env.DB.prepare(`
      INSERT INTO user_activity_effects
      (user_id, effect_type, effect_value, effect_multiplier,
       source_prize_id, source_lottery_id, start_time, end_time, description)
      VALUES (?, 'signin_effect', ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      userId, prize.prize_value, prize.effect_multiplier,
      prize.id, lotteryRecordId, getUTC8TimestampString(), endTime,
      `${prize.prize_name} - ${prize.prize_description}`
    ).run();
  }

  async getWheelItems(wheelConfigId) {
    const items = await this.env.DB.prepare(`
      SELECT
        wi.id, wi.wheel_config_id, wi.prize_id, wi.probability,
        wi.position_index, wi.is_pity_item,
        pp.prize_name, pp.prize_description, pp.prize_type, pp.prize_value,
        pp.prize_rarity, pp.prize_icon, pp.prize_color, pp.effect_duration,
        pp.effect_multiplier, pp.is_punishment
      FROM wheel_items wi
      JOIN prize_pool pp ON wi.prize_id = pp.id
      WHERE wi.wheel_config_id = ? AND pp.is_active = TRUE
      ORDER BY wi.position_index
    `).bind(wheelConfigId).all();

    return items.results || [];
  }

  async getUserLotteryStats(userId, wheelConfigId) {
    let stats = await this.env.DB.prepare(`
      SELECT * FROM user_lottery_stats
      WHERE user_id = ? AND wheel_config_id = ?
    `).bind(userId, wheelConfigId).first();

    if (!stats) {
      // 创建初始统计记录
      await this.env.DB.prepare(`
        INSERT INTO user_lottery_stats
        (user_id, wheel_config_id, total_spins, daily_spins, pity_counter, last_spin_date)
        VALUES (?, ?, 0, 0, 0, ?)
      `).bind(userId, wheelConfigId, getUTC8TimestampString().split('T')[0]).run();

      stats = {
        user_id: userId,
        wheel_config_id: wheelConfigId,
        total_spins: 0,
        daily_spins: 0,
        pity_counter: 0,
        last_spin_date: getUTC8TimestampString().split('T')[0]
      };
    }

    // 检查是否需要重置每日次数
    const today = getUTC8TimestampString().split('T')[0];
    if (stats.last_spin_date !== today) {
      await this.env.DB.prepare(`
        UPDATE user_lottery_stats
        SET daily_spins = 0, last_spin_date = ?
        WHERE user_id = ? AND wheel_config_id = ?
      `).bind(today, userId, wheelConfigId).run();
      stats.daily_spins = 0;
      stats.last_spin_date = today;
    }

    return stats;
  }

  async updateUserStats(userId, wheelConfigId, prize, isPityTriggered) {
    const today = getUTC8TimestampString().split('T')[0];

    // 计算新的保底计数器
    let newPityCounter = 0;
    if (!isPityTriggered) {
      // 如果获得稀有物品，重置保底计数器
      if (['epic', 'legendary'].includes(prize.prize_rarity)) {
        newPityCounter = 0;
      } else {
        // 否则增加保底计数器
        const currentStats = await this.getUserLotteryStats(userId, wheelConfigId);
        newPityCounter = currentStats.pity_counter + 1;
      }
    }

    // 更新统计数据
    await this.env.DB.prepare(`
      UPDATE user_lottery_stats
      SET total_spins = total_spins + 1,
          daily_spins = daily_spins + 1,
          pity_counter = ?,
          last_spin_date = ?,
          total_rewards_value = total_rewards_value + ?,
          updated_at = ?
      WHERE user_id = ? AND wheel_config_id = ?
    `).bind(
      newPityCounter, today, prize.prize_value || 0,
      getUTC8TimestampString(), userId, wheelConfigId
    ).run();
  }

  async getUserAvailableWheels(userId) {
    const user = await this.env.DB.prepare(`
      SELECT level FROM users WHERE id = ? AND is_active = TRUE
    `).bind(userId).first();

    if (!user) {
      throw new Error('用户不存在');
    }

    const wheels = await this.env.DB.prepare(`
      SELECT
        wc.*,
        COALESCE(uls.daily_spins, 0) as current_daily_spins,
        COALESCE(uls.pity_counter, 0) as current_pity_counter
      FROM wheel_config wc
      LEFT JOIN user_lottery_stats uls ON wc.id = uls.wheel_config_id AND uls.user_id = ?
      WHERE wc.target_user_level = ? AND wc.is_active = TRUE
      AND (wc.active_start_time IS NULL OR wc.active_start_time <= ?)
      AND (wc.active_end_time IS NULL OR wc.active_end_time >= ?)
      ORDER BY wc.id
    `).bind(userId, user.level, getUTC8TimestampString(), getUTC8TimestampString()).all();

    return wheels.results || [];
  }

  async getUserActiveEffects(userId) {
    const effects = await this.env.DB.prepare(`
      SELECT
        uae.*,
        pp.prize_name,
        pp.prize_description,
        pp.prize_icon,
        pp.prize_color
      FROM user_activity_effects uae
      LEFT JOIN prize_pool pp ON uae.source_prize_id = pp.id
      WHERE uae.user_id = ? AND uae.is_active = TRUE
      AND (uae.end_time IS NULL OR uae.end_time > ?)
      ORDER BY uae.created_at DESC
    `).bind(userId, getUTC8TimestampString()).all();

    return effects.results || [];
  }
}

// ============================================
// 管理员配置管理功能
// ============================================

class AdminLevelConfigManager {
  constructor(env, levelSystem) {
    this.env = env;
    this.levelSystem = levelSystem;
  }

  async getLevelConfigs(adminId) {
    if (!await checkAdminPermission(this.env, adminId, 'level_config', 'read')) {
      throw new Error('权限不足：无法查看等级配置');
    }

    const configs = await this.env.DB.prepare(`
      SELECT
        ul.*,
        COUNT(u.id) as current_user_count,
        AVG(u.experience) as avg_user_experience
      FROM user_levels ul
      LEFT JOIN users u ON ul.id = u.level AND u.is_active = TRUE
      GROUP BY ul.id
      ORDER BY ul.id
    `).all();

    return configs.results || [];
  }

  async updateLevelConfig(adminId, levelId, configData, reason) {
    if (!await checkAdminPermission(this.env, adminId, 'level_config', 'write')) {
      throw new Error('权限不足：无法修改等级配置');
    }

    // 获取当前配置
    const currentConfig = await this.env.DB.prepare(`
      SELECT * FROM user_levels WHERE id = ?
    `).bind(levelId).first();

    if (!currentConfig) {
      throw new Error('等级配置不存在');
    }

    // 分析影响
    const impact = await this.analyzeLevelConfigImpact(levelId, configData);

    // 检查是否需要审核
    const requiresApproval = await this.requiresApproval('level_config');

    if (requiresApproval) {
      // 创建审核记录
      const approvalId = await this.createApprovalRequest(
        adminId, 'level_config', levelId, currentConfig, configData, reason, impact
      );

      return {
        success: true,
        message: '配置变更已提交审核',
        approval_id: approvalId,
        requires_approval: true
      };
    } else {
      // 直接应用配置
      await this.applyLevelConfigChange(adminId, levelId, currentConfig, configData, reason);

      return {
        success: true,
        message: '等级配置已更新',
        requires_approval: false
      };
    }
  }

  async analyzeLevelConfigImpact(levelId, newConfig) {
    // 获取当前配置
    const currentConfig = await this.env.DB.prepare(`
      SELECT * FROM user_levels WHERE id = ?
    `).bind(levelId).first();

    // 分析受影响的用户
    const affectedUsers = await this.env.DB.prepare(`
      SELECT COUNT(*) as count FROM users
      WHERE level = ? AND is_active = TRUE
    `).bind(levelId).first();

    // 分析可能的等级变化
    const potentialLevelChanges = await this.env.DB.prepare(`
      SELECT COUNT(*) as count FROM users
      WHERE level < ? AND experience >= ? AND total_checkins >= ?
      AND consecutive_days >= ? AND is_active = TRUE
    `).bind(
      levelId,
      newConfig.required_experience || currentConfig.required_experience,
      newConfig.required_checkin_days || currentConfig.required_checkin_days,
      newConfig.required_consecutive_days || currentConfig.required_consecutive_days
    ).first();

    return {
      affected_users: affectedUsers?.count || 0,
      potential_level_changes: potentialLevelChanges?.count || 0,
      config_changes: this.getConfigDifferences(currentConfig, newConfig),
      estimated_impact: this.calculateImpactLevel(affectedUsers?.count || 0, potentialLevelChanges?.count || 0)
    };
  }

  async applyLevelConfigChange(adminId, levelId, oldConfig, newConfig, reason) {
    // 更新等级配置
    const updateFields = [];
    const updateValues = [];

    Object.keys(newConfig).forEach(key => {
      if (key !== 'id' && newConfig[key] !== undefined) {
        updateFields.push(`${key} = ?`);
        updateValues.push(newConfig[key]);
      }
    });

    // Add updated_at field to the update fields and values
    updateFields.push('updated_at = ?');
    updateValues.push(getUTC8TimestampString());
    updateValues.push(levelId);

    await this.env.DB.prepare(`
      UPDATE user_levels
      SET ${updateFields.join(', ')}
      WHERE id = ?
    `).bind(...updateValues).run();

    // 记录操作日志
    await this.logAdminOperation(
      adminId, 'level_config_update', 'user_levels', levelId,
      oldConfig, newConfig, reason, 'applied'
    );

    // 重新加载等级配置缓存
    await this.levelSystem.loadLevelConfigs();
  }

  async getExperienceRules(adminId) {
    if (!await checkAdminPermission(this.env, adminId, 'experience_rules', 'read')) {
      throw new Error('权限不足：无法查看经验规则');
    }

    const rules = await this.env.DB.prepare(`
      SELECT
        er.*,
        COUNT(uel.id) as usage_count,
        SUM(uel.experience_amount) as total_experience_granted
      FROM experience_rules er
      LEFT JOIN user_experience_logs uel ON er.rule_type = uel.experience_type
      WHERE er.is_active = TRUE
      GROUP BY er.id
      ORDER BY er.id
    `).all();

    return rules.results || [];
  }

  async updateExperienceRule(adminId, ruleId, ruleData, reason) {
    if (!await checkAdminPermission(this.env, adminId, 'experience_rules', 'write')) {
      throw new Error('权限不足：无法修改经验规则');
    }

    // 获取当前规则
    const currentRule = await this.env.DB.prepare(`
      SELECT * FROM experience_rules WHERE id = ?
    `).bind(ruleId).first();

    if (!currentRule) {
      throw new Error('经验规则不存在');
    }

    // 分析影响
    const impact = await this.analyzeExperienceRuleImpact(ruleId, ruleData);

    // 检查是否需要审核
    const requiresApproval = await this.requiresApproval('experience_rules');

    if (requiresApproval) {
      // 创建审核记录
      const approvalId = await this.createApprovalRequest(
        adminId, 'experience_rule', ruleId, currentRule, ruleData, reason, impact
      );

      return {
        success: true,
        message: '经验规则变更已提交审核',
        approval_id: approvalId,
        requires_approval: true
      };
    } else {
      // 直接应用规则
      await this.applyExperienceRuleChange(adminId, ruleId, currentRule, ruleData, reason);

      return {
        success: true,
        message: '经验规则已更新',
        requires_approval: false
      };
    }
  }

  async analyzeExperienceRuleImpact(ruleId, newRule) {
    const currentRule = await this.env.DB.prepare(`
      SELECT * FROM experience_rules WHERE id = ?
    `).bind(ruleId).first();

    // 分析过去30天的使用情况
    const usageStats = await this.env.DB.prepare(`
      SELECT
        COUNT(*) as usage_count,
        SUM(experience_amount) as total_experience,
        COUNT(DISTINCT user_id) as affected_users
      FROM user_experience_logs
      WHERE experience_type = ? AND created_at >= date('now', '-30 days')
    `).bind(currentRule.rule_type).first();

    // 计算经验变化影响
    const experienceChange = (newRule.base_experience || currentRule.base_experience) - currentRule.base_experience;
    const estimatedDailyImpact = (usageStats?.usage_count || 0) * experienceChange / 30;

    return {
      affected_users: usageStats?.affected_users || 0,
      daily_usage: Math.round((usageStats?.usage_count || 0) / 30),
      experience_change_per_use: experienceChange,
      estimated_daily_impact: estimatedDailyImpact,
      rule_changes: this.getConfigDifferences(currentRule, newRule)
    };
  }

  async applyExperienceRuleChange(adminId, ruleId, oldRule, newRule, reason) {
    // 更新经验规则
    const updateFields = [];
    const updateValues = [];

    Object.keys(newRule).forEach(key => {
      if (key !== 'id' && newRule[key] !== undefined) {
        updateFields.push(`${key} = ?`);
        updateValues.push(newRule[key]);
      }
    });

    updateValues.push(ruleId);

    await this.env.DB.prepare(`
      UPDATE experience_rules
      SET ${updateFields.join(', ')}
      WHERE id = ?
    `).bind(...updateValues).run();

    // 记录操作日志
    await this.logAdminOperation(
      adminId, 'experience_rule_update', 'experience_rules', ruleId,
      oldRule, newRule, reason, 'applied'
    );

    // 重新加载经验规则缓存
    await this.levelSystem.loadExperienceRules();
  }

  async createApprovalRequest(adminId, changeType, targetId, oldData, newData, reason, impact) {
    const result = await this.env.DB.prepare(`
      INSERT INTO config_change_approvals
      (change_type, change_id, submitted_by, approval_status, estimated_impact, rollback_plan, submitted_at)
      VALUES (?, ?, ?, 'pending', ?, ?, ?)
    `).bind(
      changeType,
      targetId,
      adminId,
      JSON.stringify(impact),
      this.generateRollbackPlan(changeType, oldData),
      getUTC8TimestampString()
    ).run();

    // 记录详细的操作日志
    await this.logAdminOperation(
      adminId, `${changeType}_change_request`, changeType, targetId,
      oldData, newData, reason, 'pending'
    );

    return result.meta.last_row_id;
  }

  async requiresApproval(configType) {
    // 审核功能已移除，直接返回false，允许直接编辑
    return false;
  }

  async logAdminOperation(adminId, operationType, targetTable, targetId, oldValues, newValues, reason, status) {
    await this.env.DB.prepare(`
      INSERT INTO admin_operation_logs
      (admin_id, operation_type, operation_target, target_id, old_values, new_values, operation_reason, operation_status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      adminId, operationType, targetTable, targetId,
      JSON.stringify(oldValues), JSON.stringify(newValues), reason, status, getUTC8TimestampString()
    ).run();
  }

  getConfigDifferences(oldConfig, newConfig) {
    const differences = {};

    Object.keys(newConfig).forEach(key => {
      if (oldConfig[key] !== newConfig[key]) {
        differences[key] = {
          old: oldConfig[key],
          new: newConfig[key]
        };
      }
    });

    return differences;
  }

  calculateImpactLevel(affectedUsers, potentialChanges) {
    const totalImpact = affectedUsers + potentialChanges;

    if (totalImpact === 0) return 'none';
    if (totalImpact < 10) return 'low';
    if (totalImpact < 100) return 'medium';
    if (totalImpact < 1000) return 'high';
    return 'critical';
  }

  generateRollbackPlan(changeType, oldData) {
    return `回滚到原始配置: ${JSON.stringify(oldData)}`;
  }
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

    // 获取等级统计
    const levelStats = await env.DB.prepare(`
      SELECT
        COUNT(DISTINCT level) as total_levels,
        AVG(experience) as avg_experience,
        MAX(level) as max_level
      FROM users
      WHERE is_active = 1
    `).first();

    return {
      total: codeStats?.total || 0,
      undistributed: codeStats?.undistributed || 0,
      distributed: codeStats?.distributed || 0,
      total_users: userStats?.total_users || 0,
      total_checkins: checkinStats?.total_checkins || 0,
      active_users: checkinStats?.active_users || 0,
      active_days: checkinStats?.active_days || 0,
      total_levels: levelStats?.total_levels || 0,
      avg_experience: Math.round(levelStats?.avg_experience || 0),
      max_level: levelStats?.max_level || 1
    };
  } catch (error) {
    console.error('Failed to get stats:', error);
    return {
      total: 0, undistributed: 0, distributed: 0, total_users: 0,
      total_checkins: 0, active_users: 0, active_days: 0,
      total_levels: 0, avg_experience: 0, max_level: 1
    };
  }
}

async function getCodes(env, page = 1, limit = 50, sortBy = 'id', sortOrder = 'ASC') {
  try {
    const offset = (page - 1) * limit;

    // Validate sort parameters to prevent SQL injection
    const validSortColumns = ['id', 'created_at', 'amount', 'is_used', 'is_distributed', 'batch_id'];
    const validSortOrders = ['ASC', 'DESC'];

    if (!validSortColumns.includes(sortBy)) {
      sortBy = 'id';
    }
    if (!validSortOrders.includes(sortOrder.toUpperCase())) {
      sortOrder = 'ASC';
    }

    const codes = await env.DB.prepare(`
      SELECT
        r.id, r.code, r.amount, r.is_used, r.is_distributed,
        r.used_by, r.used_at, r.distributed_to, r.distributed_at,
        r.distributed_by, r.distribution_type, r.batch_id, r.created_at,
        u.username as distributed_to_username,
        admin.username as distributed_by_admin
      FROM redemption_codes r
      LEFT JOIN users u ON r.distributed_to = u.id
      LEFT JOIN admins admin ON r.distributed_by = admin.id
      ORDER BY r.${sortBy} ${sortOrder}
      LIMIT ? OFFSET ?
    `).bind(limit, offset).all();

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
    return { codes: [], total: 0, page: page, limit: limit, totalPages: 0 };
  }
}

// 优化后的用户查询函数 - 使用缓存
async function getUsers(env, page = 1, limit = 10) {
  try {
    const cache = new CacheManager(env);
    const cacheParams = { page, limit };

    // 尝试从缓存获取
    let cachedData = await cache.get('userList', cacheParams);
    if (cachedData) {
      return cachedData;
    }

    console.log('🔍 Cache miss - querying database for users');
    const offset = (page - 1) * limit;

    // 优化查询 - 移除复杂的聚合查询，简化JOIN
    const users = await env.DB.prepare(`
      SELECT
        u.id, u.linux_do_id, u.username, u.email, u.avatar_url,
        u.total_checkins, u.consecutive_days, u.max_consecutive_days,
        u.last_checkin_date, u.level, u.experience, u.created_at,
        u.updated_at, u.is_active,
        ul.level_name, ul.level_color, ul.level_icon
      FROM users u
      LEFT JOIN user_levels ul ON u.level = ul.id
      WHERE u.is_active = 1
      ORDER BY u.id ASC
      LIMIT ? OFFSET ?
    `).bind(limit, offset).all();

    // 缓存总用户数
    let totalUsers = await cache.get('totalUsers');
    if (!totalUsers) {
      const totalResult = await env.DB.prepare(`
        SELECT COUNT(*) as total FROM users WHERE is_active = 1
      `).first();
      totalUsers = totalResult?.total || 0;
      await cache.set('totalUsers', totalUsers);
    }

    const result = {
      users: users.results || [],
      total: totalUsers,
      page: page,
      limit: limit,
      totalPages: Math.ceil(totalUsers / limit)
    };

    // 缓存结果
    await cache.set('userList', result, cacheParams);

    return result;
  } catch (error) {
    console.error('Failed to get users:', error);
    return { users: [], total: 0, page: page, limit: limit, totalPages: 0 };
  }
}

async function getUserLevelInfo(env, userId) {
  try {
    const userInfo = await env.DB.prepare(`
      SELECT
        u.id as user_id, u.username, u.level as current_level,
        u.experience as current_experience, ul.level_name as current_level_name,
        ul.level_description, ul.level_color, ul.level_icon,
        ul.checkin_reward_multiplier, ul.special_privileges,
        u.total_checkins, u.consecutive_days, u.max_consecutive_days,
        next_ul.id as next_level_id, next_ul.level_name as next_level_name,
        next_ul.required_experience as next_level_required_exp,
        (next_ul.required_experience - u.experience) as experience_to_next_level,
        CASE
          WHEN next_ul.required_experience IS NULL THEN 100.0
          ELSE ROUND((u.experience * 100.0) / next_ul.required_experience, 2)
        END as level_progress_percent
      FROM users u
      LEFT JOIN user_levels ul ON u.level = ul.id
      LEFT JOIN user_levels next_ul ON u.level + 1 = next_ul.id
      WHERE u.id = ? AND u.is_active = TRUE
    `).bind(userId).first();

    if (!userInfo) return null;

    // 获取最近的升级历史
    const levelHistory = await env.DB.prepare(`
      SELECT * FROM user_level_history
      WHERE user_id = ?
      ORDER BY level_up_time DESC
      LIMIT 5
    `).bind(userId).all();

    // 获取今日经验获得情况
    const todayExperience = await env.DB.prepare(`
      SELECT SUM(experience_amount) as total_exp
      FROM user_experience_logs
      WHERE user_id = ? AND date(created_at) = date('now')
    `).bind(userId).first();

    return {
      ...userInfo,
      level_history: levelHistory.results || [],
      today_experience: todayExperience?.total_exp || 0
    };
  } catch (error) {
    console.error('Failed to get user level info:', error);
    return null;
  }
}

// 优化后的排行榜查询函数 - 使用缓存
async function getLeaderboard(env, limit = 50, offset = 0) {
  try {
    const cache = new CacheManager(env);
    const cacheParams = { limit, offset };

    // 尝试从缓存获取
    let cachedData = await cache.get('leaderboard', cacheParams);
    if (cachedData) {
      return cachedData;
    }

    console.log('🔍 Cache miss - querying database for leaderboard');

    const leaderboard = await env.DB.prepare(`
      SELECT
        u.id, u.username, u.avatar_url, u.linux_do_id, u.level,
        ul.level_name, ul.level_color, ul.level_icon,
        u.experience, u.total_checkins, u.consecutive_days, u.max_consecutive_days,
        ROW_NUMBER() OVER (ORDER BY u.level DESC, u.experience DESC, u.total_checkins DESC) as rank
      FROM users u
      LEFT JOIN user_levels ul ON u.level = ul.id
      WHERE u.is_active = TRUE
      ORDER BY u.level DESC, u.experience DESC, u.total_checkins DESC
      LIMIT ? OFFSET ?
    `).bind(limit, offset).all();

    const result = leaderboard.results || [];

    // 缓存结果
    await cache.set('leaderboard', result, cacheParams);

    return result;
  } catch (error) {
    console.error('Failed to get leaderboard:', error);
    return [];
  }
}

// ============================================
// API 处理函数
// ============================================

async function handleApiRequest(request, env, path, method, session) {
  const url = new URL(request.url);
  const pathParts = path.split('/').filter(p => p);

  const adminId = session.admin_id;

  // 初始化系统和缓存管理器
  const levelSystem = new UserLevelSystem(env);
  await levelSystem.initialize();

  const configManager = new AdminLevelConfigManager(env, levelSystem);
  const cache = new CacheManager(env);

  try {
    // 缓存预热端点
    if (pathParts[0] === 'warmup-cache') {
      await cache.warmup();
      return jsonResponse({ success: true, message: 'Cache warmed up successfully' });
    }

    // KV状态检查端点
    if (pathParts[0] === 'kv-status') {
      const kvStatus = {
        isKVAvailable: cache.isKVAvailable,
        kvObject: !!env.KV,
        envKeys: Object.keys(env),
        timestamp: new Date().toISOString()
      };

      if (cache.isKVAvailable) {
        try {
          // 测试KV操作
          const testKey = 'status_test_' + Date.now();
          await env.KV.put(testKey, 'test');
          const testResult = await env.KV.get(testKey);
          await env.KV.delete(testKey);

          kvStatus.testResult = testResult === 'test' ? 'SUCCESS' : 'FAILED';
        } catch (error) {
          kvStatus.testResult = 'ERROR';
          kvStatus.testError = error.message;
        }
      }

      return jsonResponse({ success: true, kvStatus });
    }

    // 路由处理
    if (pathParts[0] === 'stats') {
      return await handleStatsApi(env);
    }

    // 导入兑换码API（需要在通用codes路由之前）
    if (pathParts[0] === 'codes' && pathParts[1] === 'import' && method === 'POST') {
      return await handleImportCodesApi(request, env, session.admin_id);
    }

    if (pathParts[0] === 'codes') {
      return await handleCodesApi(request, env, pathParts, method);
    }

    if (pathParts[0] === 'users') {
      return await handleUsersApi(request, env, pathParts, method, session);
    }

    // 等级系统API
    if (pathParts[0] === 'level-configs') {
      return await handleLevelConfigsApi(request, env, pathParts, method, session.admin_id, configManager);
    }

    if (pathParts[0] === 'experience-rules') {
      return await handleExperienceRulesApi(request, env, pathParts, method, session.admin_id, configManager);
    }

    if (pathParts[0] === 'level-info') {
      return await handleLevelInfoApi(request, env, pathParts, method);
    }

    if (pathParts[0] === 'leaderboard') {
      return await handleLeaderboardApi(request, env);
    }

    // 签到记录API
    if (pathParts[0] === 'checkins' || pathParts[0] === 'checkin-records') {
      return await handleCheckinRecordsApi(request, env, pathParts, method);
    }

    // 抽奖系统API
    if (pathParts[0] === 'lottery') {
      return await handleLotteryApi(request, env, pathParts, method, session);
    }

    // 配置快照API
    if (pathParts[0] === 'config-snapshots' && method === 'POST') {
      return await handleCreateSnapshotApi(request, env, session.admin_id);
    }

    return errorResponse('API端点不存在', 404);
  } catch (error) {
    console.error('API request error:', error);
    return errorResponse(error.message || '服务器内部错误', 500);
  }
}

async function handleStatsApi(env) {
  const stats = await getStats(env);
  return jsonResponse({ success: true, stats });
}

async function handleCodesApi(request, env, pathParts, method) {
  if (method === 'GET') {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page')) || 1;
    const limit = parseInt(url.searchParams.get('limit')) || 50;
    const sortBy = url.searchParams.get('sortBy') || 'id';
    const sortOrder = url.searchParams.get('sortOrder') || 'ASC';

    const result = await getCodes(env, page, limit, sortBy, sortOrder);
    return jsonResponse({ success: true, ...result });
  }

  return errorResponse('不支持的方法', 405);
}

async function handleUsersApi(request, env, pathParts, method, session) {
  if (method === 'GET') {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page')) || 1;
    const limit = parseInt(url.searchParams.get('limit')) || 10; // 改为10个分页

    const result = await getUsers(env, page, limit);
    return jsonResponse({ success: true, ...result });
  }

  // 生成测试数据
  if (method === 'POST' && pathParts[1] === 'generate-test-data') {
    console.log('🧪 生成测试数据请求');

    // 验证管理员权限
    if (!session.admin_id) {
      return errorResponse('需要管理员权限', 403);
    }

    try {
      const result = await generateTestUsers(env);
      return jsonResponse({
        success: true,
        message: '测试数据生成成功',
        data: result
      });
    } catch (error) {
      console.error('❌ 生成测试数据失败:', error);
      return errorResponse('生成测试数据失败: ' + error.message, 500);
    }
  }

  // 修复所有用户等级
  if (method === 'POST' && pathParts[1] === 'fix-levels') {
    console.log('🔧 修复用户等级请求');

    // 验证管理员权限
    if (!session.admin_id) {
      return errorResponse('需要管理员权限', 403);
    }

    try {
      const result = await fixAllUserLevels(env);
      return jsonResponse({
        success: true,
        message: '用户等级修复完成',
        data: result
      });
    } catch (error) {
      console.error('❌ 修复用户等级失败:', error);
      return errorResponse('修复用户等级失败: ' + error.message, 500);
    }
  }

  // 赠送功能
  if (method === 'POST' && pathParts[1] === 'gift') {
    console.log('🎁 处理赠送请求:', { session: session.admin_id });

    // 验证管理员权限
    if (!session.admin_id) {
      return errorResponse('需要管理员权限', 403);
    }

    try {
      const body = await request.json();
      const { user_id, type, amount, reason } = body;

      console.log('🎁 赠送数据:', { user_id, type, amount, reason });

      if (!user_id || !type || !amount) {
        return errorResponse('缺少必要参数', 400);
      }

      // 验证用户存在
      const user = await env.DB.prepare(`
        SELECT id, username, experience FROM users WHERE id = ? AND is_active = 1
      `).bind(user_id).first();

      if (!user) {
        return errorResponse('用户不存在', 404);
      }

      let result;
      if (type === 'experience') {
        // 赠送经验值并检查等级升级
        const newExperience = user.experience + amount;

        // 检查是否需要升级
        const newLevel = await checkLevelUpgrade(env, user_id, newExperience);

        if (newLevel > user.level) {
          // 需要升级
          result = await env.DB.prepare(`
            UPDATE users SET experience = ?, level = ?, updated_at = datetime('now')
            WHERE id = ?
          `).bind(newExperience, newLevel, user_id).run();

          console.log(`🎉 用户 ${user.username} 升级到等级 ${newLevel}！`);

          // 清除相关缓存 - 等级变化影响更多数据
          await Promise.all([
            cache.invalidatePattern('user_list'),
            cache.invalidatePattern('leaderboard'),
            cache.invalidatePattern('user_profile'),
            cache.delete('totalUsers'),
            cache.delete('systemStats')
          ]);
        } else {
          // 只更新经验值
          result = await env.DB.prepare(`
            UPDATE users SET experience = ?, updated_at = datetime('now')
            WHERE id = ?
          `).bind(newExperience, user_id).run();

          // 清除相关缓存 - 经验值变化
          await Promise.all([
            cache.invalidatePattern('user_list'),
            cache.invalidatePattern('leaderboard'),
            cache.invalidatePattern('user_profile')
          ]);
        }

        // 记录操作日志 - 修复数据库字段错误
        await env.DB.prepare(`
          INSERT INTO admin_operation_logs (admin_id, operation_type, operation_data, created_at)
          VALUES (?, ?, ?, datetime('now'))
        `).bind(session.admin_id, 'gift_experience', JSON.stringify({ user_id, amount, reason })).run();

      } else if (type === 'redemption_code') {
        // 生成兑换码
        const code = generateRedemptionCode();

        result = await env.DB.prepare(`
          INSERT INTO redemption_codes (code, amount, distributed_to, is_distributed, created_at, distributed_at)
          VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))
        `).bind(code, amount, user_id).run();

        // 记录操作日志 - 修复数据库字段错误
        await env.DB.prepare(`
          INSERT INTO admin_operation_logs (admin_id, operation_type, operation_data, created_at)
          VALUES (?, ?, ?, datetime('now'))
        `).bind(session.admin_id, 'gift_redemption_code', JSON.stringify({ user_id, code, amount, reason })).run();
      }

      console.log('🎁 赠送结果:', result);

      return jsonResponse({
        success: true,
        message: `成功赠送${type === 'experience' ? '经验值' : '兑换码'}`,
        data: { user_id, type, amount }
      });

    } catch (error) {
      console.error('❌ 赠送失败:', error);
      return errorResponse('赠送失败: ' + error.message, 500);
    }
  }

  return errorResponse('不支持的方法', 405);
}

async function handleLevelConfigsApi(request, env, pathParts, method, adminId, configManager) {
  if (method === 'GET') {
    const configs = await configManager.getLevelConfigs(adminId);
    return jsonResponse({ success: true, data: configs });
  }

  if (method === 'PUT' && pathParts[1]) {
    const levelId = parseInt(pathParts[1]);
    const body = await request.json();
    const { change_reason, ...configData } = body;

    const result = await configManager.updateLevelConfig(adminId, levelId, configData, change_reason);
    return jsonResponse({ success: true, data: result });
  }

  return errorResponse('不支持的方法', 405);
}

async function handleExperienceRulesApi(request, env, pathParts, method, adminId, configManager) {
  if (method === 'GET') {
    const rules = await configManager.getExperienceRules(adminId);
    return jsonResponse({ success: true, data: rules });
  }

  if (method === 'PUT' && pathParts[1]) {
    const ruleId = parseInt(pathParts[1]);
    const body = await request.json();
    const { change_reason, ...ruleData } = body;

    const result = await configManager.updateExperienceRule(adminId, ruleId, ruleData, change_reason);
    return jsonResponse({ success: true, data: result });
  }

  return errorResponse('不支持的方法', 405);
}

async function handleLevelInfoApi(request, env, pathParts, method) {
  if (method === 'GET' && pathParts[1]) {
    const userId = parseInt(pathParts[1]);
    const levelInfo = await getUserLevelInfo(env, userId);

    if (!levelInfo) {
      return errorResponse('用户不存在', 404);
    }

    return jsonResponse({ success: true, data: levelInfo });
  }

  return errorResponse('不支持的方法', 405);
}

async function handleLeaderboardApi(request, env) {
  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get('limit')) || 50;
  const offset = parseInt(url.searchParams.get('offset')) || 0;

  const leaderboard = await getLeaderboard(env, limit, offset);
  return jsonResponse({ success: true, data: leaderboard });
}

// ============================================
// 签到记录API处理函数
// ============================================

async function handleCheckinRecordsApi(request, env, pathParts, method) {
  console.log('📝 签到记录API调用:', { method, pathParts });

  if (method === 'GET') {
    if (pathParts[1] === 'stats') {
      return await getCheckinStats(env);
    }

    // 获取签到记录列表
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page')) || 1;
    const limit = parseInt(url.searchParams.get('limit')) || 50;
    const userId = url.searchParams.get('user_id');
    const dateFrom = url.searchParams.get('date_from');
    const dateTo = url.searchParams.get('date_to');
    const status = url.searchParams.get('status');
    const sortBy = url.searchParams.get('sort_by') || 'id';
    const sortOrder = url.searchParams.get('sort_order') || 'DESC';

    return await getCheckinRecords(env, {
      page, limit, userId, dateFrom, dateTo, status, sortBy, sortOrder
    });
  }

  if (method === 'POST' && pathParts[1] === 'export') {
    return await exportCheckinRecords(request, env);
  }

  return errorResponse('不支持的方法', 405);
}

// 优化后的签到记录查询函数 - 使用缓存
async function getCheckinRecords(env, options = {}) {
  const {
    page = 1, limit = 10, userId, dateFrom, dateTo, status,
    sortBy = 'id', sortOrder = 'DESC'
  } = options;

  const cache = new CacheManager(env);
  const offset = (page - 1) * limit;

  // 只对简单查询使用缓存（无筛选条件）
  const isSimpleQuery = !userId && !dateFrom && !dateTo && !status && sortBy === 'id' && sortOrder === 'DESC';

  if (isSimpleQuery) {
    const cacheParams = { page, limit };
    const cachedData = await cache.get('recentCheckins', cacheParams);
    if (cachedData) {
      return cachedData;
    }
  }

  // 构建查询条件
  let whereConditions = [];
  let queryParams = [];

  if (userId) {
    whereConditions.push('c.user_id = ?');
    queryParams.push(parseInt(userId));
  }

  if (dateFrom) {
    whereConditions.push('c.check_in_date >= ?');
    queryParams.push(dateFrom);
  }

  if (dateTo) {
    whereConditions.push('c.check_in_date <= ?');
    queryParams.push(dateTo);
  }

  if (status) {
    whereConditions.push('c.status = ?');
    queryParams.push(status);
  }

  const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

  // 查询签到记录
  const query = `
    SELECT
      c.id,
      c.user_id,
      u.username,
      u.email,
      u.avatar_url,
      u.linux_do_id,
      u.level,
      ul.level_name,
      ul.level_color,
      ul.level_icon,
      c.check_in_date,
      c.check_in_time,
      c.redemption_code,
      c.consecutive_days,
      c.reward_amount,
      c.status,
      c.created_at
    FROM check_ins c
    LEFT JOIN users u ON c.user_id = u.id
    LEFT JOIN user_levels ul ON u.level = ul.id
    ${whereClause}
    ORDER BY c.${sortBy} ${sortOrder}
    LIMIT ? OFFSET ?
  `;

  queryParams.push(limit, offset);

  try {
    const records = await env.DB.prepare(query).bind(...queryParams).all();

    // 获取总数
    const countQuery = `
      SELECT COUNT(*) as total
      FROM check_ins c
      ${whereClause}
    `;
    const countParams = queryParams.slice(0, -2); // 移除 limit 和 offset
    const totalResult = await env.DB.prepare(countQuery).bind(...countParams).first();

    const result = {
      success: true,
      data: {
        records: records.results || [],
        pagination: {
          current_page: page,
          total_pages: Math.ceil((totalResult?.total || 0) / limit),
          total_records: totalResult?.total || 0,
          limit: limit
        }
      }
    };

    // 缓存简单查询结果
    if (isSimpleQuery) {
      await cache.set('recentCheckins', result, { page, limit });
    }

    return jsonResponse(result);
  } catch (error) {
    console.error('❌ 查询签到记录失败:', error);
    return errorResponse('查询签到记录失败: ' + error.message, 500);
  }
}

async function getCheckinStats(env) {
  try {
    // 基础统计
    const basicStats = await env.DB.prepare(`
      SELECT 
        COUNT(*) as total_checkins,
        COUNT(DISTINCT user_id) as total_users,
        AVG(reward_amount) as avg_reward,
        SUM(reward_amount) as total_rewards,
        COUNT(CASE WHEN check_in_date = date('now') THEN 1 END) as today_checkins,
        COUNT(CASE WHEN check_in_date >= date('now', '-7 days') THEN 1 END) as week_checkins,
        COUNT(CASE WHEN check_in_date >= date('now', '-30 days') THEN 1 END) as month_checkins
      FROM check_ins
    `).first();

    // 连续签到统计
    const consecutiveStats = await env.DB.prepare(`
      SELECT 
        consecutive_days,
        COUNT(*) as count
      FROM check_ins
      WHERE consecutive_days > 0
      GROUP BY consecutive_days
      ORDER BY consecutive_days
      LIMIT 20
    `).all();

    // 每日签到趋势（最近30天）
    const dailyTrends = await env.DB.prepare(`
      SELECT 
        check_in_date,
        COUNT(*) as checkin_count,
        COUNT(DISTINCT user_id) as unique_users,
        AVG(reward_amount) as avg_reward
      FROM check_ins
      WHERE check_in_date >= date('now', '-30 days')
      GROUP BY check_in_date
      ORDER BY check_in_date DESC
      LIMIT 30
    `).all();

    // 状态分布
    const statusStats = await env.DB.prepare(`
      SELECT 
        status,
        COUNT(*) as count
      FROM check_ins
      GROUP BY status
    `).all();

    return jsonResponse({
      success: true,
      data: {
        basic_stats: basicStats,
        consecutive_stats: consecutiveStats.results || [],
        daily_trends: dailyTrends.results || [],
        status_distribution: statusStats.results || []
      }
    });
  } catch (error) {
    console.error('❌ 查询签到统计失败:', error);
    return errorResponse('查询签到统计失败: ' + error.message, 500);
  }
}

async function exportCheckinRecords(request, env) {
  try {
    const body = await request.json();
    const { dateFrom, dateTo, userId, format = 'json' } = body;

    // 构建查询条件
    let whereConditions = [];
    let queryParams = [];

    if (userId) {
      whereConditions.push('c.user_id = ?');
      queryParams.push(parseInt(userId));
    }

    if (dateFrom) {
      whereConditions.push('c.check_in_date >= ?');
      queryParams.push(dateFrom);
    }

    if (dateTo) {
      whereConditions.push('c.check_in_date <= ?');
      queryParams.push(dateTo);
    }

    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

    const query = `
      SELECT 
        c.id,
        c.user_id,
        u.username,
        u.email,
        c.check_in_date,
        c.check_in_time,
        c.redemption_code,
        c.consecutive_days,
        c.reward_amount,
        c.status,
        c.created_at
      FROM check_ins c
      LEFT JOIN users u ON c.user_id = u.id
      ${whereClause}
      ORDER BY c.id DESC
      LIMIT 10000
    `;

    const records = await env.DB.prepare(query).bind(...queryParams).all();

    return jsonResponse({
      success: true,
      data: {
        records: records.results || [],
        export_time: getUTC8TimestampString(),
        total_records: records.results?.length || 0
      }
    });
  } catch (error) {
    console.error('❌ 导出签到记录失败:', error);
    return errorResponse('导出签到记录失败: ' + error.message, 500);
  }
}

// ============================================
// 抽奖系统API处理函数
// ============================================

async function handleLotteryApi(request, env, pathParts, method, session) {
  const lotterySystem = new LotterySystem(env);
  await lotterySystem.initialize();

  try {
    // 用户端API
    if (pathParts[1] === 'wheels') {
      return await handleLotteryWheelsApi(request, env, pathParts, method, session, lotterySystem);
    }

    if (pathParts[1] === 'spin' && method === 'POST') {
      return await handleLotterySpinApi(request, env, session, lotterySystem);
    }

    if (pathParts[1] === 'history') {
      return await handleLotteryHistoryApi(request, env, pathParts, method, session);
    }

    if (pathParts[1] === 'effects') {
      return await handleLotteryEffectsApi(request, env, pathParts, method, session, lotterySystem);
    }

    if (pathParts[1] === 'stats') {
      return await handleLotteryStatsApi(request, env, pathParts, method, session);
    }

    // 管理员端API
    if (pathParts[1] === 'admin') {
      // 验证管理员权限
      if (!session.admin_id) {
        return errorResponse('需要管理员权限', 403);
      }

      return await handleLotteryAdminApi(request, env, pathParts, method, session, lotterySystem);
    }

    return errorResponse('抽奖API端点不存在', 404);
  } catch (error) {
    console.error('Lottery API error:', error);
    return errorResponse(error.message || '抽奖系统错误', 500);
  }
}

async function handleLotteryWheelsApi(request, env, pathParts, method, session, lotterySystem) {
  if (method === 'GET') {
    if (pathParts[2] === 'available') {
      // 获取用户可用转盘列表
      const wheels = await lotterySystem.getUserAvailableWheels(session.user_id);

      // 添加剩余次数信息
      for (const wheel of wheels) {
        wheel.remaining_spins = wheel.max_daily_spins - wheel.current_daily_spins;
      }

      return jsonResponse({
        success: true,
        data: {
          wheels: wheels,
          user_id: session.user_id
        }
      });
    }

    if (pathParts[2] && pathParts[3] === 'config') {
      // 获取转盘详细配置
      const wheelId = parseInt(pathParts[2]);

      const wheelConfig = await env.DB.prepare(`
        SELECT * FROM wheel_config WHERE id = ? AND is_active = TRUE
      `).bind(wheelId).first();

      if (!wheelConfig) {
        return errorResponse('转盘不存在', 404);
      }

      const wheelItems = await lotterySystem.getWheelItems(wheelId);
      // 管理端会话没有 user_id，避免在D1中绑定 undefined 导致 D1_TYPE__ERROR
      let userStats = { daily_spins: 0, pity_counter: 0 };
      if (session && session.user_id) {
        userStats = await lotterySystem.getUserLotteryStats(session.user_id, wheelId);
      }

      return jsonResponse({
        success: true,
        data: {
          wheel_config: {
            ...wheelConfig,
            remaining_spins: wheelConfig.max_daily_spins - userStats.daily_spins,
            pity_counter: userStats.pity_counter
          },
          wheel_items: wheelItems.map(item => ({
            position_index: item.position_index,
            prize: {
              id: item.prize_id,
              prize_name: item.prize_name,
              prize_description: item.prize_description,
              prize_type: item.prize_type,
              prize_value: item.prize_value,
              prize_rarity: item.prize_rarity,
              prize_icon: item.prize_icon,
              prize_color: item.prize_color
            },
            probability: item.probability
          }))
        }
      });
    }
  }

  return errorResponse('不支持的方法', 405);
}

async function handleLotterySpinApi(request, env, session, lotterySystem) {
  const body = await request.json();
  const { wheel_config_id } = body;

  if (!wheel_config_id) {
    return errorResponse('缺少转盘配置ID', 400);
  }

  if (!session.user_id) {
    return errorResponse('用户未登录', 401);
  }

  try {
    const result = await lotterySystem.performLottery(session.user_id, wheel_config_id);

    return jsonResponse({
      success: true,
      data: {
        lottery_record: result.lottery_record,
        prize_won: result.prize_won,
        reward_status: {
          delivered: true,
          delivery_status: 'success',
          effect_applied: true
        },
        updated_stats: {
          remaining_spins: result.updated_stats.daily_spins ?
            (await env.DB.prepare(`SELECT max_daily_spins FROM wheel_config WHERE id = ?`).bind(wheel_config_id).first())?.max_daily_spins - result.updated_stats.daily_spins : 0,
          pity_counter: result.updated_stats.pity_counter,
          total_spins: result.updated_stats.total_spins
        }
      }
    });
  } catch (error) {
    return errorResponse(error.message, 400);
  }
}

async function handleLotteryHistoryApi(request, env, pathParts, method, session) {
  if (method === 'GET') {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page')) || 1;
    const limit = parseInt(url.searchParams.get('limit')) || 20;
    const wheelId = url.searchParams.get('wheel_id');
    const offset = (page - 1) * limit;

    let query = `
      SELECT
        ulr.id, ulr.spin_result_position, ulr.is_pity_triggered, ulr.spin_timestamp,
        ulr.delivery_status, ulr.reward_delivered,
        pp.prize_name, pp.prize_value, pp.prize_rarity, pp.prize_icon, pp.prize_color,
        wc.config_name as wheel_config_name
      FROM user_lottery_records ulr
      JOIN prize_pool pp ON ulr.prize_id = pp.id
      JOIN wheel_config wc ON ulr.wheel_config_id = wc.id
      WHERE ulr.user_id = ?
    `;

    const params = [session.user_id];

    if (wheelId) {
      query += ` AND ulr.wheel_config_id = ?`;
      params.push(parseInt(wheelId));
    }

    query += ` ORDER BY ulr.spin_timestamp DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const records = await env.DB.prepare(query).bind(...params).all();

    // 获取总数
    let countQuery = `
      SELECT COUNT(*) as total
      FROM user_lottery_records ulr
      WHERE ulr.user_id = ?
    `;
    const countParams = [session.user_id];

    if (wheelId) {
      countQuery += ` AND ulr.wheel_config_id = ?`;
      countParams.push(parseInt(wheelId));
    }

    const totalResult = await env.DB.prepare(countQuery).bind(...countParams).first();
    const total = totalResult?.total || 0;

    return jsonResponse({
      success: true,
      data: {
        records: records.results || [],
        pagination: {
          current_page: page,
          total_pages: Math.ceil(total / limit),
          total_records: total,
          limit: limit
        }
      }
    });
  }

  return errorResponse('不支持的方法', 405);
}

async function handleLotteryEffectsApi(request, env, pathParts, method, session, lotterySystem) {
  if (method === 'GET' && pathParts[2] === 'active') {
    const effects = await lotterySystem.getUserActiveEffects(session.user_id);

    // 计算剩余时间
    const now = new Date();
    const activeEffects = effects.map(effect => {
      let remainingHours = null;
      if (effect.end_time) {
        const endTime = new Date(effect.end_time);
        remainingHours = Math.max(0, (endTime - now) / (1000 * 60 * 60));
      }

      return {
        id: effect.id,
        effect_type: effect.effect_type,
        effect_value: effect.effect_value,
        effect_multiplier: effect.effect_multiplier,
        description: effect.description || `${effect.prize_name} - ${effect.prize_description}`,
        start_time: effect.start_time,
        end_time: effect.end_time,
        remaining_hours: remainingHours,
        prize_icon: effect.prize_icon,
        prize_color: effect.prize_color
      };
    });

    return jsonResponse({
      success: true,
      data: {
        active_effects: activeEffects,
        total_active_effects: activeEffects.length
      }
    });
  }

  return errorResponse('不支持的方法', 405);
}

async function handleLotteryStatsApi(request, env, pathParts, method, session) {
  if (method === 'GET' && pathParts[2] === 'summary') {
    // 获取用户总体统计
    const overallStats = await env.DB.prepare(`
      SELECT
        SUM(total_spins) as total_spins,
        SUM(total_rewards_value) as total_rewards_value,
        MAX(best_prize_rarity) as best_prize_rarity,
        MAX(consecutive_days) as consecutive_days
      FROM user_lottery_stats
      WHERE user_id = ?
    `).bind(session.user_id).first();

    // 获取各转盘统计
    const wheelStats = await env.DB.prepare(`
      SELECT
        uls.wheel_config_id,
        wc.config_name as wheel_name,
        uls.total_spins,
        uls.daily_spins,
        uls.pity_counter,
        uls.last_spin_date,
        uls.total_rewards_value
      FROM user_lottery_stats uls
      JOIN wheel_config wc ON uls.wheel_config_id = wc.id
      WHERE uls.user_id = ?
      ORDER BY wc.target_user_level
    `).bind(session.user_id).all();

    return jsonResponse({
      success: true,
      data: {
        overall_stats: {
          total_spins: overallStats?.total_spins || 0,
          total_rewards_value: overallStats?.total_rewards_value || 0,
          best_prize_rarity: overallStats?.best_prize_rarity || 'common',
          consecutive_days: overallStats?.consecutive_days || 0
        },
        wheel_stats: wheelStats.results || []
      }
    });
  }

  return errorResponse('不支持的方法', 405);
}

async function handleLotteryAdminApi(request, env, pathParts, method, session, lotterySystem) {
  // 验证管理员权限 - 单管理员系统，只需验证是否为管理员
  if (!session.admin_id) {
    return errorResponse('需要管理员权限', 403);
  }

  if (pathParts[2] === 'prizes') {
    return await handleLotteryPrizesAdminApi(request, env, pathParts, method, session);
  }

  if (pathParts[2] === 'wheels') {
    return await handleLotteryWheelsAdminApi(request, env, pathParts, method, session);
  }

  if (pathParts[2] === 'stats') {
    return await handleLotteryStatsAdminApi(request, env, pathParts, method, session);
  }

  if (pathParts[2] === 'config') {
    return await handleLotteryConfigAdminApi(request, env, pathParts, method, session);
  }

  return errorResponse('管理员API端点不存在', 404);
}

// ============================================
// 抽奖系统管理员API处理函数
// ============================================

async function handleLotteryPrizesAdminApi(request, env, pathParts, method, session) {
  if (method === 'GET') {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page')) || 1;
    const limit = parseInt(url.searchParams.get('limit')) || 50;
    const type = url.searchParams.get('type') || 'all';
    const rarity = url.searchParams.get('rarity') || 'all';
    const offset = (page - 1) * limit;

    let query = `
      SELECT pp.*, 'admin' as created_by_name
      FROM prize_pool pp
      WHERE 1=1
    `;
    const params = [];

    if (type !== 'all') {
      query += ` AND pp.prize_type = ?`;
      params.push(type);
    }

    if (rarity !== 'all') {
      query += ` AND pp.prize_rarity = ?`;
      params.push(rarity);
    }

    query += ` ORDER BY pp.created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const prizes = await env.DB.prepare(query).bind(...params).all();

    // 获取总数
    let countQuery = `SELECT COUNT(*) as total FROM prize_pool WHERE 1=1`;
    const countParams = [];

    if (type !== 'all') {
      countQuery += ` AND prize_type = ?`;
      countParams.push(type);
    }
    if (rarity !== 'all') {
      countQuery += ` AND prize_rarity = ?`;
      countParams.push(rarity);
    }

    const totalResult = await env.DB.prepare(countQuery).bind(...countParams).first();

    return jsonResponse({
      success: true,
      data: {
        prizes: prizes.results || [],
        pagination: {
          current_page: page,
          total_pages: Math.ceil((totalResult?.total || 0) / limit),
          total_records: totalResult?.total || 0,
          limit: limit
        }
      }
    });
  }

  if (method === 'POST' && !pathParts[3]) {
    // 单管理员系统，只需验证是否为管理员
    if (!session.admin_id) {
      return errorResponse('需要管理员权限', 403);
    }

    const body = await request.json();
    const {
      prize_name, prize_description, prize_type, prize_value, prize_rarity,
      prize_icon, prize_color, effect_duration, effect_multiplier, is_punishment,
      min_user_level, max_user_level
    } = body;

    // 验证必填字段
    if (!prize_name || !prize_type || prize_value === undefined || !prize_rarity) {
      return errorResponse('缺少必填字段', 400);
    }

    const result = await env.DB.prepare(`
      INSERT INTO prize_pool
      (prize_name, prize_description, prize_type, prize_value, prize_rarity,
       prize_icon, prize_color, effect_duration, effect_multiplier, is_punishment,
       min_user_level, max_user_level, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      prize_name, prize_description, prize_type, prize_value, prize_rarity,
      prize_icon || '🎁', prize_color || '#3498db', effect_duration || 0,
      effect_multiplier || 1.0, is_punishment || false,
      min_user_level || 1, max_user_level || 13, 1 // 单管理员系统，固定为管理员ID=1
    ).run();

    return jsonResponse({
      success: true,
      message: '奖品创建成功',
      data: { id: result.meta.last_row_id }
    });
  }

  if (method === 'PUT' && pathParts[3]) {
    console.log('📝 奖品编辑请求:', { pathParts, admin_id: session.admin_id });

    // 单管理员系统，只需验证是否为管理员
    if (!session.admin_id) {
      return errorResponse('需要管理员权限', 403);
    }

    try {
      const prizeId = parseInt(pathParts[3]);
      const body = await request.json();

      console.log('📝 编辑奖品ID:', prizeId);
      console.log('📝 请求数据:', body);

      const updateFields = [];
      const updateValues = [];

      const allowedFields = [
        'prize_name', 'prize_description', 'prize_type', 'prize_value', 'prize_rarity',
        'prize_icon', 'prize_color', 'effect_duration', 'effect_multiplier', 'is_punishment',
        'min_user_level', 'max_user_level', 'is_active'
      ];

      allowedFields.forEach(field => {
        if (body[field] !== undefined) {
          updateFields.push(`${field} = ?`);
          updateValues.push(body[field]);
        }
      });

      console.log('📝 更新字段:', updateFields);
      console.log('📝 更新值:', updateValues);

      if (updateFields.length === 0) {
        return errorResponse('没有要更新的字段', 400);
      }

      updateFields.push('updated_at = ?');
      updateValues.push(getUTC8TimestampString());
      updateValues.push(prizeId);

      const updateQuery = `
        UPDATE prize_pool
        SET ${updateFields.join(', ')}
        WHERE id = ?
      `;

      console.log('📝 执行SQL:', updateQuery);
      console.log('📝 绑定参数:', updateValues);

      const result = await env.DB.prepare(updateQuery).bind(...updateValues).run();

      console.log('📝 更新结果:', result);
      console.log('📝 影响行数:', result.changes);

      if (result.changes === 0) {
        return errorResponse('未找到要更新的奖品或数据未发生变化', 404);
      }

      return jsonResponse({
        success: true,
        message: '奖品更新成功',
        changes: result.changes
      });
    } catch (error) {
      console.error('❌ 奖品更新失败:', error);
      return errorResponse('奖品更新失败: ' + error.message, 500);
    }
  }

  if (method === 'DELETE' && pathParts[3]) {
    console.log('🗑️ 奖品删除请求:', { pathParts, admin_id: session.admin_id });

    // 单管理员系统，只需验证是否为管理员
    if (!session.admin_id) {
      return errorResponse('需要管理员权限', 403);
    }

    try {
      const prizeId = parseInt(pathParts[3]);
      console.log('🗑️ 删除奖品ID:', prizeId);

      // 检查是否有转盘在使用此奖品
      const usage = await env.DB.prepare(`
        SELECT COUNT(*) as count FROM wheel_items WHERE prize_id = ?
      `).bind(prizeId).first();

      console.log('🗑️ 奖品使用情况:', usage);

      if (usage?.count > 0) {
        return errorResponse('此奖品正在被转盘使用，无法删除', 400);
      }

      const result = await env.DB.prepare(`
        DELETE FROM prize_pool WHERE id = ?
      `).bind(prizeId).run();

      console.log('🗑️ 删除结果:', result);
      console.log('🗑️ 影响行数:', result.changes);

      if (result.changes === 0) {
        return errorResponse('未找到要删除的奖品', 404);
      }

      return jsonResponse({
        success: true,
        message: '奖品删除成功',
        changes: result.changes
      });
    } catch (error) {
      console.error('❌ 奖品删除失败:', error);
      return errorResponse('奖品删除失败: ' + error.message, 500);
    }
  }

  return errorResponse('不支持的方法', 405);
}

async function handleLotteryWheelsAdminApi(request, env, pathParts, method, session) {
  console.log('🎡 转盘配置API调用:', { method, pathParts });

  if (method === 'GET') {
    try {
      const url = new URL(request.url);
      const level = url.searchParams.get('level') || 'all';
      const active = url.searchParams.get('active') !== 'false';

      console.log('🎡 查询参数:', { level, active });

      // 简化查询，避免JOIN问题
      let query = `
        SELECT wc.*, pp.prize_name as pity_prize_name
        FROM wheel_config wc
        LEFT JOIN prize_pool pp ON wc.pity_prize_id = pp.id
        WHERE 1=1
      `;
      const params = [];

      if (level !== 'all') {
        query += ` AND wc.target_user_level = ?`;
        params.push(parseInt(level));
      }

      if (active) {
        query += ` AND wc.is_active = 1`;
      }

      query += ` ORDER BY wc.target_user_level`;

      console.log('🎡 执行查询:', query, params);
      const wheels = await env.DB.prepare(query).bind(...params).all();
      console.log('🎡 查询结果:', wheels);

      return jsonResponse({
        success: true,
        data: { wheels: wheels.results || [] }
      });
    } catch (error) {
      console.error('❌ 转盘配置查询失败:', error);
      return errorResponse('转盘配置查询失败: ' + error.message, 500);
    }
  }

  // 创建转盘配置 - 只有当没有wheelId时才是创建操作
  if (method === 'POST' && !pathParts[3]) {
    // 单管理员系统，只需验证是否为管理员
    if (!session.admin_id) {
      return errorResponse('需要管理员权限', 403);
    }

    const body = await request.json();
    const {
      config_name, target_user_level, max_daily_spins, spin_cost_type, spin_cost_amount,
      pity_threshold, pity_prize_id, active_start_time, active_end_time, description
    } = body;

    if (!config_name || !target_user_level) {
      return errorResponse('缺少必填字段', 400);
    }

    const result = await env.DB.prepare(`
      INSERT INTO wheel_config
      (config_name, target_user_level, max_daily_spins, spin_cost_type, spin_cost_amount,
       pity_threshold, pity_prize_id, active_start_time, active_end_time, description, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      config_name, target_user_level, max_daily_spins || 3, spin_cost_type || 'free',
      spin_cost_amount || 0, pity_threshold || 10, pity_prize_id,
      active_start_time, active_end_time, description, 1 // 单管理员系统，固定为管理员ID=1
    ).run();

    return jsonResponse({
      success: true,
      message: '转盘配置创建成功',
      data: { id: result.meta.last_row_id }
    });
  }

  if (method === 'PUT' && pathParts[3]) {
    // 单管理员系统，只需验证是否为管理员
    if (!session.admin_id) {
      return errorResponse('需要管理员权限', 403);
    }

    const wheelId = parseInt(pathParts[3]);
    const body = await request.json();

    const updateFields = [];
    const updateValues = [];

    const allowedFields = [
      'config_name', 'max_daily_spins', 'spin_cost_type', 'spin_cost_amount',
      'pity_threshold', 'pity_prize_id', 'is_active', 'active_start_time',
      'active_end_time', 'description'
    ];

    allowedFields.forEach(field => {
      if (body[field] !== undefined) {
        updateFields.push(`${field} = ?`);
        updateValues.push(body[field]);
      }
    });

    if (updateFields.length === 0) {
      return errorResponse('没有要更新的字段', 400);
    }

    updateFields.push('updated_at = ?');
    updateValues.push(getUTC8TimestampString());
    updateValues.push(wheelId);

    await env.DB.prepare(`
      UPDATE wheel_config
      SET ${updateFields.join(', ')}
      WHERE id = ?
    `).bind(...updateValues).run();

    return jsonResponse({
      success: true,
      message: '转盘配置更新成功'
    });
  }

  // 配置转盘物品
  if (method === 'POST' && pathParts[3] && pathParts[4] === 'items') {
    console.log('🎯 配置转盘物品请求:', { method, pathParts, session_admin_id: session.admin_id });
    
    // 单管理员系统，只需验证是否为管理员
    if (!session.admin_id) {
      return errorResponse('需要管理员权限', 403);
    }

    const wheelId = parseInt(pathParts[3]);
    const body = await request.json();
    console.log('🎯 接收到的请求体:', body);
    const { items } = body;

    if (!Array.isArray(items) || items.length === 0) {
      console.log('❌ 物品配置验证失败: 数组为空或非数组');
      return errorResponse('物品配置不能为空', 400);
    }

    console.log('🎯 验证物品配置:', items);

    // 验证每个物品的必填字段
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      console.log(`🎯 验证物品 ${i}:`, item);
      
      // 转换和验证数据类型
      const prizeId = item.prize_id ? parseInt(item.prize_id) : null;
      const probability = parseInt(item.probability) || 0;
      const positionIndex = parseInt(item.position_index) || i;

      if (!prizeId || prizeId <= 0) {
        console.log(`❌ 物品 ${i} 奖品ID无效:`, { 
          original_prize_id: item.prize_id,
          parsed_prize_id: prizeId
        });
        return errorResponse(`物品 ${i + 1} 未选择有效奖品`, 400);
      }

      if (probability <= 0 || probability > 99) {
        console.log(`❌ 物品 ${i} 概率无效:`, { 
          original_probability: item.probability,
          parsed_probability: probability
        });
        return errorResponse(`物品 ${i + 1} 概率必须在1-99之间`, 400);
      }

      // 更新 item 的值为转换后的值
      items[i].prize_id = prizeId;
      items[i].probability = probability;
      items[i].position_index = positionIndex;
    }

    // 验证概率总和
    const totalProbability = items.reduce((sum, item) => sum + (item.probability || 0), 0);
    if (totalProbability !== 100) {
      return errorResponse(`概率总和必须为100%，当前为${totalProbability}%`, 400);
    }

    // 验证是否有稀有物品
    const hasRareItem = items.some(item => {
      // 需要查询奖品稀有度
      return item.is_pity_item || false; // 简化验证
    });

    // 删除现有配置
    await env.DB.prepare(`
      DELETE FROM wheel_items WHERE wheel_config_id = ?
    `).bind(wheelId).run();

    // 插入新配置
    for (const item of items) {
      await env.DB.prepare(`
        INSERT INTO wheel_items
        (wheel_config_id, prize_id, probability, position_index, is_pity_item)
        VALUES (?, ?, ?, ?, ?)
      `).bind(
        wheelId, item.prize_id, item.probability,
        item.position_index, item.is_pity_item || false
      ).run();
    }

    return jsonResponse({
      success: true,
      message: '转盘物品配置成功'
    });
  }

  // 删除转盘配置
  if (method === 'DELETE' && pathParts[3]) {
    // 单管理员系统，只需验证是否为管理员
    if (!session.admin_id) {
      return errorResponse('需要管理员权限', 403);
    }

    const wheelId = parseInt(pathParts[3]);

    // 检查是否有用户正在使用此转盘
    const usage = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM user_lottery_records WHERE wheel_config_id = ?
    `).bind(wheelId).first();

    if (usage?.count > 0) {
      return errorResponse('此转盘已有用户使用记录，无法删除', 400);
    }

    // 删除转盘物品配置
    await env.DB.prepare(`
      DELETE FROM wheel_items WHERE wheel_config_id = ?
    `).bind(wheelId).run();

    // 删除转盘配置
    await env.DB.prepare(`
      DELETE FROM wheel_config WHERE id = ?
    `).bind(wheelId).run();

    return jsonResponse({
      success: true,
      message: '转盘配置删除成功'
    });
  }

  return errorResponse('不支持的方法', 405);
}

async function handleLotteryStatsAdminApi(request, env, pathParts, method, session) {
  if (method === 'GET') {
    if (pathParts[3] === 'system') {
      // 系统统计
      const stats = await env.DB.prepare(`
        SELECT
          COUNT(DISTINCT ulr.user_id) as total_users,
          COUNT(ulr.id) as total_spins,
          SUM(CASE WHEN ulr.reward_delivered = TRUE THEN 1 ELSE 0 END) as successful_deliveries,
          COUNT(DISTINCT DATE(ulr.spin_timestamp)) as active_days
        FROM user_lottery_records ulr
        WHERE ulr.spin_timestamp >= date('now', '-30 days')
      `).first();

      const prizeStats = await env.DB.prepare(`
        SELECT
          pp.prize_rarity,
          COUNT(ulr.id) as count,
          SUM(pp.prize_value) as total_value
        FROM user_lottery_records ulr
        JOIN prize_pool pp ON ulr.prize_id = pp.id
        WHERE ulr.spin_timestamp >= date('now', '-30 days')
        GROUP BY pp.prize_rarity
        ORDER BY count DESC
      `).all();

      return jsonResponse({
        success: true,
        data: {
          system_stats: stats,
          prize_distribution: prizeStats.results || []
        }
      });
    }

    if (pathParts[3] === 'users') {
      const url = new URL(request.url);
      const dateFrom = url.searchParams.get('date_from');
      const dateTo = url.searchParams.get('date_to');

      let query = `
        SELECT
          u.id, u.username, u.level,
          COUNT(ulr.id) as total_spins,
          SUM(pp.prize_value) as total_rewards_value,
          MAX(ulr.spin_timestamp) as last_spin
        FROM users u
        LEFT JOIN user_lottery_records ulr ON u.id = ulr.user_id
        LEFT JOIN prize_pool pp ON ulr.prize_id = pp.id
        WHERE 1=1
      `;
      const params = [];

      if (dateFrom) {
        query += ` AND ulr.spin_timestamp >= ?`;
        params.push(dateFrom);
      }
      if (dateTo) {
        query += ` AND ulr.spin_timestamp <= ?`;
        params.push(dateTo);
      }

      query += ` GROUP BY u.id, u.username, u.level ORDER BY total_spins DESC LIMIT 100`;

      const userStats = await env.DB.prepare(query).bind(...params).all();

      return jsonResponse({
        success: true,
        data: { user_stats: userStats.results || [] }
      });
    }

    if (pathParts[3] === 'prizes') {
      const url = new URL(request.url);
      const wheelId = url.searchParams.get('wheel_id');
      const period = url.searchParams.get('period') || '7d';

      let dateFilter = '';
      switch (period) {
        case '1d':
          dateFilter = "AND ulr.spin_timestamp >= date('now', '-1 day')";
          break;
        case '7d':
          dateFilter = "AND ulr.spin_timestamp >= date('now', '-7 days')";
          break;
        case '30d':
          dateFilter = "AND ulr.spin_timestamp >= date('now', '-30 days')";
          break;
      }

      let query = `
        SELECT
          pp.id, pp.prize_name, pp.prize_rarity,
          COUNT(ulr.id) as awarded_count,
          SUM(pp.prize_value) as total_value,
          AVG(pp.prize_value) as avg_value
        FROM prize_pool pp
        LEFT JOIN user_lottery_records ulr ON pp.id = ulr.prize_id ${dateFilter}
      `;
      const params = [];

      if (wheelId) {
        query += ` AND ulr.wheel_config_id = ?`;
        params.push(parseInt(wheelId));
      }

      query += ` GROUP BY pp.id, pp.prize_name, pp.prize_rarity ORDER BY awarded_count DESC`;

      const prizeStats = await env.DB.prepare(query).bind(...params).all();

      return jsonResponse({
        success: true,
        data: { prize_stats: prizeStats.results || [] }
      });
    }
  }

  return errorResponse('不支持的方法', 405);
}

async function handleLotteryConfigAdminApi(request, env, pathParts, method, session) {
  if (method === 'GET') {
    const configs = await env.DB.prepare(`
      SELECT * FROM lottery_system_config ORDER BY config_key
    `).all();

    return jsonResponse({
      success: true,
      data: { configs: configs.results || [] }
    });
  }

  if (method === 'PUT') {
    // 单管理员系统，只需验证是否为管理员
    if (!session.admin_id) {
      return errorResponse('需要管理员权限', 403);
    }

    const body = await request.json();
    const { configs } = body;

    if (!Array.isArray(configs)) {
      return errorResponse('配置格式错误', 400);
    }

    for (const config of configs) {
      if (config.is_editable) {
        await env.DB.prepare(`
          UPDATE lottery_system_config
          SET config_value = ?, updated_at = ?
          WHERE config_key = ?
        `).bind(config.config_value, getUTC8TimestampString(), config.config_key).run();
      }
    }

    return jsonResponse({
      success: true,
      message: '系统配置更新成功'
    });
  }

  return errorResponse('不支持的方法', 405);
}







// 导入兑换码API处理
async function handleImportCodesApi(request, env, adminId) {
  try {
    if (!await checkAdminPermission(env, adminId, 'level_config', 'write')) {
      return errorResponse('权限不足：无法导入兑换码', 403);
    }

    const { codes, amount, importType } = await request.json();

    if (!amount || amount <= 0) {
      return errorResponse('金额必须大于0', 400);
    }

    if (!codes || !Array.isArray(codes) || codes.length === 0) {
      return errorResponse('兑换码列表不能为空', 400);
    }

    if (codes.length > 1000) {
      return errorResponse('单次导入兑换码数量不能超过1000个', 400);
    }

    // 创建上传批次记录
    const batchResult = await env.DB.prepare(`
      INSERT INTO upload_batches (filename, amount, total_codes, valid_codes, duplicate_codes, invalid_codes, uploaded_by, uploaded_at, upload_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind('manual_import', amount, codes.length, 0, 0, 0, adminId, getUTC8TimestampString(), 'processing').run();

    const batchId = batchResult.meta.last_row_id;
    let successCount = 0;
    let duplicateCount = 0;
    let invalidCount = 0;

    for (const code of codes) {
      const trimmedCode = code.trim();

      // 验证兑换码格式 - 修正正则表达式
      if (!trimmedCode || trimmedCode.length < 6 || trimmedCode.length > 32 || !/^[A-Za-z0-9_-]+$/.test(trimmedCode)) {
        invalidCount++;
        continue;
      }

      try {
        // 检查是否已存在
        const existing = await env.DB.prepare(`
          SELECT id FROM redemption_codes WHERE code = ?
        `).bind(trimmedCode).first();

        if (existing) {
          duplicateCount++;
          continue;
        }

        // 插入新兑换码 - 修正参数绑定
        await env.DB.prepare(`
          INSERT INTO redemption_codes (code, amount, batch_id, created_at)
          VALUES (?, ?, ?, ?)
        `).bind(trimmedCode, amount, batchId, getUTC8TimestampString()).run();

        successCount++;
      } catch (error) {
        console.error('Insert code error:', error);
        invalidCount++;
      }
    }

    // 更新批次状态
    await env.DB.prepare(`
      UPDATE upload_batches
      SET valid_codes = ?, duplicate_codes = ?, invalid_codes = ?, processed_at = ?, upload_status = ?
      WHERE id = ?
    `).bind(successCount, duplicateCount, invalidCount, getUTC8TimestampString(), 'completed', batchId).run();

    // 记录操作日志
    await env.DB.prepare(`
      INSERT INTO operation_logs
      (operator_type, operator_id, operation_type, operation_detail, target_type, result, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      'admin',
      adminId,
      'codes_import',
      `导入${successCount}个兑换码，金额$${amount}，方式：${importType}`,
      'redemption_codes',
      'success',
      getUTC8TimestampString()
    ).run();

    return jsonResponse({
      success: true,
      message: `导入完成：成功${successCount}个，重复${duplicateCount}个，无效${invalidCount}个`,
      result: {
        success: successCount,
        duplicate: duplicateCount,
        invalid: invalidCount,
        total: codes.length,
        batch_id: batchId
      }
    });
  } catch (error) {
    console.error('Import codes error:', error);
    return errorResponse('导入兑换码失败: ' + error.message, 500);
  }
}

// 创建配置快照API处理
async function handleCreateSnapshotApi(request, env, adminId) {
  try {
    if (!await checkAdminPermission(env, adminId, 'system_settings', 'admin')) {
      return errorResponse('权限不足：无法创建配置快照', 403);
    }

    const { snapshot_name, description, include_categories } = await request.json();

    if (!snapshot_name) {
      return errorResponse('快照名称不能为空', 400);
    }

    // 获取当前配置数据
    const configData = {};

    if (include_categories.includes('level_config')) {
      const levels = await env.DB.prepare('SELECT * FROM user_levels').all();
      configData.user_levels = levels.results || [];
    }

    if (include_categories.includes('experience_rules')) {
      const rules = await env.DB.prepare('SELECT * FROM experience_rules').all();
      configData.experience_rules = rules.results || [];
    }

    if (include_categories.includes('reward_config')) {
      const rewards = await env.DB.prepare('SELECT * FROM level_rewards').all();
      configData.level_rewards = rewards.results || [];
    }

    // 创建版本记录
    const result = await env.DB.prepare(`
      INSERT INTO level_config_versions
      (version_name, version_description, config_data, created_by, is_active)
      VALUES (?, ?, ?, ?, FALSE)
    `).bind(
      snapshot_name,
      description || '',
      JSON.stringify(configData),
      adminId
    ).run();

    // 记录操作日志
    await env.DB.prepare(`
      INSERT INTO admin_operation_logs
      (admin_id, operation_type, operation_target, operation_reason, operation_status, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      adminId,
      'config_snapshot_create',
      'level_config_versions',
      `创建配置快照: ${snapshot_name}`,
      'applied',
      getUTC8TimestampString()
    ).run();

    return jsonResponse({
      success: true,
      message: '配置快照创建成功',
      version_id: result.meta.last_row_id
    });
  } catch (error) {
    console.error('Create snapshot error:', error);
    return errorResponse('创建快照失败: ' + error.message, 500);
  }
}

// ============================================
// 前端HTML界面
// ============================================

function getAdminHTML() {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>KYX 签到系统 - 超级管理后台</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: #333;
        }

        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
        }

        .header {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border-radius: 15px;
            padding: 20px 30px;
            margin-bottom: 30px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .header h1 {
            color: #2c3e50;
            font-size: 28px;
            font-weight: 700;
        }

        .header .subtitle {
            color: #7f8c8d;
            font-size: 14px;
            margin-top: 5px;
        }

        .user-info {
            display: flex;
            align-items: center;
            gap: 15px;
        }

        .logout-btn {
            background: #e74c3c;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.3s ease;
        }

        .logout-btn:hover {
            background: #c0392b;
            transform: translateY(-2px);
        }

        .nav-tabs {
            display: flex;
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border-radius: 15px;
            padding: 10px;
            margin-bottom: 30px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
            overflow-x: auto;
        }

        .nav-tab {
            flex: 1;
            min-width: 120px;
            padding: 12px 20px;
            text-align: center;
            background: transparent;
            border: none;
            border-radius: 10px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            color: #7f8c8d;
            transition: all 0.3s ease;
            white-space: nowrap;
        }

        .nav-tab.active {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            transform: translateY(-2px);
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
        }

        .nav-tab:hover:not(.active) {
            background: rgba(102, 126, 234, 0.1);
            color: #667eea;
        }

        .content {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border-radius: 15px;
            padding: 30px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
            min-height: 600px;
        }

        .tab-content {
            display: none;
        }

        .tab-content.active {
            display: block;
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }

        .stat-card {
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            color: white;
            padding: 25px;
            border-radius: 15px;
            text-align: center;
            box-shadow: 0 8px 25px rgba(240, 147, 251, 0.3);
            transition: transform 0.3s ease;
        }

        .stat-card:hover {
            transform: translateY(-5px);
        }

        .stat-card h3 {
            font-size: 14px;
            margin-bottom: 10px;
            opacity: 0.9;
        }

        .stat-card .number {
            font-size: 32px;
            font-weight: 700;
            margin-bottom: 5px;
        }

        .level-card {
            background: linear-gradient(135deg, #a8edea 0%, #fed6e3 100%);
            color: #2c3e50;
        }

        .experience-card {
            background: linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%);
            color: #2c3e50;
        }

        .table-container {
            overflow-x: auto;
            border-radius: 10px;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
        }

        table {
            width: 100%;
            border-collapse: collapse;
            background: white;
        }

        th, td {
            padding: 15px;
            text-align: left;
            border-bottom: 1px solid #ecf0f1;
        }

        th {
            background: #f8f9fa;
            font-weight: 600;
            color: #2c3e50;
            position: sticky;
            top: 0;
        }

        tr:hover {
            background: #f8f9fa;
        }

        .level-badge {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 500;
            color: white;
        }

        .progress-bar {
            width: 100%;
            height: 8px;
            background: #ecf0f1;
            border-radius: 4px;
            overflow: hidden;
        }

        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
            transition: width 0.3s ease;
        }

        .btn {
            padding: 10px 20px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.3s ease;
            text-decoration: none;
            display: inline-block;
        }

        .btn-primary {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }

        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
        }

        .btn-success {
            background: linear-gradient(135deg, #56ab2f 0%, #a8e6cf 100%);
            color: white;
        }

        .btn-warning {
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            color: white;
        }

        .btn-danger {
            background: linear-gradient(135deg, #ff416c 0%, #ff4b2b 100%);
            color: white;
        }

        .btn-sm {
            padding: 6px 12px;
            font-size: 12px;
            background: #f8f9fa;
            color: #495057;
            border: 1px solid #dee2e6;
        }

        .btn-sm:hover {
            background: #e9ecef;
            transform: none;
            box-shadow: none;
        }

        .btn-sm.btn-primary {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
        }

        /* 抽奖管理样式 */
        .lottery-nav {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
        }

        .lottery-nav-btn {
            margin-right: 0 !important;
        }

        .lottery-nav-btn.active {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
            color: white !important;
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(102, 126, 234, 0.3);
        }

        .lottery-section {
            animation: fadeIn 0.3s ease-in-out;
        }

        .status-indicator {
            font-weight: bold;
            padding: 5px 10px;
            border-radius: 15px;
            background: rgba(39, 174, 96, 0.1);
            color: #27ae60;
        }

        .stat-card, .config-section {
            transition: transform 0.2s ease;
        }

        .stat-card:hover, .config-section:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }

        .config-input {
            width: 100%;
            padding: 8px 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
            transition: border-color 0.2s ease;
        }

        .config-input:focus {
            outline: none;
            border-color: #667eea;
            box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.2);
        }

        .config-input[readonly] {
            background-color: #f8f9fa;
            color: #6c757d;
        }

        /* 签到记录模块样式 */
        .stat-value {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 5px;
        }

        .stat-label {
            font-size: 12px;
            color: #666;
            text-transform: uppercase;
        }

        .stat-item {
            display: flex;
            align-items: center;
            padding: 8px 12px;
            background: #f8f9fa;
            border-radius: 4px;
            margin: 4px 0;
        }

        .consecutive-stat {
            padding: 6px 12px;
            background: #e3f2fd;
            border-radius: 4px;
            margin: 4px;
            font-size: 12px;
            border-left: 3px solid #2196f3;
        }

        .badge {
            display: inline-block;
            padding: 3px 8px;
            border-radius: 3px;
            font-size: 11px;
            font-weight: 500;
        }

        .badge-success { background: #28a745; color: white; }
        .badge-info { background: #17a2b8; color: white; }
        .badge-warning { background: #ffc107; color: #212529; }
        .badge-danger { background: #dc3545; color: white; }
        .badge-secondary { background: #6c757d; color: white; }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        /* 抽奖模态框样式 */
        #lotteryModal .modal-content {
            max-width: 800px;
            max-height: 90vh;
            overflow-y: auto;
        }

        #lotteryModal .modal-body {
            max-height: 60vh;
            overflow-y: auto;
        }

        #lotteryModal .form-group {
            margin-bottom: 15px;
        }

        #lotteryModal .form-group label {
            display: block;
            margin-bottom: 5px;
            font-weight: 500;
            color: #333;
        }

        #lotteryModal .form-group input,
        #lotteryModal .form-group select,
        #lotteryModal .form-group textarea {
            width: 100%;
            padding: 8px 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
            transition: border-color 0.2s ease;
        }

        #lotteryModal .form-group input:focus,
        #lotteryModal .form-group select:focus,
        #lotteryModal .form-group textarea:focus {
            outline: none;
            border-color: #667eea;
            box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.2);
        }

        #lotteryModal .form-group textarea {
            resize: vertical;
            min-height: 80px;
        }

        #lotteryModal .form-hint {
            display: block;
            margin-top: 5px;
            font-size: 12px;
            color: #6c757d;
        }

        .wheel-item-row {
            background: #f8f9fa;
            transition: background-color 0.2s ease;
        }

        .wheel-item-row:hover {
            background: #e9ecef;
        }

        .form-group {
            margin-bottom: 20px;
        }

        .form-group label {
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
            color: #2c3e50;
        }

        .form-control {
            width: 100%;
            padding: 12px;
            border: 2px solid #ecf0f1;
            border-radius: 8px;
            font-size: 14px;
            transition: border-color 0.3s ease;
        }

        .form-control:focus {
            outline: none;
            border-color: #667eea;
        }

        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(5px);
            z-index: 1000;
        }

        .modal.show {
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .modal-content {
            background: white;
            border-radius: 15px;
            padding: 30px;
            max-width: 600px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        }

        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 2px solid #ecf0f1;
        }

        .modal-title {
            font-size: 20px;
            font-weight: 600;
            color: #2c3e50;
        }

        .close-btn {
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            color: #7f8c8d;
            padding: 0;
            width: 30px;
            height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .close-btn:hover {
            color: #e74c3c;
        }

        .loading {
            text-align: center;
            padding: 40px;
            color: #7f8c8d;
        }

        .loading::after {
            content: '';
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 2px solid #ecf0f1;
            border-top: 2px solid #667eea;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-left: 10px;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        .alert {
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
            border-left: 4px solid;
        }

        .alert-success {
            background: #d4edda;
            color: #155724;
            border-color: #28a745;
        }

        .alert-error {
            background: #f8d7da;
            color: #721c24;
            border-color: #dc3545;
        }

        .alert-warning {
            background: #fff3cd;
            color: #856404;
            border-color: #ffc107;
        }

        .alert-info {
            background: #cce7ff;
            color: #004085;
            border-color: #007bff;
        }

        @media (max-width: 768px) {
            .container {
                padding: 10px;
            }

            .header {
                flex-direction: column;
                gap: 15px;
                text-align: center;
            }

            .nav-tabs {
                flex-direction: column;
            }

            .nav-tab {
                margin-bottom: 5px;
            }

            .stats-grid {
                grid-template-columns: 1fr;
            }

            .content {
                padding: 20px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div>
                <h1>KYX 签到系统 - 超级管理后台</h1>
                <div class="subtitle">13级修仙境界等级体系 & 完整管理员权限控制</div>
            </div>
            <div class="user-info">
                <span id="adminUsername">管理员</span>
                <button class="logout-btn" onclick="logout()">退出登录</button>
            </div>
        </div>

        <div class="nav-tabs">
            <button class="nav-tab active" onclick="showTab('dashboard')">📊 仪表盘</button>
            <button class="nav-tab" onclick="showTab('codes')">🎫 兑换码</button>
            <button class="nav-tab" onclick="showTab('users')">👥 用户管理</button>
            <button class="nav-tab" onclick="showTab('levels')">🏔️ 等级配置</button>
            <button class="nav-tab" onclick="showTab('experience')">⚡ 经验规则</button>
            <button class="nav-tab" onclick="showTab('checkin-records')">📝 签到记录</button>
            <button class="nav-tab" onclick="showTab('rewards')">🎁 奖励配置</button>
            <button class="nav-tab" onclick="showTab('leaderboard')">🏆 排行榜</button>
            <button class="nav-tab" onclick="showTab('lottery')">🎰 抽奖管理</button>
        </div>

        <div class="content">
            <!-- 仪表盘 -->
            <div id="dashboard" class="tab-content active">
                <div class="stats-grid">
                    <div class="stat-card">
                        <h3>总兑换码</h3>
                        <div class="number" id="totalCodes">-</div>
                    </div>
                    <div class="stat-card">
                        <h3>未分配</h3>
                        <div class="number" id="undistributedCodes">-</div>
                    </div>
                    <div class="stat-card">
                        <h3>已分配</h3>
                        <div class="number" id="distributedCodes">-</div>
                    </div>
                    <div class="stat-card">
                        <h3>总用户数</h3>
                        <div class="number" id="totalUsers">-</div>
                    </div>
                    <div class="stat-card level-card">
                        <h3>等级系统</h3>
                        <div class="number" id="totalLevels">-</div>
                        <small>最高等级: <span id="maxLevel">-</span></small>
                    </div>
                    <div class="stat-card experience-card">
                        <h3>平均经验</h3>
                        <div class="number" id="avgExperience">-</div>
                    </div>
                    <div class="stat-card">
                        <h3>活跃用户</h3>
                        <div class="number" id="activeUsers">-</div>
                    </div>
                    <div class="stat-card">
                        <h3>总签到数</h3>
                        <div class="number" id="totalCheckins">-</div>
                    </div>
                </div>
            </div>

            <!-- 兑换码管理 -->
            <div id="codes" class="tab-content">
                <div style="margin-bottom: 20px;">
                    <button class="btn btn-primary" onclick="showImportCodesModal()">导入兑换码</button>
                    <button class="btn btn-success" onclick="refreshCodes()">刷新</button>

                    <!-- 排序和分页控制 -->
                    <div style="display: inline-block; margin-left: 20px;">
                        <label>排序方式：</label>
                        <select id="codesSortBy" onchange="loadCodes(1)">
                            <option value="id">按ID</option>
                            <option value="created_at">按创建时间</option>
                            <option value="amount">按金额</option>
                            <option value="is_used">按使用状态</option>
                            <option value="is_distributed">按分配状态</option>
                            <option value="batch_id">按批次</option>
                        </select>
                        <select id="codesSortOrder" onchange="loadCodes(1)">
                            <option value="ASC">升序</option>
                            <option value="DESC">降序</option>
                        </select>

                        <label style="margin-left: 15px;">每页显示：</label>
                        <select id="codesPageSize" onchange="loadCodes(1)">
                            <option value="25">25条</option>
                            <option value="50" selected>50条</option>
                            <option value="100">100条</option>
                            <option value="200">200条</option>
                        </select>
                    </div>
                </div>

                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>兑换码</th>
                                <th>金额</th>
                                <th>状态</th>
                                <th>分配给</th>
                                <th>创建时间</th>
                            </tr>
                        </thead>
                        <tbody id="codesTableBody">
                            <tr><td colspan="6" class="loading">加载中...</td></tr>
                        </tbody>
                    </table>
                </div>

                <!-- 分页控制 -->
                <div id="codesPagination" style="margin-top: 20px; text-align: center;">
                    <!-- 分页按钮将通过JavaScript动态生成 -->
                </div>
            </div>

            <!-- 用户管理 -->
            <div id="users" class="tab-content">
                <div style="margin-bottom: 20px;">
                    <button class="btn btn-success" onclick="refreshUsers()">刷新</button>
                    <button class="btn btn-warning" onclick="generateTestData()" style="margin-left: 10px;">🧪 生成测试数据</button>
                    <button class="btn btn-info" onclick="fixUserLevels()" style="margin-left: 10px;">🔧 修复等级</button>
                    <button class="btn btn-primary" onclick="warmupCache()" style="margin-left: 10px;">🔥 预热缓存</button>
                    <button class="btn btn-secondary" onclick="checkKVStatus()" style="margin-left: 10px;">🔍 检查KV状态</button>
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>用户信息</th>
                                <th>修仙等级</th>
                                <th>经验值</th>
                                <th>连续签到</th>
                                <th>注册时间</th>
                                <th>操作</th>
                            </tr>
                        </thead>
                        <tbody id="usersTableBody">
                            <tr><td colspan="7" class="loading">加载中...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- 等级配置 -->
            <div id="levels" class="tab-content">
                <div style="margin-bottom: 20px;">
                    <button class="btn btn-primary" onclick="refreshLevelConfigs()">刷新配置</button>
                    <button class="btn btn-warning" onclick="createConfigSnapshot()">创建快照</button>
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>等级</th>
                                <th>名称</th>
                                <th>所需经验</th>
                                <th>签到天数</th>
                                <th>连续天数</th>
                                <th>奖励倍数</th>
                                <th>当前用户数</th>
                                <th>操作</th>
                            </tr>
                        </thead>
                        <tbody id="levelConfigsTableBody">
                            <tr><td colspan="8" class="loading">加载中...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- 经验规则 -->
            <div id="experience" class="tab-content">
                <div style="margin-bottom: 20px;">
                    <button class="btn btn-primary" onclick="refreshExperienceRules()">刷新规则</button>
                    <button class="btn btn-success" onclick="createExperienceRule()">新增规则</button>
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>规则名称</th>
                                <th>类型</th>
                                <th>基础经验</th>
                                <th>使用次数</th>
                                <th>总经验发放</th>
                                <th>状态</th>
                                <th>操作</th>
                            </tr>
                        </thead>
                        <tbody id="experienceRulesTableBody">
                            <tr><td colspan="7" class="loading">加载中...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- 签到记录 -->
            <div id="checkin-records" class="tab-content">
                <div class="section-header">
                    <h2>📝 签到记录管理</h2>
                    <p>查看和管理用户签到记录，分析签到统计数据</p>
                </div>

                <!-- 筛选控件 -->
                <div style="background: #f8f9fa; padding: 20px; margin-bottom: 20px; border-radius: 8px;">
                    <h4>🔍 记录筛选</h4>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-top: 15px;">
                        <div>
                            <label>用户ID</label>
                            <input type="number" id="filterUserId" placeholder="输入用户ID">
                        </div>
                        <div>
                            <label>开始日期</label>
                            <input type="date" id="filterDateFrom">
                        </div>
                        <div>
                            <label>结束日期</label>
                            <input type="date" id="filterDateTo">
                        </div>
                        <div>
                            <label>状态</label>
                            <select id="filterStatus">
                                <option value="">全部状态</option>
                                <option value="completed">已完成</option>
                                <option value="pending">待处理</option>
                                <option value="failed">失败</option>
                            </select>
                        </div>
                    </div>
                    <div style="margin-top: 15px;">
                        <button class="btn btn-primary" onclick="loadCheckinRecords()">🔍 查询记录</button>
                        <button class="btn btn-info" onclick="loadCheckinStats()">📊 统计数据</button>
                        <button class="btn btn-success" onclick="exportCheckinRecords()">📥 导出记录</button>
                        <button class="btn btn-secondary" onclick="resetCheckinFilters()">🔄 重置筛选</button>
                    </div>
                </div>

                <!-- 统计概览 -->
                <div id="checkinStatsOverview" style="display: none; margin-bottom: 20px;"></div>

                <!-- 记录列表 -->
                <div id="checkinRecordsList">
                    <div style="text-align: center; padding: 40px; color: #666;">
                        <i style="font-size: 48px;">📝</i>
                        <p style="margin-top: 10px;">点击"查询记录"查看签到数据</p>
                    </div>
                </div>

                <!-- 分页控件 -->
                <div id="checkinPagination" style="margin-top: 20px; text-align: center;"></div>
            </div>

            <!-- 奖励配置 -->
            <div id="rewards" class="tab-content">
                <div style="margin-bottom: 20px;">
                    <button class="btn btn-primary" onclick="refreshRewardConfigs()">刷新配置</button>
                    <button class="btn btn-success" onclick="addRewardConfig()">新增奖励</button>
                </div>
                <div id="rewardConfigsContainer">
                    <div class="loading">加载中...</div>
                </div>
            </div>



            <!-- 排行榜 -->
            <div id="leaderboard" class="tab-content">
                <div style="margin-bottom: 20px;">
                    <button class="btn btn-success" onclick="refreshLeaderboard()">刷新排行榜</button>
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>排名</th>
                                <th>用户名</th>
                                <th>等级</th>
                                <th>经验值</th>
                                <th>签到天数</th>
                                <th>连续签到</th>
                                <th>最大连续</th>
                            </tr>
                        </thead>
                        <tbody id="leaderboardTableBody">
                            <tr><td colspan="7" class="loading">加载中...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- 抽奖管理 -->
            <div id="lottery" class="tab-content">
                <div class="lottery-management">
                    <!-- 抽奖系统状态 -->
                    <div class="status-card" style="margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                        <h3>🎰 抽奖系统状态</h3>
                        <div id="lotterySystemStatus">
                            <span class="status-indicator" id="lotteryStatus">🟢 系统正常</span>
                            <button class="btn btn-sm" onclick="toggleLotterySystem()" style="margin-left: 10px;">切换状态</button>
                        </div>
                    </div>

                    <!-- 功能导航 -->
                    <div class="lottery-nav" style="margin-bottom: 20px;">
                        <button class="btn btn-primary lottery-nav-btn active" onclick="showLotterySection('prizes')">🎁 奖品池管理</button>
                        <button class="btn btn-primary lottery-nav-btn" onclick="showLotterySection('wheels')">🎡 转盘配置</button>
                        <button class="btn btn-primary lottery-nav-btn" onclick="showLotterySection('stats')">📊 数据统计</button>
                        <button class="btn btn-primary lottery-nav-btn" onclick="showLotterySection('config')">⚙️ 系统配置</button>
                    </div>

                    <!-- 奖品池管理 -->
                    <div id="lotteryPrizes" class="lottery-section">
                        <div style="margin-bottom: 20px;">
                            <button class="btn btn-success" onclick="showCreatePrizeModal()">创建奖品</button>
                            <button class="btn btn-info" onclick="refreshPrizes()">刷新</button>

                            <div style="display: inline-block; margin-left: 20px;">
                                <label>类型筛选：</label>
                                <select id="prizeTypeFilter" onchange="loadPrizes()">
                                    <option value="all">全部</option>
                                    <option value="redemption_code">兑换码</option>
                                    <option value="experience">经验值</option>
                                    <option value="signin_effect">签到效果</option>
                                </select>

                                <label style="margin-left: 15px;">稀有度：</label>
                                <select id="prizeRarityFilter" onchange="loadPrizes()">
                                    <option value="all">全部</option>
                                    <option value="common">普通</option>
                                    <option value="rare">稀有</option>
                                    <option value="epic">史诗</option>
                                    <option value="legendary">传说</option>
                                </select>
                            </div>
                        </div>

                        <div class="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>奖品名称</th>
                                        <th>类型</th>
                                        <th>数值</th>
                                        <th>稀有度</th>
                                        <th>等级要求</th>
                                        <th>状态</th>
                                        <th>操作</th>
                                    </tr>
                                </thead>
                                <tbody id="prizesTableBody">
                                    <tr><td colspan="8" class="loading">加载中...</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- 转盘配置 -->
                    <div id="lotteryWheels" class="lottery-section" style="display: none;">
                        <div style="margin-bottom: 20px;">
                            <button class="btn btn-success" onclick="showCreateWheelModal()">创建转盘</button>
                            <button class="btn btn-info" onclick="refreshWheels()">刷新</button>

                            <div style="display: inline-block; margin-left: 20px;">
                                <label>等级筛选：</label>
                                <select id="wheelLevelFilter" onchange="loadWheels()">
                                    <option value="all">全部等级</option>
                                    <option value="1">炼气境</option>
                                    <option value="2">筑基境</option>
                                    <option value="3">结丹境</option>
                                    <option value="4">元婴境</option>
                                    <option value="5">化神境</option>
                                    <option value="6">炼虚境</option>
                                    <option value="7">合体境</option>
                                    <option value="8">大乘境</option>
                                    <option value="9">真仙境</option>
                                    <option value="10">金仙境</option>
                                    <option value="11">太乙境</option>
                                    <option value="12">大罗境</option>
                                    <option value="13">道祖境</option>
                                </select>
                            </div>
                        </div>

                        <div class="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>转盘名称</th>
                                        <th>目标等级</th>
                                        <th>每日次数</th>
                                        <th>保底次数</th>
                                        <th>状态</th>
                                        <th>操作</th>
                                    </tr>
                                </thead>
                                <tbody id="wheelsTableBody">
                                    <tr><td colspan="7" class="loading">加载中...</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- 数据统计 -->
                    <div id="lotteryStats" class="lottery-section" style="display: none;">
                        <div class="stats-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 20px;">
                            <div class="stat-card" style="padding: 15px; background: #f8f9fa; border-radius: 8px;">
                                <h4>📊 系统统计</h4>
                                <div id="systemStats">加载中...</div>
                            </div>
                            <div class="stat-card" style="padding: 15px; background: #f8f9fa; border-radius: 8px;">
                                <h4>🎁 奖品分布</h4>
                                <div id="prizeDistribution">加载中...</div>
                            </div>
                            <div class="stat-card" style="padding: 15px; background: #f8f9fa; border-radius: 8px;">
                                <h4>👥 用户活跃度</h4>
                                <div id="userActivity">加载中...</div>
                            </div>
                        </div>

                        <div style="margin-bottom: 20px;">
                            <button class="btn btn-info" onclick="refreshLotteryStats()">刷新统计</button>
                            <button class="btn btn-secondary" onclick="exportLotteryStats()">导出数据</button>
                        </div>
                    </div>

                    <!-- 系统配置 -->
                    <div id="lotteryConfig" class="lottery-section" style="display: none;">
                        <div style="margin-bottom: 20px;">
                            <h3>⚙️ 抽奖系统配置</h3>
                            <button class="btn btn-success" onclick="saveLotteryConfig()">保存配置</button>
                            <button class="btn btn-info" onclick="refreshLotteryConfig()">刷新</button>
                        </div>

                        <div class="config-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 20px;">
                            <div class="config-section" style="padding: 15px; background: #f8f9fa; border-radius: 8px;">
                                <h4>基础设置</h4>
                                <div id="basicConfig">加载中...</div>
                            </div>
                            <div class="config-section" style="padding: 15px; background: #f8f9fa; border-radius: 8px;">
                                <h4>高级设置</h4>
                                <div id="advancedConfig">加载中...</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

        </div>
    </div>

    <!-- 抽奖系统专用模态框 -->
    <div id="lotteryModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h3 class="modal-title" id="lotteryModalTitle">标题</h3>
                <button class="close-btn" onclick="closeLotteryModal()">&times;</button>
            </div>
            <div class="modal-body" id="lotteryModalBody">
                <!-- 动态内容 -->
            </div>
            <div class="modal-footer" id="lotteryModalFooter">
                <!-- 动态按钮 -->
            </div>
        </div>
    </div>

    <!-- 模态框 -->
    <div id="modal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h3 class="modal-title" id="modalTitle">标题</h3>
                <button class="close-btn" onclick="closeModal()">&times;</button>
            </div>
            <div id="modalBody">
                <!-- 模态框内容 -->
            </div>
        </div>
    </div>

    <script>
        // 全局变量
        let currentTab = 'dashboard';

        // 页面加载完成后初始化
        document.addEventListener('DOMContentLoaded', function() {
            loadDashboard();

            // 初始化抽奖系统状态
            initializeLotterySystem();
        });

        // 初始化抽奖系统
        async function initializeLotterySystem() {
            try {
                const response = await apiRequest('lottery/admin/config');
                const configs = response.data.configs || [];
                const systemEnabled = configs.find(c => c.config_key === 'system_enabled');

                if (systemEnabled) {
                    const statusElement = document.getElementById('lotteryStatus');
                    if (statusElement) {
                        statusElement.innerHTML = systemEnabled.config_value === 'true' ? '🟢 系统正常' : '🔴 系统关闭';
                    }
                }
            } catch (error) {
                console.error('Failed to initialize lottery system:', error);
            }
        }

        // 标签页切换
        function showTab(tabName) {
            // 隐藏所有标签页内容
            document.querySelectorAll('.tab-content').forEach(tab => {
                tab.classList.remove('active');
            });

            // 移除所有标签按钮的激活状态
            document.querySelectorAll('.nav-tab').forEach(btn => {
                btn.classList.remove('active');
            });

            // 显示选中的标签页
            document.getElementById(tabName).classList.add('active');
            event.target.classList.add('active');

            currentTab = tabName;

            // 根据标签页加载相应数据
            switch(tabName) {
                case 'dashboard':
                    loadDashboard();
                    break;
                case 'codes':
                    loadCodes();
                    break;
                case 'users':
                    loadUsers();
                    break;
                case 'levels':
                    loadLevelConfigs();
                    break;
                case 'experience':
                    loadExperienceRules();
                    break;
                case 'rewards':
                    loadRewardConfigs();
                    break;

                case 'leaderboard':
                    loadLeaderboard();
                    break;
            }
        }

        // API 请求函数
        async function apiRequest(endpoint, method = 'GET', data = null) {
            console.log('🌐 API请求:', { endpoint, method, data });

            const url = \`/api/admin/\${endpoint}\`;
            const options = {
                method: method,
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include'
            };

            if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
                options.body = JSON.stringify(data);
            }

            console.log('🌐 请求配置:', { url, options });

            try {
                const response = await fetch(url, options);
                console.log('🌐 响应状态:', response.status);

                if (response.status === 401) {
                    window.location.href = '/login';
                    return;
                }

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    console.error('🌐 API错误:', errorData);
                    throw new Error(errorData.message || \`HTTP \${response.status}\`);
                }

                const result = await response.json();
                console.log('🌐 API响应:', result);
                return result;
            } catch (error) {
                console.error('❌ API请求失败:', error);
                throw error;
            }
        }

        // 显示提示信息
        function showAlert(type, message) {
            const alertDiv = document.createElement('div');
            alertDiv.className = \`alert alert-\${type}\`;
            alertDiv.textContent = message;

            const container = document.querySelector('.container');
            container.insertBefore(alertDiv, container.firstChild);

            setTimeout(() => {
                alertDiv.remove();
            }, 5000);
        }

        // 显示加载状态
        function showLoading(containerId) {
            const container = document.getElementById(containerId);
            if (container) {
                container.innerHTML = \`
                    <div style="text-align: center; padding: 40px; color: #666;">
                        <div style="display: inline-block; width: 40px; height: 40px; border: 3px solid #f3f3f3; border-top: 3px solid #667eea; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                        <p style="margin-top: 15px;">加载中...</p>
                    </div>
                \`;
            }
        }

        // 加载仪表盘数据
        async function loadDashboard() {
            try {
                const response = await apiRequest('stats');
                const stats = response.stats;

                document.getElementById('totalCodes').textContent = stats.total;
                document.getElementById('undistributedCodes').textContent = stats.undistributed;
                document.getElementById('distributedCodes').textContent = stats.distributed;
                document.getElementById('totalUsers').textContent = stats.total_users;
                document.getElementById('totalLevels').textContent = stats.total_levels;
                document.getElementById('maxLevel').textContent = stats.max_level;
                document.getElementById('avgExperience').textContent = stats.avg_experience;
                document.getElementById('activeUsers').textContent = stats.active_users;
                document.getElementById('totalCheckins').textContent = stats.total_checkins;
            } catch (error) {
                console.error('Failed to load dashboard:', error);
            }
        }

        // 加载兑换码数据
        async function loadCodes(page = 1) {
            try {
                const sortBy = document.getElementById('codesSortBy')?.value || 'id';
                const sortOrder = document.getElementById('codesSortOrder')?.value || 'ASC';
                const limit = document.getElementById('codesPageSize')?.value || 10;

                const response = await apiRequest(\`codes?page=\${page}&limit=\${limit}&sortBy=\${sortBy}&sortOrder=\${sortOrder}\`);
                const tbody = document.getElementById('codesTableBody');

                if (response.codes.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #7f8c8d;">暂无数据</td></tr>';
                    updateCodesPagination(0, page, parseInt(limit));
                    return;
                }

                tbody.innerHTML = response.codes.map(code => \`
                    <tr>
                        <td>\${code.id}</td>
                        <td><code>\${code.code}</code></td>
                        <td>$\${code.amount}</td>
                        <td>
                            <span class="level-badge" style="background: \${code.is_used ? '#e74c3c' : (code.is_distributed ? '#f39c12' : '#27ae60')}">
                                \${code.is_used ? '已使用' : (code.is_distributed ? '已分配' : '未分配')}
                            </span>
                        </td>
                        <td>\${code.distributed_to_username || '-'}</td>
                        <td>\${new Date(code.created_at).toLocaleString()}</td>
                    </tr>
                \`).join('');

                // 更新分页控制
                updateCodesPagination(response.total, page, parseInt(limit));
            } catch (error) {
                console.error('Failed to load codes:', error);
                document.getElementById('codesTableBody').innerHTML = '<tr><td colspan="6" style="text-align: center; color: #e74c3c;">加载失败</td></tr>';
            }
        }

        // 加载用户数据 - 修改为10个分页并添加头像和赠送功能
        let currentUserPage = 1;
        async function loadUsers(page = 1) {
            try {
                console.log('🔍 加载用户数据，页码:', page);
                const response = await apiRequest(\`users?page=\${page}&limit=10\`);
                const tbody = document.getElementById('usersTableBody');

                if (!response.users || response.users.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #7f8c8d;">暂无数据</td></tr>';
                    return;
                }

                currentUserPage = page;
                tbody.innerHTML = response.users.map(user => \`
                    <tr>
                        <td>\${user.id}</td>
                        <td>
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <img src="\${user.avatar_url || '/default-avatar.png'}"
                                     alt="头像"
                                     style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;"
                                     onerror="this.src='/default-avatar.png'">
                                <div>
                                    <div><strong>\${user.username}</strong></div>
                                    <div style="font-size: 12px; color: #666;">
                                        Linux DO: \${user.linux_do_id || 'N/A'}
                                    </div>
                                </div>
                            </div>
                        </td>
                        <td>
                            <span class="level-badge" style="background: \${user.level_color || '#667eea'}">
                                \${user.level_icon || '🌱'} \${user.level_name || '炼气'}
                            </span>
                        </td>
                        <td>\${user.experience || 0}</td>
                        <td>\${user.consecutive_days || 0}</td>
                        <td>\${new Date(user.created_at).toLocaleDateString()}</td>
                        <td>
                            <button class="btn btn-sm btn-primary" onclick="viewUserLevel(\${user.id})">查看等级</button>
                            <button class="btn btn-sm btn-success" onclick="showGiftModal(\${user.id}, '\${user.username}')">🎁 赠送</button>
                        </td>
                    </tr>
                \`).join('');

                // 渲染分页
                const pagination = {
                    current_page: page,
                    total_pages: response.totalPages || 1,
                    total_records: response.total || 0
                };
                renderUserPagination(pagination);
            } catch (error) {
                console.error('Failed to load users:', error);
                document.getElementById('usersTableBody').innerHTML = '<tr><td colspan="7" style="text-align: center; color: #e74c3c;">加载失败</td></tr>';
            }
        }

        // 渲染用户分页
        function renderUserPagination(pagination) {
            const container = document.getElementById('userPagination') || createUserPaginationContainer();

            if (pagination.total_pages <= 1) {
                container.innerHTML = '';
                return;
            }

            let paginationHtml = '<div class="pagination">';

            // 上一页
            if (pagination.current_page > 1) {
                paginationHtml += \`<button class="btn btn-sm" onclick="loadUsers(\${pagination.current_page - 1})">上一页</button>\`;
            }

            // 页码
            for (let i = Math.max(1, pagination.current_page - 2); i <= Math.min(pagination.total_pages, pagination.current_page + 2); i++) {
                const isActive = i === pagination.current_page ? 'btn-primary' : '';
                paginationHtml += \`<button class="btn btn-sm \${isActive}" onclick="loadUsers(\${i})">\${i}</button>\`;
            }

            // 下一页
            if (pagination.current_page < pagination.total_pages) {
                paginationHtml += \`<button class="btn btn-sm" onclick="loadUsers(\${pagination.current_page + 1})">下一页</button>\`;
            }

            paginationHtml += \`<span style="margin-left: 15px; color: #666;">共 \${pagination.total_records} 条记录，第 \${pagination.current_page}/\${pagination.total_pages} 页</span>\`;
            paginationHtml += '</div>';

            container.innerHTML = paginationHtml;
        }

        // 创建用户分页容器
        function createUserPaginationContainer() {
            const container = document.createElement('div');
            container.id = 'userPagination';
            container.style.marginTop = '20px';
            container.style.textAlign = 'center';

            const usersSection = document.querySelector('#usersTableBody').closest('.table-container');
            usersSection.parentNode.insertBefore(container, usersSection.nextSibling);

            return container;
        }

        // 显示赠送模态框
        function showGiftModal(userId, username) {
            const bodyContent = \`
                <form id="giftForm">
                    <div class="form-group">
                        <label>赠送对象</label>
                        <input type="text" value="\${username}" readonly style="background: #f8f9fa;">
                    </div>
                    <div class="form-group">
                        <label>赠送类型 *</label>
                        <select id="giftType" required onchange="updateGiftFields()">
                            <option value="">请选择赠送类型</option>
                            <option value="experience">经验值</option>
                            <option value="redemption_code">兑换码</option>
                        </select>
                    </div>
                    <div id="experienceFields" style="display: none;">
                        <div class="form-group">
                            <label>经验值数量 *</label>
                            <input type="number" id="experienceAmount" min="1" max="10000" placeholder="请输入经验值数量">
                        </div>
                    </div>
                    <div id="codeFields" style="display: none;">
                        <div class="form-group">
                            <label>兑换码金额 *</label>
                            <input type="number" id="codeAmount" min="1" max="1000" step="0.01" placeholder="请输入兑换码金额">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>赠送原因</label>
                        <textarea id="giftReason" placeholder="请输入赠送原因（可选）"></textarea>
                    </div>
                </form>
            \`;

            const footerButtons = \`
                <button class="btn btn-secondary" onclick="closeLotteryModal()">取消</button>
                <button class="btn btn-primary" onclick="processGift(\${userId})">确认赠送</button>
            \`;

            showLotteryModal('🎁 赠送奖励', bodyContent, footerButtons);
        }

        // 更新赠送字段显示
        function updateGiftFields() {
            const giftType = document.getElementById('giftType').value;
            const experienceFields = document.getElementById('experienceFields');
            const codeFields = document.getElementById('codeFields');

            experienceFields.style.display = giftType === 'experience' ? 'block' : 'none';
            codeFields.style.display = giftType === 'redemption_code' ? 'block' : 'none';
        }

        // 处理赠送
        async function processGift(userId) {
            try {
                const giftType = document.getElementById('giftType').value;
                const reason = document.getElementById('giftReason').value;

                if (!giftType) {
                    showAlert('error', '请选择赠送类型');
                    return;
                }

                let giftData = {
                    user_id: userId,
                    type: giftType,
                    reason: reason || '管理员赠送'
                };

                if (giftType === 'experience') {
                    const amount = parseInt(document.getElementById('experienceAmount').value);
                    if (!amount || amount <= 0) {
                        showAlert('error', '请输入有效的经验值数量');
                        return;
                    }
                    giftData.amount = amount;
                } else if (giftType === 'redemption_code') {
                    const amount = parseFloat(document.getElementById('codeAmount').value);
                    if (!amount || amount <= 0) {
                        showAlert('error', '请输入有效的兑换码金额');
                        return;
                    }
                    giftData.amount = amount;
                }

                console.log('🎁 赠送数据:', giftData);
                const response = await apiRequest('users/gift', 'POST', giftData);

                if (response.success) {
                    showAlert('success', '赠送成功！');
                    closeLotteryModal(); // 确保模态框关闭
                    loadUsers(currentUserPage); // 刷新当前页
                } else {
                    throw new Error(response.message || '赠送失败');
                }
            } catch (error) {
                console.error('❌ 赠送失败:', error);
                showAlert('error', '赠送失败: ' + error.message);
            }
        }

        // 生成测试数据
        async function generateTestData() {
            if (!confirm('确定要生成测试数据吗？这将创建20个测试用户和相关的签到记录。')) {
                return;
            }

            try {
                showAlert('info', '正在生成测试数据，请稍候...');

                const response = await apiRequest('users/generate-test-data', 'POST');

                if (response.success) {
                    showAlert('success', \`测试数据生成成功！创建了 \${response.data.created} 个新用户，更新了 \${response.data.updated} 个现有用户\`);
                    loadUsers(1); // 刷新用户列表
                } else {
                    throw new Error(response.message || '生成测试数据失败');
                }
            } catch (error) {
                console.error('❌ 生成测试数据失败:', error);
                showAlert('error', '生成测试数据失败: ' + error.message);
            }
        }

        // 修复用户等级
        async function fixUserLevels() {
            if (!confirm('确定要修复所有用户的等级吗？这将根据用户的经验值、签到天数重新计算正确的等级。')) {
                return;
            }

            try {
                showAlert('info', '正在修复用户等级，请稍候...');

                const response = await apiRequest('users/fix-levels', 'POST');

                if (response.success) {
                    showAlert('success', \`等级修复完成！\${response.data.message}\`);
                    loadUsers(currentUserPage); // 刷新当前页
                    loadLeaderboard(); // 刷新排行榜
                } else {
                    throw new Error(response.message || '修复等级失败');
                }
            } catch (error) {
                console.error('❌ 修复等级失败:', error);
                showAlert('error', '修复等级失败: ' + error.message);
            }
        }

        // 预热缓存
        async function warmupCache() {
            try {
                showAlert('info', '正在预热缓存，请稍候...');
                console.log('🔥 开始预热缓存...');

                const startTime = Date.now();
                const response = await apiRequest('warmup-cache', 'POST');
                const duration = Date.now() - startTime;

                if (response.success) {
                    showAlert('success', \`缓存预热完成！耗时 \${duration}ms，系统性能已优化\`);
                    console.log(\`✅ 缓存预热成功，耗时: \${duration}ms\`);

                    // 显示缓存状态
                    displayCacheStatus();

                    // 预热完成后刷新页面数据，体验缓存效果
                    setTimeout(() => {
                        console.log('🔄 刷新页面数据以体验缓存效果...');
                        loadUsers(currentUserPage);
                        loadLeaderboard();
                    }, 1000);
                } else {
                    throw new Error(response.message || '缓存预热失败');
                }
            } catch (error) {
                console.error('❌ 缓存预热失败:', error);
                showAlert('error', '缓存预热失败: ' + error.message);
            }
        }

        // 显示缓存状态
        function displayCacheStatus() {
            const cacheInfo = \`
🎯 KV缓存已启用！
📊 缓存策略:
  • 等级配置: 24小时缓存
  • 排行榜: 5分钟缓存
  • 用户列表: 2分钟缓存
  • 签到记录: 1分钟缓存

⚡ 预期性能提升:
  • 页面加载: 80-90% 更快
  • API响应: 85-90% 更快
  • 数据库查询: 减少 80%
            \`;

            console.log(cacheInfo);

            // 在页面上显示缓存状态
            const statusDiv = document.createElement('div');
            statusDiv.id = 'cacheStatus';
            statusDiv.style.cssText = \`
                position: fixed; top: 10px; right: 10px;
                background: #2ecc71; color: white;
                padding: 10px; border-radius: 5px;
                font-size: 12px; z-index: 1000;
                max-width: 200px;
            \`;
            statusDiv.innerHTML = '🎯 KV缓存已启用<br>性能提升80-90%';

            document.body.appendChild(statusDiv);

            // 5秒后自动隐藏
            setTimeout(() => {
                if (document.getElementById('cacheStatus')) {
                    document.getElementById('cacheStatus').remove();
                }
            }, 5000);
        }

        // 检查KV状态
        async function checkKVStatus() {
            try {
                console.log('🔍 检查KV连接状态...');
                showAlert('info', '正在检查KV连接状态...');

                const response = await apiRequest('kv-status', 'GET');

                if (response.success) {
                    const status = response.kvStatus;

                    console.log('📊 KV状态详情:', status);

                    let statusMessage = '';
                    let alertType = '';

                    if (status.isKVAvailable && status.testResult === 'SUCCESS') {
                        statusMessage = \`✅ KV连接正常！
🔗 KV对象: \${status.kvObject ? '已绑定' : '未绑定'}
🧪 连接测试: \${status.testResult}
📅 检查时间: \${new Date(status.timestamp).toLocaleString()}
🎯 缓存功能: 完全可用\`;
                        alertType = 'success';
                    } else if (!status.kvObject) {
                        statusMessage = \`❌ KV未绑定！
🔗 KV对象: 未找到
📋 环境变量: \${status.envKeys.join(', ')}
💡 解决方案: 请检查Cloudflare Dashboard中的KV绑定设置
   - 确保KV命名空间 'SIGN_IN_CACHE' 存在
   - 确保绑定变量名为 'KV'
   - 重新部署Worker\`;
                        alertType = 'error';
                    } else {
                        statusMessage = \`⚠️ KV连接异常！
🔗 KV对象: \${status.kvObject ? '已绑定' : '未绑定'}
🧪 连接测试: \${status.testResult}
❌ 错误信息: \${status.testError || '未知错误'}
💡 建议: 检查KV权限或重新绑定\`;
                        alertType = 'warning';
                    }

                    // 显示详细状态
                    const modal = \`
                        <div style="text-align: left; white-space: pre-line; font-family: monospace; font-size: 14px;">
                            \${statusMessage}
                        </div>
                    \`;

                    showLotteryModal('🔍 KV连接状态检查', modal, \`
                        <button class="btn btn-secondary" onclick="closeLotteryModal()">关闭</button>
                        <button class="btn btn-primary" onclick="closeLotteryModal(); warmupCache()">预热缓存</button>
                    \`);

                    showAlert(alertType, status.isKVAvailable ? 'KV连接正常' : 'KV连接异常，请检查配置');
                } else {
                    throw new Error(response.message || 'KV状态检查失败');
                }
            } catch (error) {
                console.error('❌ KV状态检查失败:', error);
                showAlert('error', 'KV状态检查失败: ' + error.message);
            }
        }

        // 加载等级配置
        async function loadLevelConfigs() {
            try {
                const response = await apiRequest('level-configs');
                const tbody = document.getElementById('levelConfigsTableBody');

                if (response.data.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: #7f8c8d;">暂无数据</td></tr>';
                    return;
                }

                tbody.innerHTML = response.data.map(level => \`
                    <tr>
                        <td>
                            <span class="level-badge" style="background: \${level.level_color}">
                                \${level.level_icon} \${level.id}
                            </span>
                        </td>
                        <td>\${level.level_name}</td>
                        <td>\${level.required_experience}</td>
                        <td>\${level.required_checkin_days}</td>
                        <td>\${level.required_consecutive_days}</td>
                        <td>\${level.checkin_reward_multiplier}x</td>
                        <td>\${level.current_user_count || 0}</td>
                        <td>
                            <button class="btn btn-primary" onclick="editLevelConfig(\${level.id})">编辑</button>
                        </td>
                    </tr>
                \`).join('');
            } catch (error) {
                console.error('Failed to load level configs:', error);
            }
        }

        // 加载经验规则
        async function loadExperienceRules() {
            try {
                const response = await apiRequest('experience-rules');
                const tbody = document.getElementById('experienceRulesTableBody');

                if (response.data.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #7f8c8d;">暂无数据</td></tr>';
                    return;
                }

                tbody.innerHTML = response.data.map(rule => \`
                    <tr>
                        <td>\${rule.rule_name}</td>
                        <td>\${rule.rule_type}</td>
                        <td>\${rule.base_experience}</td>
                        <td>\${rule.usage_count || 0}</td>
                        <td>\${rule.total_experience_granted || 0}</td>
                        <td>
                            <span class="level-badge" style="background: \${rule.is_active ? '#27ae60' : '#e74c3c'}">
                                \${rule.is_active ? '启用' : '禁用'}
                            </span>
                        </td>
                        <td>
                            <button class="btn btn-primary" onclick="editExperienceRule(\${rule.id})">编辑</button>
                        </td>
                    </tr>
                \`).join('');
            } catch (error) {
                console.error('Failed to load experience rules:', error);
            }
        }

        // 加载奖励配置
        async function loadRewardConfigs() {
            // 这里可以添加奖励配置的加载逻辑
            const container = document.getElementById('rewardConfigsContainer');
            container.innerHTML = '<div style="text-align: center; color: #7f8c8d; padding: 40px;">奖励配置功能开发中...</div>';
        }



        // 加载排行榜
        async function loadLeaderboard() {
            try {
                const response = await apiRequest('leaderboard?limit=50');
                const tbody = document.getElementById('leaderboardTableBody');

                if (response.data.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #7f8c8d;">暂无数据</td></tr>';
                    return;
                }

                tbody.innerHTML = response.data.map(user => \`
                    <tr>
                        <td>
                            <span class="level-badge" style="background: \${getRankColor(user.rank)}">
                                #\${user.rank}
                            </span>
                        </td>
                        <td>
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <img src="\${user.avatar_url || '/default-avatar.png'}"
                                     alt="头像"
                                     style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;"
                                     onerror="this.src='/default-avatar.png'">
                                <div>
                                    <div><strong>\${user.username}</strong></div>
                                    <div style="font-size: 12px; color: #666;">
                                        Linux DO: \${user.linux_do_id || 'N/A'}
                                    </div>
                                </div>
                            </div>
                        </td>
                        <td>
                            <span class="level-badge" style="background: \${user.level_color || '#667eea'}">
                                \${user.level_icon || '🌱'} \${user.level_name || '炼气'}
                            </span>
                        </td>
                        <td>\${user.experience || 0}</td>
                        <td>\${user.total_checkins || 0}</td>
                        <td>\${user.consecutive_days || 0}</td>
                        <td>\${user.max_consecutive_days || 0}</td>
                    </tr>
                \`).join('');
            } catch (error) {
                console.error('Failed to load leaderboard:', error);
            }
        }

        // 工具函数

        function getRankColor(rank) {
            if (rank === 1) return '#FFD700';
            if (rank === 2) return '#C0C0C0';
            if (rank === 3) return '#CD7F32';
            if (rank <= 10) return '#667eea';
            return '#7f8c8d';
        }

        // 更新兑换码分页控制
        function updateCodesPagination(total, currentPage, pageSize) {
            const totalPages = Math.ceil(total / pageSize);
            const paginationDiv = document.getElementById('codesPagination');

            if (totalPages <= 1) {
                paginationDiv.innerHTML = '';
                return;
            }

            let paginationHTML = \`
                <div style="display: flex; justify-content: center; align-items: center; gap: 10px;">
                    <span>共 \${total} 条记录，第 \${currentPage} / \${totalPages} 页</span>
                    <div style="display: flex; gap: 5px;">
            \`;

            // 首页和上一页
            if (currentPage > 1) {
                paginationHTML += \`
                    <button class="btn btn-sm" onclick="loadCodes(1)">首页</button>
                    <button class="btn btn-sm" onclick="loadCodes(\${currentPage - 1})">上一页</button>
                \`;
            }

            // 页码按钮
            const startPage = Math.max(1, currentPage - 2);
            const endPage = Math.min(totalPages, currentPage + 2);

            for (let i = startPage; i <= endPage; i++) {
                const isActive = i === currentPage ? 'btn-primary' : '';
                paginationHTML += \`<button class="btn btn-sm \${isActive}" onclick="loadCodes(\${i})">\${i}</button>\`;
            }

            // 下一页和末页
            if (currentPage < totalPages) {
                paginationHTML += \`
                    <button class="btn btn-sm" onclick="loadCodes(\${currentPage + 1})">下一页</button>
                    <button class="btn btn-sm" onclick="loadCodes(\${totalPages})">末页</button>
                \`;
            }

            paginationHTML += '</div></div>';
            paginationDiv.innerHTML = paginationHTML;
        }

        // 刷新函数
        function refreshCodes() { loadCodes(1); }
        function refreshUsers() { loadUsers(); }
        function refreshLevelConfigs() { loadLevelConfigs(); }
        function refreshExperienceRules() { loadExperienceRules(); }
        function refreshRewardConfigs() { loadRewardConfigs(); }

        // ============================================
        // 抽奖管理相关函数
        // ============================================

        // 显示抽奖管理子页面
        function showLotterySection(section) {
            // 隐藏所有子页面
            document.querySelectorAll('.lottery-section').forEach(el => el.style.display = 'none');
            // 移除所有导航按钮的active状态
            document.querySelectorAll('.lottery-nav-btn').forEach(btn => btn.classList.remove('active'));

            // 显示选中的子页面
            document.getElementById('lottery' + section.charAt(0).toUpperCase() + section.slice(1)).style.display = 'block';
            // 添加active状态到对应按钮
            event.target.classList.add('active');

            // 加载对应数据
            switch(section) {
                case 'prizes':
                    loadPrizes();
                    break;
                case 'wheels':
                    loadWheels();
                    break;
                case 'stats':
                    loadLotteryStats();
                    break;
                case 'config':
                    loadLotteryConfig();
                    break;
            }
        }

        // 加载奖品池数据
        async function loadPrizes() {
            try {
                const type = document.getElementById('prizeTypeFilter')?.value || 'all';
                const rarity = document.getElementById('prizeRarityFilter')?.value || 'all';

                const response = await apiRequest(\`lottery/admin/prizes?type=\${type}&rarity=\${rarity}&limit=100\`);
                const tbody = document.getElementById('prizesTableBody');

                if (!response.data.prizes || response.data.prizes.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: #7f8c8d;">暂无奖品数据</td></tr>';
                    return;
                }

                tbody.innerHTML = response.data.prizes.map(prize => \`
                    <tr>
                        <td>\${prize.id}</td>
                        <td>
                            <span style="margin-right: 5px;">\${prize.prize_icon || '🎁'}</span>
                            \${prize.prize_name}
                        </td>
                        <td>\${getPrizeTypeText(prize.prize_type)}</td>
                        <td>\${prize.prize_value}\${prize.prize_type === 'redemption_code' ? '元' : (prize.prize_type === 'experience' ? '经验' : '')}</td>
                        <td>
                            <span class="level-badge" style="background: \${getRarityColor(prize.prize_rarity)}">
                                \${getRarityText(prize.prize_rarity)}
                            </span>
                        </td>
                        <td>\${prize.min_user_level}-\${prize.max_user_level}级</td>
                        <td>
                            <span class="level-badge" style="background: \${prize.is_active ? '#27ae60' : '#e74c3c'}">
                                \${prize.is_active ? '启用' : '禁用'}
                            </span>
                        </td>
                        <td>
                            <button class="btn btn-sm" onclick="editPrize(\${prize.id})">编辑</button>
                            <button class="btn btn-sm btn-danger" onclick="deletePrize(\${prize.id})">删除</button>
                        </td>
                    </tr>
                \`).join('');
            } catch (error) {
                console.error('Failed to load prizes:', error);
                document.getElementById('prizesTableBody').innerHTML = '<tr><td colspan="8" style="text-align: center; color: #e74c3c;">加载失败</td></tr>';
            }
        }

        // 加载转盘配置数据
        async function loadWheels() {
            try {
                const level = document.getElementById('wheelLevelFilter')?.value || 'all';

                const response = await apiRequest(\`lottery/admin/wheels?level=\${level}\`);
                const tbody = document.getElementById('wheelsTableBody');

                if (!response.data.wheels || response.data.wheels.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #7f8c8d;">暂无转盘配置</td></tr>';
                    return;
                }

                tbody.innerHTML = response.data.wheels.map(wheel => \`
                    <tr>
                        <td>\${wheel.id}</td>
                        <td>\${wheel.config_name}</td>
                        <td>\${wheel.level_name || '等级' + wheel.target_user_level}</td>
                        <td>\${wheel.max_daily_spins}次</td>
                        <td>\${wheel.pity_threshold}次</td>
                        <td>
                            <span class="level-badge" style="background: \${wheel.is_active ? '#27ae60' : '#e74c3c'}">
                                \${wheel.is_active ? '启用' : '禁用'}
                            </span>
                        </td>
                        <td>
                            <button class="btn btn-sm" onclick="editWheel(\${wheel.id})">编辑</button>
                            <button class="btn btn-sm" onclick="configWheelItems(\${wheel.id})">配置物品</button>
                            <button class="btn btn-sm btn-danger" onclick="deleteWheel(\${wheel.id})">删除</button>
                        </td>
                    </tr>
                \`).join('');
            } catch (error) {
                console.error('Failed to load wheels:', error);
                document.getElementById('wheelsTableBody').innerHTML = '<tr><td colspan="7" style="text-align: center; color: #e74c3c;">加载失败</td></tr>';
            }
        }

        // 加载抽奖统计数据
        async function loadLotteryStats() {
            try {
                // 加载系统统计
                const systemResponse = await apiRequest('lottery/admin/stats/system');
                const systemStats = systemResponse.data.system_stats;

                document.getElementById('systemStats').innerHTML = \`
                    <p>总用户数: <strong>\${systemStats.total_users || 0}</strong></p>
                    <p>总抽奖次数: <strong>\${systemStats.total_spins || 0}</strong></p>
                    <p>成功发放率: <strong>\${systemStats.total_spins > 0 ? ((systemStats.successful_deliveries / systemStats.total_spins) * 100).toFixed(1) : 0}%</strong></p>
                    <p>活跃天数: <strong>\${systemStats.active_days || 0}</strong></p>
                \`;

                // 加载奖品分布
                const prizeDistribution = systemResponse.data.prize_distribution || [];
                document.getElementById('prizeDistribution').innerHTML = prizeDistribution.map(item => \`
                    <p>\${getRarityText(item.prize_rarity)}: <strong>\${item.count}</strong>次 (价值\${item.total_value || 0})</p>
                \`).join('') || '<p>暂无数据</p>';

                // 加载用户活跃度
                const userResponse = await apiRequest('lottery/admin/stats/users?date_from=' + getDateDaysAgo(7));
                const userStats = userResponse.data.user_stats || [];

                document.getElementById('userActivity').innerHTML = \`
                    <p>活跃用户: <strong>\${userStats.length}</strong></p>
                    <p>平均抽奖: <strong>\${userStats.length > 0 ? (userStats.reduce((sum, u) => sum + u.total_spins, 0) / userStats.length).toFixed(1) : 0}</strong>次</p>
                    <p>最高抽奖: <strong>\${userStats.length > 0 ? Math.max(...userStats.map(u => u.total_spins)) : 0}</strong>次</p>
                \`;

            } catch (error) {
                console.error('Failed to load lottery stats:', error);
                document.getElementById('systemStats').innerHTML = '<p style="color: #e74c3c;">加载失败</p>';
                document.getElementById('prizeDistribution').innerHTML = '<p style="color: #e74c3c;">加载失败</p>';
                document.getElementById('userActivity').innerHTML = '<p style="color: #e74c3c;">加载失败</p>';
            }
        }

        // 加载系统配置
        async function loadLotteryConfig() {
            try {
                const response = await apiRequest('lottery/admin/config');
                const configs = response.data.configs || [];

                const basicConfigs = configs.filter(c => ['system_enabled', 'max_daily_spins_global', 'pity_system_enabled'].includes(c.config_key));
                const advancedConfigs = configs.filter(c => !['system_enabled', 'max_daily_spins_global', 'pity_system_enabled'].includes(c.config_key));

                document.getElementById('basicConfig').innerHTML = basicConfigs.map(config => \`
                    <div class="form-group">
                        <label>\${config.config_description || config.config_key}:</label>
                        \${renderConfigInput(config)}
                    </div>
                \`).join('');

                document.getElementById('advancedConfig').innerHTML = advancedConfigs.map(config => \`
                    <div class="form-group">
                        <label>\${config.config_description || config.config_key}:</label>
                        \${renderConfigInput(config)}
                    </div>
                \`).join('');

            } catch (error) {
                console.error('Failed to load lottery config:', error);
                document.getElementById('basicConfig').innerHTML = '<p style="color: #e74c3c;">加载失败</p>';
                document.getElementById('advancedConfig').innerHTML = '<p style="color: #e74c3c;">加载失败</p>';
            }
        }

        // 辅助函数
        function getPrizeTypeText(type) {
            const types = {
                'redemption_code': '兑换码',
                'experience': '经验值',
                'signin_effect': '签到效果'
            };
            return types[type] || type;
        }

        function getRarityText(rarity) {
            const rarities = {
                'common': '普通',
                'rare': '稀有',
                'epic': '史诗',
                'legendary': '传说'
            };
            return rarities[rarity] || rarity;
        }

        function getRarityColor(rarity) {
            const colors = {
                'common': '#95a5a6',
                'rare': '#3498db',
                'epic': '#9b59b6',
                'legendary': '#f39c12'
            };
            return colors[rarity] || '#95a5a6';
        }

        function renderConfigInput(config) {
            if (config.config_type === 'boolean') {
                return \`
                    <select data-config-key="\${config.config_key}" class="config-input">
                        <option value="true" \${config.config_value === 'true' ? 'selected' : ''}>启用</option>
                        <option value="false" \${config.config_value === 'false' ? 'selected' : ''}>禁用</option>
                    </select>
                \`;
            } else if (config.config_type === 'integer') {
                return \`<input type="number" data-config-key="\${config.config_key}" class="config-input" value="\${config.config_value}" \${config.is_editable ? '' : 'readonly'}>\`;
            } else if (config.config_type === 'float') {
                return \`<input type="number" step="0.1" data-config-key="\${config.config_key}" class="config-input" value="\${config.config_value}" \${config.is_editable ? '' : 'readonly'}>\`;
            } else {
                return \`<input type="text" data-config-key="\${config.config_key}" class="config-input" value="\${config.config_value}" \${config.is_editable ? '' : 'readonly'}>\`;
            }
        }

        function getDateDaysAgo(days) {
            const date = new Date();
            date.setDate(date.getDate() - days);
            return date.toISOString().split('T')[0];
        }

        // 抽奖管理操作函数
        function refreshPrizes() { loadPrizes(); }
        function refreshWheels() { loadWheels(); }
        function refreshLotteryStats() { loadLotteryStats(); }
        function refreshLotteryConfig() { loadLotteryConfig(); }

        async function toggleLotterySystem() {
            try {
                const currentConfigs = await apiRequest('lottery/admin/config');
                const systemEnabled = currentConfigs.data.configs.find(c => c.config_key === 'system_enabled');
                const newValue = systemEnabled.config_value === 'true' ? 'false' : 'true';

                await apiRequest('lottery/admin/config', 'PUT', {
                    configs: [{
                        config_key: 'system_enabled',
                        config_value: newValue,
                        is_editable: true
                    }]
                });

                document.getElementById('lotteryStatus').innerHTML = newValue === 'true' ? '🟢 系统正常' : '🔴 系统关闭';
                showAlert('success', '抽奖系统状态已更新');
            } catch (error) {
                showAlert('error', '更新系统状态失败: ' + error.message);
            }
        }

        async function saveLotteryConfig() {
            try {
                const configInputs = document.querySelectorAll('.config-input');
                const configs = Array.from(configInputs).map(input => ({
                    config_key: input.dataset.configKey,
                    config_value: input.value,
                    is_editable: true
                }));

                await apiRequest('lottery/admin/config', 'PUT', { configs });
                showAlert('success', '配置保存成功');
            } catch (error) {
                showAlert('error', '保存配置失败: ' + error.message);
            }
        }

        // ============================================
        // 抽奖管理模态框功能
        // ============================================

        function showLotteryModal(title, bodyContent, footerButtons) {
            document.getElementById('lotteryModalTitle').textContent = title;
            document.getElementById('lotteryModalBody').innerHTML = bodyContent;
            document.getElementById('lotteryModalFooter').innerHTML = footerButtons;
            document.getElementById('lotteryModal').style.display = 'block';
        }

        function closeLotteryModal() {
            document.getElementById('lotteryModal').style.display = 'none';
        }

        // 点击模态框外部关闭
        window.onclick = function(event) {
            const lotteryModal = document.getElementById('lotteryModal');
            if (event.target === lotteryModal) {
                closeLotteryModal();
            }
        }

        // ============================================
        // 奖品管理功能
        // ============================================

        function showCreatePrizeModal() {
            const bodyContent = \`
                <form id="createPrizeForm">
                    <div class="form-group">
                        <label>奖品名称 *</label>
                        <input type="text" id="prizeName" required placeholder="请输入奖品名称">
                    </div>
                    <div class="form-group">
                        <label>奖品描述</label>
                        <textarea id="prizeDescription" placeholder="请输入奖品描述"></textarea>
                    </div>
                    <div class="form-group">
                        <label>奖品类型 *</label>
                        <select id="prizeType" required onchange="updatePrizeTypeFields()">
                            <option value="">请选择奖品类型</option>
                            <option value="redemption_code">兑换码</option>
                            <option value="experience">经验值</option>
                            <option value="signin_effect">签到效果</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>奖品数值 *</label>
                        <input type="number" id="prizeValue" required placeholder="请输入奖品数值" step="0.1">
                        <small id="prizeValueHint" class="form-hint"></small>
                    </div>
                    <div class="form-group">
                        <label>稀有度 *</label>
                        <select id="prizeRarity" required>
                            <option value="">请选择稀有度</option>
                            <option value="common">普通</option>
                            <option value="rare">稀有</option>
                            <option value="epic">史诗</option>
                            <option value="legendary">传说</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>奖品图标</label>
                        <input type="text" id="prizeIcon" placeholder="请输入emoji图标" maxlength="2">
                    </div>
                    <div class="form-group">
                        <label>奖品颜色</label>
                        <input type="color" id="prizeColor" value="#3498db">
                    </div>
                    <div id="effectFields" style="display: none;">
                        <div class="form-group">
                            <label>效果持续时间（小时）</label>
                            <input type="number" id="effectDuration" placeholder="0表示永久" min="0">
                        </div>
                        <div class="form-group">
                            <label>效果倍数</label>
                            <input type="number" id="effectMultiplier" placeholder="1.0" step="0.1" min="0.1">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>等级要求</label>
                        <div style="display: flex; gap: 10px; align-items: center;">
                            <input type="number" id="minUserLevel" placeholder="最低等级" min="1" max="13" value="1">
                            <span>到</span>
                            <input type="number" id="maxUserLevel" placeholder="最高等级" min="1" max="13" value="13">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="isPunishment"> 这是惩罚类奖品
                        </label>
                    </div>
                </form>
            \`;

            const footerButtons = \`
                <button class="btn btn-secondary" onclick="closeLotteryModal()">取消</button>
                <button class="btn btn-primary" onclick="createPrize()">创建奖品</button>
            \`;

            showLotteryModal('创建奖品', bodyContent, footerButtons);
        }

        function updatePrizeTypeFields() {
            const prizeType = document.getElementById('prizeType').value;
            const effectFields = document.getElementById('effectFields');
            const prizeValueHint = document.getElementById('prizeValueHint');

            if (prizeType === 'signin_effect') {
                effectFields.style.display = 'block';
                prizeValueHint.textContent = '签到效果类型通常设为0';
            } else {
                effectFields.style.display = 'none';
                if (prizeType === 'redemption_code') {
                    prizeValueHint.textContent = '兑换码金额（元）';
                } else if (prizeType === 'experience') {
                    prizeValueHint.textContent = '经验值数量（可为负数表示惩罚）';
                } else {
                    prizeValueHint.textContent = '';
                }
            }
        }

        async function createPrize() {
            try {
                const formData = {
                    prize_name: document.getElementById('prizeName').value,
                    prize_description: document.getElementById('prizeDescription').value,
                    prize_type: document.getElementById('prizeType').value,
                    prize_value: parseFloat(document.getElementById('prizeValue').value),
                    prize_rarity: document.getElementById('prizeRarity').value,
                    prize_icon: document.getElementById('prizeIcon').value || '🎁',
                    prize_color: document.getElementById('prizeColor').value,
                    effect_duration: parseInt(document.getElementById('effectDuration')?.value) || 0,
                    effect_multiplier: parseFloat(document.getElementById('effectMultiplier')?.value) || 1.0,
                    is_punishment: document.getElementById('isPunishment').checked,
                    min_user_level: parseInt(document.getElementById('minUserLevel').value) || 1,
                    max_user_level: parseInt(document.getElementById('maxUserLevel').value) || 13
                };

                // 验证必填字段
                if (!formData.prize_name || !formData.prize_type || formData.prize_value === undefined || !formData.prize_rarity) {
                    showAlert('error', '请填写所有必填字段');
                    return;
                }

                const response = await apiRequest('lottery/admin/prizes', 'POST', formData);
                showAlert('success', '奖品创建成功');
                closeLotteryModal();
                loadPrizes();
            } catch (error) {
                showAlert('error', '创建奖品失败: ' + error.message);
            }
        }

        async function editPrize(prizeId) {
            try {
                // 获取奖品详情
                const response = await apiRequest(\`lottery/admin/prizes?limit=1000\`);
                const prize = response.data.prizes.find(p => p.id === prizeId);

                if (!prize) {
                    showAlert('error', '奖品不存在');
                    return;
                }

                const bodyContent = \`
                    <form id="editPrizeForm">
                        <div class="form-group">
                            <label>奖品名称 *</label>
                            <input type="text" id="editPrizeName" required value="\${prize.prize_name}">
                        </div>
                        <div class="form-group">
                            <label>奖品描述</label>
                            <textarea id="editPrizeDescription">\${prize.prize_description || ''}</textarea>
                        </div>
                        <div class="form-group">
                            <label>奖品类型 *</label>
                            <select id="editPrizeType" required onchange="updateEditPrizeTypeFields()">
                                <option value="redemption_code" \${prize.prize_type === 'redemption_code' ? 'selected' : ''}>兑换码</option>
                                <option value="experience" \${prize.prize_type === 'experience' ? 'selected' : ''}>经验值</option>
                                <option value="signin_effect" \${prize.prize_type === 'signin_effect' ? 'selected' : ''}>签到效果</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>奖品数值 *</label>
                            <input type="number" id="editPrizeValue" required value="\${prize.prize_value}" step="0.1">
                        </div>
                        <div class="form-group">
                            <label>稀有度 *</label>
                            <select id="editPrizeRarity" required>
                                <option value="common" \${prize.prize_rarity === 'common' ? 'selected' : ''}>普通</option>
                                <option value="rare" \${prize.prize_rarity === 'rare' ? 'selected' : ''}>稀有</option>
                                <option value="epic" \${prize.prize_rarity === 'epic' ? 'selected' : ''}>史诗</option>
                                <option value="legendary" \${prize.prize_rarity === 'legendary' ? 'selected' : ''}>传说</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>奖品图标</label>
                            <input type="text" id="editPrizeIcon" value="\${prize.prize_icon || ''}" maxlength="2">
                        </div>
                        <div class="form-group">
                            <label>奖品颜色</label>
                            <input type="color" id="editPrizeColor" value="\${prize.prize_color || '#3498db'}">
                        </div>
                        <div id="editEffectFields" style="display: \${prize.prize_type === 'signin_effect' ? 'block' : 'none'};">
                            <div class="form-group">
                                <label>效果持续时间（小时）</label>
                                <input type="number" id="editEffectDuration" value="\${prize.effect_duration || 0}" min="0">
                            </div>
                            <div class="form-group">
                                <label>效果倍数</label>
                                <input type="number" id="editEffectMultiplier" value="\${prize.effect_multiplier || 1.0}" step="0.1" min="0.1">
                            </div>
                        </div>
                        <div class="form-group">
                            <label>等级要求</label>
                            <div style="display: flex; gap: 10px; align-items: center;">
                                <input type="number" id="editMinUserLevel" value="\${prize.min_user_level || 1}" min="1" max="13">
                                <span>到</span>
                                <input type="number" id="editMaxUserLevel" value="\${prize.max_user_level || 13}" min="1" max="13">
                            </div>
                        </div>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="editIsPunishment" \${prize.is_punishment ? 'checked' : ''}> 这是惩罚类奖品
                            </label>
                        </div>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="editIsActive" \${prize.is_active ? 'checked' : ''}> 启用此奖品
                            </label>
                        </div>
                    </form>
                \`;

                const footerButtons = \`
                    <button class="btn btn-secondary" onclick="closeLotteryModal()">取消</button>
                    <button class="btn btn-primary" onclick="updatePrize(\${prizeId})">保存修改</button>
                \`;

                showLotteryModal('编辑奖品', bodyContent, footerButtons);
            } catch (error) {
                showAlert('error', '获取奖品信息失败: ' + error.message);
            }
        }

        function updateEditPrizeTypeFields() {
            const prizeType = document.getElementById('editPrizeType').value;
            const effectFields = document.getElementById('editEffectFields');

            if (prizeType === 'signin_effect') {
                effectFields.style.display = 'block';
            } else {
                effectFields.style.display = 'none';
            }
        }

        async function updatePrize(prizeId) {
            try {
                const formData = {
                    prize_name: document.getElementById('editPrizeName').value,
                    prize_description: document.getElementById('editPrizeDescription').value,
                    prize_type: document.getElementById('editPrizeType').value,
                    prize_value: parseFloat(document.getElementById('editPrizeValue').value),
                    prize_rarity: document.getElementById('editPrizeRarity').value,
                    prize_icon: document.getElementById('editPrizeIcon').value,
                    prize_color: document.getElementById('editPrizeColor').value,
                    effect_duration: parseInt(document.getElementById('editEffectDuration')?.value) || 0,
                    effect_multiplier: parseFloat(document.getElementById('editEffectMultiplier')?.value) || 1.0,
                    is_punishment: document.getElementById('editIsPunishment').checked,
                    min_user_level: parseInt(document.getElementById('editMinUserLevel').value) || 1,
                    max_user_level: parseInt(document.getElementById('editMaxUserLevel').value) || 13,
                    is_active: document.getElementById('editIsActive').checked
                };

                const response = await apiRequest(\`lottery/admin/prizes/\${prizeId}\`, 'PUT', formData);
                showAlert('success', '奖品更新成功');
                closeLotteryModal();
                loadPrizes();
            } catch (error) {
                showAlert('error', '更新奖品失败: ' + error.message);
            }
        }

        async function deletePrize(prizeId) {
            if (!confirm('确定要删除这个奖品吗？此操作不可撤销。')) {
                return;
            }

            try {
                await apiRequest(\`lottery/admin/prizes/\${prizeId}\`, 'DELETE');
                showAlert('success', '奖品删除成功');
                loadPrizes();
            } catch (error) {
                showAlert('error', '删除奖品失败: ' + error.message);
            }
        }

        // ============================================
        // 转盘管理功能
        // ============================================

        function showCreateWheelModal() {
            const bodyContent = \`
                <form id="createWheelForm">
                    <div class="form-group">
                        <label>转盘名称 *</label>
                        <input type="text" id="wheelConfigName" required placeholder="请输入转盘名称">
                    </div>
                    <div class="form-group">
                        <label>目标用户等级 *</label>
                        <select id="wheelTargetLevel" required>
                            <option value="">请选择等级</option>
                            <option value="1">炼气境 (1级)</option>
                            <option value="2">筑基境 (2级)</option>
                            <option value="3">结丹境 (3级)</option>
                            <option value="4">元婴境 (4级)</option>
                            <option value="5">化神境 (5级)</option>
                            <option value="6">炼虚境 (6级)</option>
                            <option value="7">合体境 (7级)</option>
                            <option value="8">大乘境 (8级)</option>
                            <option value="9">真仙境 (9级)</option>
                            <option value="10">金仙境 (10级)</option>
                            <option value="11">太乙境 (11级)</option>
                            <option value="12">大罗境 (12级)</option>
                            <option value="13">道祖境 (13级)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>每日最大抽奖次数</label>
                        <input type="number" id="wheelMaxDailySpins" value="3" min="1" max="20">
                    </div>
                    <div class="form-group">
                        <label>保底触发次数</label>
                        <input type="number" id="wheelPityThreshold" value="10" min="3" max="50">
                    </div>
                    <div class="form-group">
                        <label>保底奖品</label>
                        <select id="wheelPityPrize">
                            <option value="">请选择保底奖品</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>转盘描述</label>
                        <textarea id="wheelDescription" placeholder="请输入转盘描述"></textarea>
                    </div>
                    <div class="form-group">
                        <label>活动时间</label>
                        <div style="display: flex; gap: 10px; align-items: center;">
                            <input type="datetime-local" id="wheelStartTime" placeholder="开始时间">
                            <span>到</span>
                            <input type="datetime-local" id="wheelEndTime" placeholder="结束时间">
                        </div>
                        <small class="form-hint">留空表示永久有效</small>
                    </div>
                </form>
            \`;

            const footerButtons = \`
                <button class="btn btn-secondary" onclick="closeLotteryModal()">取消</button>
                <button class="btn btn-primary" onclick="createWheel()">创建转盘</button>
            \`;

            showLotteryModal('创建转盘配置', bodyContent, footerButtons);

            // 加载保底奖品选项
            loadPityPrizeOptions();
        }

        async function loadPityPrizeOptions() {
            try {
                const response = await apiRequest('lottery/admin/prizes?rarity=epic&limit=100');
                const select = document.getElementById('wheelPityPrize');

                if (response.data.prizes) {
                    response.data.prizes.forEach(prize => {
                        if (['epic', 'legendary'].includes(prize.prize_rarity)) {
                            const option = document.createElement('option');
                            option.value = prize.id;
                            option.textContent = \`\${prize.prize_icon || '🎁'} \${prize.prize_name} (\${getRarityText(prize.prize_rarity)})\`;
                            select.appendChild(option);
                        }
                    });
                }
            } catch (error) {
                console.error('Failed to load pity prize options:', error);
            }
        }

        async function createWheel() {
            try {
                const formData = {
                    config_name: document.getElementById('wheelConfigName').value,
                    target_user_level: parseInt(document.getElementById('wheelTargetLevel').value),
                    max_daily_spins: parseInt(document.getElementById('wheelMaxDailySpins').value) || 3,
                    pity_threshold: parseInt(document.getElementById('wheelPityThreshold').value) || 10,
                    pity_prize_id: parseInt(document.getElementById('wheelPityPrize').value) || null,
                    description: document.getElementById('wheelDescription').value,
                    active_start_time: document.getElementById('wheelStartTime').value || null,
                    active_end_time: document.getElementById('wheelEndTime').value || null
                };

                if (!formData.config_name || !formData.target_user_level) {
                    showAlert('error', '请填写转盘名称和目标等级');
                    return;
                }

                const response = await apiRequest('lottery/admin/wheels', 'POST', formData);
                showAlert('success', '转盘配置创建成功');
                closeLotteryModal();
                loadWheels();
            } catch (error) {
                showAlert('error', '创建转盘配置失败: ' + error.message);
            }
        }

        async function editWheel(wheelId) {
            try {
                const response = await apiRequest('lottery/admin/wheels');
                const wheel = response.data.wheels.find(w => w.id === wheelId);

                if (!wheel) {
                    showAlert('error', '转盘配置不存在');
                    return;
                }

                const bodyContent = \`
                    <form id="editWheelForm">
                        <div class="form-group">
                            <label>转盘名称 *</label>
                            <input type="text" id="editWheelConfigName" required value="\${wheel.config_name}">
                        </div>
                        <div class="form-group">
                            <label>目标用户等级</label>
                            <input type="text" value="\${wheel.level_name || '等级' + wheel.target_user_level}" readonly>
                            <small class="form-hint">等级不可修改</small>
                        </div>
                        <div class="form-group">
                            <label>每日最大抽奖次数</label>
                            <input type="number" id="editWheelMaxDailySpins" value="\${wheel.max_daily_spins}" min="1" max="20">
                        </div>
                        <div class="form-group">
                            <label>保底触发次数</label>
                            <input type="number" id="editWheelPityThreshold" value="\${wheel.pity_threshold}" min="3" max="50">
                        </div>
                        <div class="form-group">
                            <label>转盘描述</label>
                            <textarea id="editWheelDescription">\${wheel.description || ''}</textarea>
                        </div>
                        <div class="form-group">
                            <label>活动时间</label>
                            <div style="display: flex; gap: 10px; align-items: center;">
                                <input type="datetime-local" id="editWheelStartTime" value="\${wheel.active_start_time ? wheel.active_start_time.slice(0, 16) : ''}">
                                <span>到</span>
                                <input type="datetime-local" id="editWheelEndTime" value="\${wheel.active_end_time ? wheel.active_end_time.slice(0, 16) : ''}">
                            </div>
                        </div>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="editWheelIsActive" \${wheel.is_active ? 'checked' : ''}> 启用此转盘
                            </label>
                        </div>
                    </form>
                \`;

                const footerButtons = \`
                    <button class="btn btn-secondary" onclick="closeLotteryModal()">取消</button>
                    <button class="btn btn-primary" onclick="updateWheel(\${wheelId})">保存修改</button>
                \`;

                showLotteryModal('编辑转盘配置', bodyContent, footerButtons);
            } catch (error) {
                showAlert('error', '获取转盘信息失败: ' + error.message);
            }
        }

        async function updateWheel(wheelId) {
            try {
                const formData = {
                    config_name: document.getElementById('editWheelConfigName').value,
                    max_daily_spins: parseInt(document.getElementById('editWheelMaxDailySpins').value),
                    pity_threshold: parseInt(document.getElementById('editWheelPityThreshold').value),
                    description: document.getElementById('editWheelDescription').value,
                    active_start_time: document.getElementById('editWheelStartTime').value || null,
                    active_end_time: document.getElementById('editWheelEndTime').value || null,
                    is_active: document.getElementById('editWheelIsActive').checked
                };

                await apiRequest(\`lottery/admin/wheels/\${wheelId}\`, 'PUT', formData);
                showAlert('success', '转盘配置更新成功');
                closeLotteryModal();
                loadWheels();
            } catch (error) {
                showAlert('error', '更新转盘配置失败: ' + error.message);
            }
        }

        async function deleteWheel(wheelId) {
            if (!confirm('确定要删除这个转盘配置吗？此操作不可撤销。')) {
                return;
            }

            try {
                await apiRequest(\`lottery/admin/wheels/\${wheelId}\`, 'DELETE');
                showAlert('success', '转盘配置删除成功');
                loadWheels();
            } catch (error) {
                showAlert('error', '删除转盘配置失败: ' + error.message);
            }
        }

        async function configWheelItems(wheelId) {
            try {
                // 并行拉取：转盘配置与物品 + 奖品池，减少等待时间
                const [configResponse, prizesResponse] = await Promise.all([
                    apiRequest(\`lottery/wheels/\${wheelId}/config\`),
                    apiRequest('lottery/admin/prizes?limit=1000')
                ]);

                const wheel = configResponse.data.wheel_config;
                const allPrizes = prizesResponse.data.prizes || [];

                // 统一结构，补齐 prize_id，避免保存时被误判"未选择奖品"
                const currentItems = (configResponse.data.wheel_items || []).map((item, idx) => ({
                    prize_id: (item.prize && item.prize.id) ? item.prize.id : (item.prize_id || null),
                    probability: parseInt(item.probability) || 0,
                    position_index: (typeof item.position_index === 'number') ? item.position_index : (parseInt(item.position_index) || idx),
                    is_pity_item: !!item.is_pity_item,
                    prize: item.prize || null
                }));

                const bodyContent = \`
                    <div style="margin-bottom: 20px;">
                        <h4>\${wheel.config_name} - 物品配置</h4>
                        <p>目标等级: \${wheel.level_name || ('等级' + wheel.target_user_level)}</p>
                        <p>保底次数: \${wheel.pity_threshold}次</p>
                    </div>

                    <div id="wheelItemsConfig">
                        <div style="margin-bottom: 15px;">
                            <button type="button" class="btn btn-sm btn-success" onclick="addWheelItem()">添加物品</button>
                            <button type="button" class="btn btn-sm btn-info" onclick="validateProbabilities()">验证概率</button>
                            <span id="probabilitySum" style="margin-left: 15px; font-weight: bold;"></span>
                        </div>

                        <div id="wheelItemsList"></div>
                    </div>
                \`;

                const footerButtons = \`
                    <button class="btn btn-secondary" onclick="closeLotteryModal()">取消</button>
                    <button class="btn btn-primary" onclick="saveWheelItems(\${wheelId})">保存配置</button>
                \`;

                showLotteryModal('配置转盘物品', bodyContent, footerButtons);

                // 初始化全局数据
                window.currentWheelItems = currentItems;
                window.availablePrizes = allPrizes;
                window.wheelItemCounter = currentItems.length;

                renderWheelItems();
                validateProbabilities();

            } catch (error) {
                showAlert('error', '获取转盘配置失败: ' + error.message);
            }
        }

        function renderWheelItems() {
            const container = document.getElementById('wheelItemsList');

            if (window.currentWheelItems.length === 0) {
                container.innerHTML = '<p style="text-align: center; color: #7f8c8d;">暂无物品配置，请添加物品</p>';
                return;
            }

            container.innerHTML = window.currentWheelItems.map((item, index) => {
                const prize = window.availablePrizes.find(p => p.id === (item.prize_id || item.prize?.id));
                return \`
                    <div class="wheel-item-row" style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">
                        <div style="flex: 1;">
                            <label>位置 \${index}</label>
                            <select onchange="updateWheelItemPrize(\${index}, this.value)" style="width: 100%;">
                                <option value="">选择奖品</option>
                                \${window.availablePrizes.map(p => \`
                                    <option value="\${p.id}" \${(item.prize_id || item.prize?.id) === p.id ? 'selected' : ''}>
                                        \${p.prize_icon || '🎁'} \${p.prize_name} (\${getRarityText(p.prize_rarity)})
                                    </option>
                                \`).join('')}
                            </select>
                        </div>
                        <div style="width: 100px;">
                            <label>概率(%)</label>
                            <input type="number" min="1" max="99" value="\${item.probability || 10}"
                                   onchange="updateWheelItemProbability(\${index}, this.value)" style="width: 100%;">
                        </div>
                        <div style="width: 80px;">
                            <label>保底</label>
                            <input type="checkbox" \${item.is_pity_item ? 'checked' : ''}
                                   onchange="updateWheelItemPity(\${index}, this.checked)">
                        </div>
                        <div style="width: 60px;">
                            <button type="button" class="btn btn-sm btn-danger" onclick="removeWheelItem(\${index})">删除</button>
                        </div>
                    </div>
                \`;
            }).join('');
        }

        function addWheelItem() {
            if (window.currentWheelItems.length >= 10) {
                showAlert('error', '每个转盘最多只能配置10个物品');
                return;
            }

            window.currentWheelItems.push({
                prize_id: null,
                probability: 10,
                position_index: window.currentWheelItems.length,
                is_pity_item: false
            });

            renderWheelItems();
            validateProbabilities();
        }

        function removeWheelItem(index) {
            window.currentWheelItems.splice(index, 1);
            // 重新设置位置索引
            window.currentWheelItems.forEach((item, i) => {
                item.position_index = i;
            });
            renderWheelItems();
            validateProbabilities();
        }

        function updateWheelItemPrize(index, prizeId) {
            window.currentWheelItems[index].prize_id = parseInt(prizeId) || null;
        }

        function updateWheelItemProbability(index, probability) {
            window.currentWheelItems[index].probability = parseInt(probability) || 0;
            validateProbabilities();
        }

        function updateWheelItemPity(index, isPity) {
            window.currentWheelItems[index].is_pity_item = isPity;
        }

        function validateProbabilities() {
            const totalProbability = window.currentWheelItems.reduce((sum, item) => sum + (item.probability || 0), 0);
            const sumElement = document.getElementById('probabilitySum');

            if (sumElement) {
                sumElement.textContent = \`概率总和: \${totalProbability}%\`;
                sumElement.style.color = totalProbability === 100 ? '#27ae60' : '#e74c3c';
            }

            return totalProbability === 100;
        }

        async function saveWheelItems(wheelId) {
            if (!validateProbabilities()) {
                showAlert('error', '概率总和必须等于100%');
                return;
            }

            // 验证所有物品都已选择奖品
            const invalidItems = window.currentWheelItems.filter(item => !item.prize_id || item.prize_id === null);
            if (invalidItems.length > 0) {
                console.log('❌ 发现未选择奖品的物品:', invalidItems);
                showAlert('error', '请为所有物品选择奖品');
                return;
            }

            // 验证是否有稀有物品
            const hasRareItem = window.currentWheelItems.some(item => {
                const prize = window.availablePrizes.find(p => p.id === item.prize_id);
                return prize && ['epic', 'legendary'].includes(prize.prize_rarity);
            });

            if (!hasRareItem) {
                if (!confirm('转盘中没有稀有物品，这可能影响用户体验。确定要保存吗？')) {
                    return;
                }
            }

            try {
                // 确保数据类型正确
                const validatedItems = window.currentWheelItems.map((item, index) => ({
                    prize_id: item.prize_id ? parseInt(item.prize_id) : null,
                    probability: parseInt(item.probability) || 0,
                    position_index: typeof item.position_index === 'number' ? item.position_index : index,
                    is_pity_item: Boolean(item.is_pity_item)
                }));

                console.log('🎯 发送的数据:', { items: validatedItems });

                await apiRequest(\`lottery/admin/wheels/\${wheelId}/items\`, 'POST', {
                    items: validatedItems
                });

                showAlert('success', '转盘物品配置保存成功');
                closeLotteryModal();
            } catch (error) {
                showAlert('error', '保存转盘物品配置失败: ' + error.message);
            }
        }

        async function exportLotteryStats() {
            try {
                showAlert('info', '正在导出数据，请稍候...');

                // 获取系统统计
                const systemResponse = await apiRequest('lottery/admin/stats/system');
                const userResponse = await apiRequest('lottery/admin/stats/users?date_from=' + getDateDaysAgo(30));
                const prizeResponse = await apiRequest('lottery/admin/stats/prizes?period=30d');

                const exportData = {
                    export_time: new Date().toISOString(),
                    system_stats: systemResponse.data.system_stats,
                    prize_distribution: systemResponse.data.prize_distribution,
                    user_stats: userResponse.data.user_stats,
                    prize_stats: prizeResponse.data.prize_stats
                };

                // 创建并下载文件
                const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = \`lottery_stats_\${new Date().toISOString().split('T')[0]}.json\`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                showAlert('success', '数据导出成功');
            } catch (error) {
                showAlert('error', '导出数据失败: ' + error.message);
            }
        }

        // ============================================
        // 抽奖系统初始化和页面加载
        // ============================================

        // 在showTab函数中添加抽奖管理的初始化
        const originalShowTab = window.showTab;
        window.showTab = function(tabName) {
            originalShowTab(tabName);

            if (tabName === 'lottery') {
                // 默认显示奖品池管理
                showLotterySection('prizes');
            }
        };

        function refreshLeaderboard() { loadLeaderboard(); }

        // 模态框函数
        function showModal(title, content) {
            document.getElementById('modalTitle').textContent = title;
            document.getElementById('modalBody').innerHTML = content;
            document.getElementById('modal').classList.add('show');
        }

        function closeModal() {
            document.getElementById('modal').classList.remove('show');
        }

        // 编辑等级配置
        function editLevelConfig(levelId) {
            showModal('编辑等级配置', \`
                <form onsubmit="saveLevelConfig(event, \${levelId})">
                    <div class="form-group">
                        <label>所需经验值</label>
                        <input type="number" name="required_experience" class="form-control" required>
                    </div>
                    <div class="form-group">
                        <label>所需签到天数</label>
                        <input type="number" name="required_checkin_days" class="form-control" required>
                    </div>
                    <div class="form-group">
                        <label>所需连续签到天数</label>
                        <input type="number" name="required_consecutive_days" class="form-control" required>
                    </div>
                    <div class="form-group">
                        <label>签到奖励倍数</label>
                        <input type="number" step="0.1" name="checkin_reward_multiplier" class="form-control" required>
                    </div>
                    <div class="form-group">
                        <label>变更原因</label>
                        <textarea name="change_reason" class="form-control" required placeholder="请说明修改原因"></textarea>
                    </div>
                    <button type="submit" class="btn btn-primary">保存</button>
                    <button type="button" class="btn btn-secondary" onclick="closeModal()">取消</button>
                </form>
            \`);
        }

        // 保存等级配置
        async function saveLevelConfig(event, levelId) {
            event.preventDefault();
            const formData = new FormData(event.target);
            const data = Object.fromEntries(formData.entries());

            // 转换数值类型
            data.required_experience = parseInt(data.required_experience);
            data.required_checkin_days = parseInt(data.required_checkin_days);
            data.required_consecutive_days = parseInt(data.required_consecutive_days);
            data.checkin_reward_multiplier = parseFloat(data.checkin_reward_multiplier);

            try {
                const response = await apiRequest(\`level-configs/\${levelId}\`, {
                    method: 'PUT',
                    body: JSON.stringify(data)
                });

                showAlert('success', response.data.message);
                closeModal();
                loadLevelConfigs();
            } catch (error) {
                showAlert('error', error.message);
            }
        }

        // 编辑经验规则
        function editExperienceRule(ruleId) {
            showModal('编辑经验规则', \`
                <form onsubmit="saveExperienceRule(event, \${ruleId})">
                    <div class="form-group">
                        <label>基础经验值</label>
                        <input type="number" name="base_experience" class="form-control" required>
                    </div>
                    <div class="form-group">
                        <label>每日最大获得经验</label>
                        <input type="number" name="max_daily_gain" class="form-control" placeholder="0表示无限制">
                    </div>
                    <div class="form-group">
                        <label>规则描述</label>
                        <textarea name="description" class="form-control"></textarea>
                    </div>
                    <div class="form-group">
                        <label>变更原因</label>
                        <textarea name="change_reason" class="form-control" required placeholder="请说明修改原因"></textarea>
                    </div>
                    <button type="submit" class="btn btn-primary">保存</button>
                    <button type="button" class="btn btn-secondary" onclick="closeModal()">取消</button>
                </form>
            \`);
        }

        // 保存经验规则
        async function saveExperienceRule(event, ruleId) {
            event.preventDefault();
            const formData = new FormData(event.target);
            const data = Object.fromEntries(formData.entries());

            data.base_experience = parseInt(data.base_experience);
            data.max_daily_gain = parseInt(data.max_daily_gain) || 0;

            try {
                const response = await apiRequest(\`experience-rules/\${ruleId}\`, {
                    method: 'PUT',
                    body: JSON.stringify(data)
                });

                showAlert('success', response.data.message);
                closeModal();
                loadExperienceRules();
            } catch (error) {
                showAlert('error', error.message);
            }
        }

        // ============================================
        // 签到记录管理函数
        // ============================================

        let currentCheckinPage = 1;
        const checkinPageSize = 20;

        // 加载签到记录
        async function loadCheckinRecords(page = 1) {
            try {
                console.log('🔍 开始加载签到记录，页码:', page);
                showLoading('checkinRecordsList');
                
                // 获取筛选参数
                const userId = document.getElementById('filterUserId').value;
                const dateFrom = document.getElementById('filterDateFrom').value;
                const dateTo = document.getElementById('filterDateTo').value;
                const status = document.getElementById('filterStatus').value;

                console.log('🔍 筛选参数:', { userId, dateFrom, dateTo, status });

                // 构建查询参数
                const params = new URLSearchParams({
                    page: page,
                    limit: checkinPageSize,
                    sort_by: 'id',
                    sort_order: 'DESC'
                });

                if (userId) params.append('user_id', userId);
                if (dateFrom) params.append('date_from', dateFrom);
                if (dateTo) params.append('date_to', dateTo);
                if (status) params.append('status', status);

                const apiUrl = \`checkins?\${params.toString()}\`;
                console.log('🔍 API请求URL:', apiUrl);

                const response = await apiRequest(apiUrl);
                console.log('🔍 API响应:', response);

                if (!response.data) {
                    throw new Error('API响应格式错误：缺少data字段');
                }

                const { records, pagination } = response.data;
                console.log('🔍 获取到记录数:', records?.length || 0);

                currentCheckinPage = page;
                renderCheckinRecords(records || []);
                renderCheckinPagination(pagination || { current_page: 1, total_pages: 1, total_records: 0 });

            } catch (error) {
                console.error('❌ 加载签到记录失败:', error);
                document.getElementById('checkinRecordsList').innerHTML = 
                    \`<div style="padding: 20px; text-align: center; color: #dc3545; background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px;">
                        <h5>⚠️ 加载失败</h5>
                        <p>错误信息: \${error.message}</p>
                        <button class="btn btn-sm btn-primary" onclick="loadCheckinRecords(\${page})">🔄 重试</button>
                    </div>\`;
            }
        }

        // 渲染签到记录列表
        function renderCheckinRecords(records) {
            const container = document.getElementById('checkinRecordsList');
            
            if (records.length === 0) {
                container.innerHTML = \`
                    <div style="text-align: center; padding: 40px; color: #666;">
                        <i style="font-size: 48px;">📝</i>
                        <p style="margin-top: 10px;">暂无符合条件的签到记录</p>
                    </div>
                \`;
                return;
            }

            const html = \`
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>记录ID</th>
                                <th>用户信息</th>
                                <th>修仙等级</th>
                                <th>签到时间</th>
                                <th>连续天数</th>
                                <th>奖励金额</th>
                                <th>兑换码</th>
                                <th>状态</th>
                            </tr>
                        </thead>
                        <tbody>
                            \${records.map(record => \`
                                <tr>
                                    <td>\${record.id}</td>
                                    <td>
                                        <div style="display: flex; align-items: center; gap: 10px;">
                                            <img src="\${record.avatar_url || '/default-avatar.png'}"
                                                 alt="头像"
                                                 style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;"
                                                 onerror="this.src='/default-avatar.png'">
                                            <div>
                                                <div><strong>\${record.username || 'N/A'}</strong></div>
                                                <div style="font-size: 12px; color: #666;">
                                                    Linux DO: \${record.linux_do_id || 'N/A'}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td>
                                        <span class="level-badge" style="background: \${record.level_color || '#667eea'}">
                                            \${record.level_icon || '🌱'} \${record.level_name || '炼气'}
                                        </span>
                                    </td>
                                    <td style="font-size: 12px;">
                                        \${formatDateTime(record.created_at)}
                                    </td>
                                    <td>
                                        <span class="badge badge-info">\${record.consecutive_days}天</span>
                                    </td>
                                    <td>
                                        <span class="badge badge-success">¥\${record.reward_amount || 0}</span>
                                    </td>
                                    <td>
                                        \${record.redemption_code ?
                                            \`<code style="font-size: 11px;">\${record.redemption_code}</code>\` :
                                            '<span style="color: #999;">-</span>'
                                        }
                                    </td>
                                    <td>
                                        <span class="badge badge-\${getStatusColor(record.status)}">\${getStatusText(record.status)}</span>
                                    </td>
                                </tr>
                            \`).join('')}
                        </tbody>
                    </table>
                </div>
            \`;

            container.innerHTML = html;
        }

        // 渲染分页控件
        function renderCheckinPagination(pagination) {
            const container = document.getElementById('checkinPagination');
            
            if (pagination.total_pages <= 1) {
                container.innerHTML = '';
                return;
            }

            const { current_page, total_pages, total_records } = pagination;
            let html = \`
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>共 \${total_records} 条记录，第 \${current_page} / \${total_pages} 页</div>
                    <div>
            \`;

            // 上一页
            if (current_page > 1) {
                html += \`<button class="btn btn-sm btn-secondary" onclick="loadCheckinRecords(\${current_page - 1})">上一页</button> \`;
            }

            // 页码
            const startPage = Math.max(1, current_page - 2);
            const endPage = Math.min(total_pages, current_page + 2);

            for (let i = startPage; i <= endPage; i++) {
                if (i === current_page) {
                    html += \`<button class="btn btn-sm btn-primary">\${i}</button> \`;
                } else {
                    html += \`<button class="btn btn-sm btn-light" onclick="loadCheckinRecords(\${i})">\${i}</button> \`;
                }
            }

            // 下一页
            if (current_page < total_pages) {
                html += \`<button class="btn btn-sm btn-secondary" onclick="loadCheckinRecords(\${current_page + 1})">下一页</button>\`;
            }

            html += \`
                    </div>
                </div>
            \`;

            container.innerHTML = html;
        }

        // 加载签到统计
        async function loadCheckinStats() {
            try {
                showAlert('info', '正在加载统计数据...');
                
                const response = await apiRequest('checkins/stats');
                const stats = response.data;

                renderCheckinStatsOverview(stats);
                document.getElementById('checkinStatsOverview').style.display = 'block';

                showAlert('success', '统计数据加载完成');
            } catch (error) {
                showAlert('error', '加载统计数据失败: ' + error.message);
            }
        }

        // 渲染统计概览
        function renderCheckinStatsOverview(stats) {
            const container = document.getElementById('checkinStatsOverview');
            
            const { basic_stats, consecutive_stats, daily_trends, status_distribution } = stats;

            const html = \`
                <div style="background: #f8f9fa; padding: 20px; border-radius: 8px;">
                    <h4>📊 签到统计概览</h4>
                    
                    <!-- 基础统计 -->
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0;">
                        <div class="stat-card">
                            <div class="stat-value">\${basic_stats.total_checkins || 0}</div>
                            <div class="stat-label">总签到次数</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value">\${basic_stats.total_users || 0}</div>
                            <div class="stat-label">签到用户数</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value">¥\${(basic_stats.total_rewards || 0).toFixed(2)}</div>
                            <div class="stat-label">总奖励发放</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value">¥\${(basic_stats.avg_reward || 0).toFixed(2)}</div>
                            <div class="stat-label">平均奖励</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value">\${basic_stats.today_checkins || 0}</div>
                            <div class="stat-label">今日签到</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value">\${basic_stats.week_checkins || 0}</div>
                            <div class="stat-label">本周签到</div>
                        </div>
                    </div>

                    <!-- 状态分布 -->
                    <div style="margin-top: 20px;">
                        <h5>📈 状态分布</h5>
                        <div style="display: flex; gap: 15px; flex-wrap: wrap;">
                            \${status_distribution.map(stat => \`
                                <div class="stat-item">
                                    <span class="badge badge-\${getStatusColor(stat.status)}">\${getStatusText(stat.status)}</span>
                                    <span style="margin-left: 8px;">\${stat.count} 次</span>
                                </div>
                            \`).join('')}
                        </div>
                    </div>

                    <!-- 连续签到分布 -->
                    <div style="margin-top: 20px;">
                        <h5>🔥 连续签到分布 (前10名)</h5>
                        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                            \${consecutive_stats.slice(0, 10).map(stat => \`
                                <div class="consecutive-stat">
                                    <strong>\${stat.consecutive_days}天</strong>: \${stat.count}次
                                </div>
                            \`).join('')}
                        </div>
                    </div>
                </div>
            \`;

            container.innerHTML = html;
        }

        // 导出签到记录
        async function exportCheckinRecords() {
            try {
                showAlert('info', '正在导出数据，请稍候...');

                // 获取筛选参数
                const userId = document.getElementById('filterUserId').value;
                const dateFrom = document.getElementById('filterDateFrom').value;
                const dateTo = document.getElementById('filterDateTo').value;

                const exportData = {
                    userId: userId || null,
                    dateFrom: dateFrom || null,
                    dateTo: dateTo || null,
                    format: 'json'
                };

                const response = await apiRequest('checkins/export', 'POST', exportData);
                
                // 创建并下载文件
                const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = \`checkin_records_\${new Date().toISOString().split('T')[0]}.json\`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                showAlert('success', \`导出完成，共 \${response.data.total_records} 条记录\`);
            } catch (error) {
                showAlert('error', '导出失败: ' + error.message);
            }
        }

        // 重置筛选条件
        function resetCheckinFilters() {
            document.getElementById('filterUserId').value = '';
            document.getElementById('filterDateFrom').value = '';
            document.getElementById('filterDateTo').value = '';
            document.getElementById('filterStatus').value = '';
            
            // 隐藏统计概览
            document.getElementById('checkinStatsOverview').style.display = 'none';
            
            // 重置列表显示
            document.getElementById('checkinRecordsList').innerHTML = \`
                <div style="text-align: center; padding: 40px; color: #666;">
                    <i style="font-size: 48px;">📝</i>
                    <p style="margin-top: 10px;">点击"查询记录"查看签到数据</p>
                </div>
            \`;
            
            document.getElementById('checkinPagination').innerHTML = '';
        }

        // 辅助函数
        function getStatusColor(status) {
            const colors = {
                'completed': 'success',
                'pending': 'warning',
                'failed': 'danger'
            };
            return colors[status] || 'secondary';
        }

        function getStatusText(status) {
            const texts = {
                'completed': '已完成',
                'pending': '待处理',
                'failed': '失败'
            };
            return texts[status] || status;
        }

        function formatDateTime(dateTime) {
            if (!dateTime) return '-';
            return new Date(dateTime).toLocaleString('zh-CN');
        }

        // 查看用户等级信息
        async function viewUserLevel(userId) {
            try {
                const response = await apiRequest(\`level-info/\${userId}\`);
                const user = response.data;

                showModal('用户等级信息', \`
                    <div style="text-align: center; margin-bottom: 20px;">
                        <h3>\${user.username}</h3>
                        <div class="level-badge" style="background: \${user.level_color}; font-size: 16px; padding: 8px 16px;">
                            \${user.level_icon} \${user.current_level_name}
                        </div>
                    </div>

                    <div class="form-group">
                        <label>当前经验值</label>
                        <div>\${user.current_experience} / \${user.next_level_required_exp || '最高等级'}</div>
                        \${user.next_level_required_exp ? \`
                            <div class="progress-bar" style="margin-top: 5px;">
                                <div class="progress-fill" style="width: \${user.level_progress_percent}%"></div>
                            </div>
                            <small>进度: \${user.level_progress_percent}%</small>
                        \` : ''}
                    </div>

                    <div class="form-group">
                        <label>签到统计</label>
                        <div>总签到: \${user.total_checkins} 天</div>
                        <div>连续签到: \${user.consecutive_days} 天</div>
                        <div>最大连续: \${user.max_consecutive_days} 天</div>
                    </div>

                    <div class="form-group">
                        <label>今日经验获得</label>
                        <div>\${user.today_experience} 经验</div>
                    </div>

                    \${user.next_level_name ? \`
                        <div class="form-group">
                            <label>下一等级</label>
                            <div>\${user.next_level_name}</div>
                            <div>还需 \${user.experience_to_next_level} 经验</div>
                        </div>
                    \` : ''}
                \`);
            } catch (error) {
                showAlert('error', '获取用户等级信息失败');
            }
        }



        // 创建配置快照
        async function createConfigSnapshot() {
            const snapshotName = prompt('请输入快照名称:');
            if (!snapshotName) return;

            try {
                await apiRequest('config-snapshots', {
                    method: 'POST',
                    body: JSON.stringify({
                        snapshot_name: snapshotName,
                        description: \`手动创建的配置快照 - \${new Date().toLocaleString()}\`,
                        include_categories: ['level_config', 'experience_rules', 'reward_config']
                    })
                });

                showAlert('success', '配置快照创建成功');
            } catch (error) {
                showAlert('error', '创建快照失败: ' + error.message);
            }
        }

        // 显示导入兑换码模态框
        function showImportCodesModal() {
            showModal('导入兑换码', \`
                <div style="margin-bottom: 20px;">
                    <div class="form-group">
                        <label>兑换码金额 ($)</label>
                        <input type="number" step="0.01" id="importAmount" class="form-control" min="0.01" required placeholder="请输入兑换码金额">
                    </div>
                </div>

                <div style="border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
                    <!-- 导入方式选择 -->
                    <div style="background: #f8f9fa; padding: 15px; border-bottom: 1px solid #ddd;">
                        <div style="display: flex; gap: 10px;">
                            <button type="button" class="btn btn-primary" id="textImportBtn" onclick="switchImportMode('text')">文本导入</button>
                            <button type="button" class="btn btn-secondary" id="fileImportBtn" onclick="switchImportMode('file')">文件上传</button>
                        </div>
                    </div>

                    <!-- 文本导入 -->
                    <div id="textImportPanel" style="padding: 20px;">
                        <div class="form-group">
                            <label>兑换码列表（每行一个）</label>
                            <textarea id="codesTextarea" class="form-control" rows="10" placeholder="请粘贴兑换码，每行一个&#10;例如：&#10;ABC123DEF456&#10;XYZ789GHI012&#10;..."></textarea>
                        </div>
                        <button type="button" class="btn btn-primary" onclick="doTextImport()">导入兑换码</button>
                    </div>

                    <!-- 文件上传 -->
                    <div id="fileImportPanel" style="padding: 20px; display: none;">
                        <div class="form-group">
                            <label>选择文件（支持.txt格式）</label>
                            <input type="file" id="codesFile" class="form-control" accept=".txt" onchange="handleFileSelect(event)">
                            <small class="text-muted">文件格式：每行一个兑换码</small>
                        </div>
                        <button type="button" class="btn btn-primary" onclick="doFileImport()">上传并导入</button>
                    </div>
                </div>

                <div style="margin-top: 15px; text-align: right;">
                    <button type="button" class="btn btn-secondary" onclick="closeModal()">取消</button>
                </div>
            \`);
        }

        // 切换导入模式
        function switchImportMode(mode) {
            const textBtn = document.getElementById('textImportBtn');
            const fileBtn = document.getElementById('fileImportBtn');
            const textPanel = document.getElementById('textImportPanel');
            const filePanel = document.getElementById('fileImportPanel');

            if (mode === 'text') {
                textBtn.className = 'btn btn-primary';
                fileBtn.className = 'btn btn-secondary';
                textPanel.style.display = 'block';
                filePanel.style.display = 'none';
            } else {
                textBtn.className = 'btn btn-secondary';
                fileBtn.className = 'btn btn-primary';
                textPanel.style.display = 'none';
                filePanel.style.display = 'block';
            }
        }

        // 文本导入
        async function doTextImport() {
            const amount = parseFloat(document.getElementById('importAmount').value);
            const codesText = document.getElementById('codesTextarea').value.trim();

            if (!amount || amount <= 0) {
                showAlert('error', '请输入有效的金额');
                return;
            }

            if (!codesText) {
                showAlert('error', '请输入兑换码');
                return;
            }

            const codes = codesText.split('\\n').map(code => code.trim()).filter(code => code);

            if (codes.length === 0) {
                showAlert('error', '没有有效的兑换码');
                return;
            }

            await importCodes(codes, amount, 'text');
        }

        // 文件导入
        async function doFileImport() {
            const amount = parseFloat(document.getElementById('importAmount').value);
            const fileInput = document.getElementById('codesFile');

            if (!amount || amount <= 0) {
                showAlert('error', '请输入有效的金额');
                return;
            }

            if (!fileInput.files || fileInput.files.length === 0) {
                showAlert('error', '请选择文件');
                return;
            }

            const file = fileInput.files[0];

            if (!file.name.toLowerCase().endsWith('.txt')) {
                showAlert('error', '只支持.txt格式文件');
                return;
            }

            try {
                const text = await readFileAsText(file);
                const codes = text.split('\\n').map(code => code.trim()).filter(code => code);

                if (codes.length === 0) {
                    showAlert('error', '文件中没有有效的兑换码');
                    return;
                }

                await importCodes(codes, amount, 'file');
            } catch (error) {
                showAlert('error', '读取文件失败: ' + error.message);
            }
        }

        // 读取文件内容
        function readFileAsText(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = e => resolve(e.target.result);
                reader.onerror = e => reject(new Error('文件读取失败'));
                reader.readAsText(file, 'UTF-8');
            });
        }

        // 执行导入
        async function importCodes(codes, amount, importType) {
            try {
                const response = await apiRequest('codes/import', {
                    method: 'POST',
                    body: JSON.stringify({
                        codes: codes,
                        amount: amount,
                        importType: importType
                    })
                });

                showAlert('success', response.message);
                closeModal();
                loadCodes(1); // 导入后回到第一页
            } catch (error) {
                showAlert('error', error.message);
            }
        }

        // 退出登录
        async function logout() {
            if (confirm('确定要退出登录吗？')) {
                try {
                    await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' });
                    window.location.href = '/login';
                } catch (error) {
                    showAlert('error', '登出失败');
                }
            }
        }

        // 点击模态框外部关闭
        document.getElementById('modal').addEventListener('click', function(e) {
            if (e.target === this) {
                closeModal();
            }
        });
    </script>
</body>
</html>
  `;
}

// ============================================
// 登录页面HTML
// ============================================

function getLoginHTML() {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>KYX 管理后台 - 登录</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .login-container {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            width: 100%;
            max-width: 400px;
        }

        .login-header {
            text-align: center;
            margin-bottom: 30px;
        }

        .login-header h1 {
            color: #2c3e50;
            font-size: 28px;
            font-weight: 700;
            margin-bottom: 10px;
        }

        .login-header p {
            color: #7f8c8d;
            font-size: 14px;
        }

        .form-group {
            margin-bottom: 20px;
        }

        .form-group label {
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
            color: #2c3e50;
        }

        .form-control {
            width: 100%;
            padding: 15px;
            border: 2px solid #ecf0f1;
            border-radius: 10px;
            font-size: 16px;
            transition: border-color 0.3s ease;
        }

        .form-control:focus {
            outline: none;
            border-color: #667eea;
        }

        .login-btn {
            width: 100%;
            padding: 15px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 10px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .login-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(102, 126, 234, 0.4);
        }

        .login-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
        }

        .alert {
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
            border-left: 4px solid;
        }

        .alert-error {
            background: #f8d7da;
            color: #721c24;
            border-color: #dc3545;
        }

        .alert-success {
            background: #d4edda;
            color: #155724;
            border-color: #28a745;
        }

        .loading {
            display: none;
            text-align: center;
            margin-top: 10px;
            color: #7f8c8d;
        }

        .loading::after {
            content: '';
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 2px solid #ecf0f1;
            border-top: 2px solid #667eea;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-left: 10px;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        .footer {
            text-align: center;
            margin-top: 30px;
            color: #7f8c8d;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div class="login-container">
        <div class="login-header">
            <h1>🎯 KYX 管理后台</h1>
            <p>13级修仙境界等级体系 & 完整管理员权限控制</p>
        </div>

        <div id="alertContainer"></div>

        <form id="loginForm">
            <div class="form-group">
                <label for="username">用户名</label>
                <input type="text" id="username" name="username" class="form-control" required>
            </div>

            <div class="form-group">
                <label for="password">密码</label>
                <input type="password" id="password" name="password" class="form-control" required>
            </div>

            <button type="submit" class="login-btn" id="loginBtn">登录</button>

            <div class="loading" id="loading">登录中...</div>
        </form>

        <div class="footer">
            <p>KYX 签到系统超级管理后台 v7.0</p>
            <p>支持等级系统配置、经验规则管理、审核工作流</p>
        </div>
    </div>

    <script>
        document.getElementById('loginForm').addEventListener('submit', async function(e) {
            e.preventDefault();

            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            const loginBtn = document.getElementById('loginBtn');
            const loading = document.getElementById('loading');

            if (!username || !password) {
                showAlert('error', '请输入用户名和密码');
                return;
            }

            loginBtn.disabled = true;
            loading.style.display = 'block';

            try {
                const response = await fetch('/api/admin/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ username, password })
                });

                const data = await response.json();

                if (data.success) {
                    showAlert('success', '登录成功，正在跳转...');
                    setTimeout(() => {
                        window.location.href = '/';
                    }, 1000);
                } else {
                    showAlert('error', data.message || '登录失败');
                }
            } catch (error) {
                console.error('Login error:', error);
                showAlert('error', '网络错误，请重试');
            } finally {
                loginBtn.disabled = false;
                loading.style.display = 'none';
            }
        });

        function showAlert(type, message) {
            const alertContainer = document.getElementById('alertContainer');
            const alertDiv = document.createElement('div');
            alertDiv.className = \`alert alert-\${type}\`;
            alertDiv.textContent = message;

            alertContainer.innerHTML = '';
            alertContainer.appendChild(alertDiv);

            setTimeout(() => {
                alertDiv.remove();
            }, 5000);
        }


    </script>
</body>
</html>
  `;
}

// ============================================
// 主要请求处理函数
// ============================================

export default {
  async fetch(request, env) {
    // 初始化数据库
    await initializeDatabase(env);

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS 预检请求
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: corsHeaders(),
      });
    }

    try {
      // 登录页面路由
      if (method === 'GET' && path === '/login') {
        return htmlResponse(getLoginHTML());
      }

      // 主页面路由（需要验证）
      if (method === 'GET' && (path === '/' || path === '/admin' || path === '/admin/')) {
        const sessionId = request.headers.get('cookie')?.match(/admin_session=([^;]+)/)?.[1];
        if (sessionId) {
          const session = await verifyAdminSession(env, sessionId);
          if (session) {
            return htmlResponse(getAdminHTML());
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

      // API 路由（需要验证）
      if (path.startsWith('/api/admin/')) {
        const sessionId = request.headers.get('cookie')?.match(/admin_session=([^;]+)/)?.[1];
        if (!sessionId) {
          return errorResponse('未登录', 401);
        }

        const session = await verifyAdminSession(env, sessionId);
        if (!session) {
          return errorResponse('会话无效', 401);
        }

        const apiPath = path.replace('/api/admin/', '');
        return await handleApiRequest(request, env, apiPath, method, session);
      }

      // 默认重定向到登录页
      if (path === '/' || path === '') {
        return Response.redirect(url.origin + '/login', 302);
      }

      return errorResponse('页面不存在', 404);

    } catch (error) {
      console.error('Request handling error:', error);
      return errorResponse('服务器内部错误: ' + error.message, 500);
    }
  },
};
