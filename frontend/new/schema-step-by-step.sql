-- KYX 签到系统 - 分步数据库初始化
-- 这个文件将数据库初始化分为多个步骤，避免执行错误

-- ============================================
-- 第一步：创建基础表
-- ============================================

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    linux_do_id INTEGER UNIQUE NOT NULL,
    email TEXT,
    avatar_url TEXT,
    total_checkins INTEGER DEFAULT 0,
    consecutive_days INTEGER DEFAULT 0,
    max_consecutive_days INTEGER DEFAULT 0,
    last_checkin_date TEXT,
    level INTEGER DEFAULT 1,
    experience INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- 管理员表
CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    last_login TEXT
);

-- 兑换码表
CREATE TABLE IF NOT EXISTS redemption_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    amount REAL NOT NULL,
    is_distributed BOOLEAN DEFAULT FALSE,
    distributed_to INTEGER,
    distributed_at TEXT,
    distribution_type TEXT DEFAULT 'manual',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (distributed_to) REFERENCES users (id)
);

-- 签到记录表
CREATE TABLE IF NOT EXISTS check_ins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    check_in_date TEXT NOT NULL,
    check_in_time TEXT NOT NULL,
    redemption_code TEXT,
    consecutive_days INTEGER DEFAULT 1,
    reward_amount REAL DEFAULT 0,
    status TEXT DEFAULT 'completed',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users (id),
    UNIQUE(user_id, check_in_date)
);

-- 签到奖励配置表
CREATE TABLE IF NOT EXISTS checkin_rewards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    consecutive_days INTEGER UNIQUE NOT NULL,
    reward_amount REAL NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TEXT DEFAULT (datetime('now'))
);

-- 会话表
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT UNIQUE NOT NULL,
    user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users (id)
);

-- 用户等级表
CREATE TABLE IF NOT EXISTS user_levels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level INTEGER UNIQUE NOT NULL,
    required_experience INTEGER NOT NULL,
    level_name TEXT NOT NULL,
    benefits TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- 系统日志表
CREATE TABLE IF NOT EXISTS system_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    log_type TEXT NOT NULL,
    message TEXT NOT NULL,
    details TEXT,
    user_id INTEGER,
    admin_id INTEGER,
    ip_address TEXT,
    user_agent TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users (id),
    FOREIGN KEY (admin_id) REFERENCES admins (id)
);

-- 用户统计表
CREATE TABLE IF NOT EXISTS user_statistics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE NOT NULL,
    total_rewards REAL DEFAULT 0,
    total_codes_received INTEGER DEFAULT 0,
    first_checkin_date TEXT,
    last_activity_date TEXT,
    average_checkin_interval REAL DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    total_login_days INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users (id)
);

-- 弹窗配置表
CREATE TABLE IF NOT EXISTS modal_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    modal_type TEXT UNIQUE NOT NULL,
    max_display_count INTEGER DEFAULT 1,
    cooldown_minutes INTEGER DEFAULT 0,
    is_enabled BOOLEAN DEFAULT TRUE,
    title TEXT,
    content TEXT,
    button_text TEXT DEFAULT '确定',
    description TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- 用户弹窗记录表
CREATE TABLE IF NOT EXISTS user_modal_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    modal_type TEXT NOT NULL,
    display_count INTEGER DEFAULT 1,
    last_displayed_at TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users (id)
);
