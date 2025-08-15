-- KYX 签到系统完整数据库表结构
-- 包含用户端和管理端所需的所有表

-- ============================================
-- 用户相关表
-- ============================================

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    linux_do_id INTEGER UNIQUE NOT NULL,
    username TEXT NOT NULL,
    email TEXT,
    avatar_url TEXT,
    total_checkins INTEGER DEFAULT 0,
    consecutive_days INTEGER DEFAULT 0,
    max_consecutive_days INTEGER DEFAULT 0,
    last_checkin_date TEXT,
    level INTEGER DEFAULT 1,
    experience INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE
);

-- 用户会话表
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT UNIQUE NOT NULL,
    user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users (id)
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

-- ============================================
-- 兑换码相关表
-- ============================================

-- 兑换码表
CREATE TABLE IF NOT EXISTS redemption_codes (
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
);

-- 签到奖励配置表
CREATE TABLE IF NOT EXISTS checkin_rewards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    consecutive_days INTEGER NOT NULL,
    reward_amount REAL NOT NULL,
    reward_type TEXT DEFAULT 'money',
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- 管理员相关表
-- ============================================

-- 管理员表
CREATE TABLE IF NOT EXISTS admins (
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
);

-- 管理员会话表
CREATE TABLE IF NOT EXISTS admin_sessions (
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
);

-- 上传批次表
CREATE TABLE IF NOT EXISTS upload_batches (
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
);

-- 操作日志表
CREATE TABLE IF NOT EXISTS operation_logs (
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
);

-- 发放日志表
CREATE TABLE IF NOT EXISTS distribution_logs (
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
);

-- ============================================
-- 弹窗系统相关表
-- ============================================

-- 弹窗显示记录表
CREATE TABLE IF NOT EXISTS modal_display_logs (
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
);

-- 弹窗配置表
CREATE TABLE IF NOT EXISTS modal_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    modal_type TEXT UNIQUE NOT NULL,
    max_display_count INTEGER DEFAULT 1,
    cooldown_minutes INTEGER DEFAULT 0,
    is_enabled BOOLEAN DEFAULT TRUE,
    description TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- 索引创建
-- ============================================

-- 用户表索引
CREATE INDEX IF NOT EXISTS idx_users_linux_do_id ON users(linux_do_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- 会话表索引
CREATE INDEX IF NOT EXISTS idx_sessions_session_id ON sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- 签到记录索引
CREATE INDEX IF NOT EXISTS idx_checkins_user_date ON check_ins(user_id, check_in_date);
CREATE INDEX IF NOT EXISTS idx_checkins_date ON check_ins(check_in_date);

-- 兑换码索引
CREATE INDEX IF NOT EXISTS idx_codes_code ON redemption_codes(code);
CREATE INDEX IF NOT EXISTS idx_codes_used ON redemption_codes(is_used);
CREATE INDEX IF NOT EXISTS idx_codes_distributed ON redemption_codes(is_distributed);
CREATE INDEX IF NOT EXISTS idx_codes_amount ON redemption_codes(amount);

-- 管理员会话索引
CREATE INDEX IF NOT EXISTS idx_admin_sessions_session_id ON admin_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin_id ON admin_sessions(admin_id);

-- 弹窗记录索引
CREATE INDEX IF NOT EXISTS idx_modal_logs_user_type ON modal_display_logs(user_id, modal_type);
CREATE INDEX IF NOT EXISTS idx_modal_logs_key ON modal_display_logs(modal_key, display_count);

-- ============================================
-- 初始数据插入
-- ============================================

-- 插入默认签到奖励配置
INSERT OR IGNORE INTO checkin_rewards (consecutive_days, reward_amount, description) VALUES
(1, 5.00, '首次签到奖励'),
(2, 6.00, '连续2天签到'),
(3, 7.00, '连续3天签到'),
(4, 8.00, '连续4天签到'),
(5, 9.00, '连续5天签到'),
(6, 10.00, '连续6天签到'),
(7, 15.00, '连续7天签到奖励'),
(14, 25.00, '连续14天签到奖励'),
(30, 50.00, '连续30天签到奖励');

-- 插入默认弹窗配置（确保表存在后再插入）
INSERT OR IGNORE INTO modal_configs (modal_type, max_display_count, cooldown_minutes, description) VALUES
('gift', 1, 0, '系统赠送弹窗'),
('checkin_reminder', 3, 1440, '签到提醒弹窗'),
('reward_notification', 5, 60, '奖励通知弹窗'),
('level_up', 1, 0, '升级通知弹窗');
