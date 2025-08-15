-- 每日签到系统 V5 数据库架构
-- 支持兑换码金额管理、待分配机制、系统赠送等功能

-- ============================================
-- 用户表
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    linux_do_id INTEGER UNIQUE NOT NULL,
    username TEXT NOT NULL,
    email TEXT,
    avatar_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 上传批次表（增加金额字段）
-- ============================================
CREATE TABLE IF NOT EXISTS upload_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    amount DECIMAL(10,2) DEFAULT 0,  -- 批次金额
    total_codes INTEGER NOT NULL,
    valid_codes INTEGER NOT NULL,
    duplicate_codes INTEGER NOT NULL,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 兑换码表（增强版）
-- ============================================
CREATE TABLE IF NOT EXISTS redemption_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    amount DECIMAL(10,2) DEFAULT 0,  -- 兑换码金额
    is_used BOOLEAN DEFAULT FALSE,
    used_by INTEGER,
    used_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    batch_id INTEGER,
    distribution_type TEXT DEFAULT 'checkin',  -- 分发类型: checkin/gift/manual/pending
    distribution_time DATETIME,  -- 分发时间
    FOREIGN KEY (used_by) REFERENCES users(id),
    FOREIGN KEY (batch_id) REFERENCES upload_batches(id)
);

-- ============================================
-- 签到记录表（增强版）
-- ============================================
CREATE TABLE IF NOT EXISTS check_ins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    check_in_date DATE NOT NULL,
    check_in_time DATETIME NOT NULL,  -- 精确到毫秒的时间戳
    redemption_code TEXT,
    status TEXT DEFAULT 'completed',  -- 状态: completed/pending_distribution
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (redemption_code) REFERENCES redemption_codes(code),
    UNIQUE(user_id, check_in_date)
);

-- ============================================
-- 会话表
-- ============================================
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_admin BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ============================================
-- 系统通知表（新增）
-- ============================================
CREATE TABLE IF NOT EXISTS system_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,  -- 通知类型: gift/system/pending_resolved
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    redemption_code TEXT,
    amount DECIMAL(10,2),
    is_read BOOLEAN DEFAULT FALSE,
    is_dismissed BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    read_at DATETIME,
    dismissed_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (redemption_code) REFERENCES redemption_codes(code)
);

-- ============================================
-- 分发记录表（新增）
-- ============================================
CREATE TABLE IF NOT EXISTS distribution_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER NOT NULL,  -- 执行分发的管理员（使用特殊ID表示系统管理员）
    operation_type TEXT NOT NULL,  -- 操作类型: batch/gift/pending_resolve
    target_users TEXT NOT NULL,  -- JSON数组存储目标用户ID
    amount DECIMAL(10,2),
    codes_distributed INTEGER DEFAULT 0,
    status TEXT DEFAULT 'success',  -- 状态: success/partial/failed
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 库存统计视图（新增）
-- ============================================
CREATE VIEW IF NOT EXISTS inventory_stats AS
SELECT 
    amount,
    COUNT(*) as total_count,
    SUM(CASE WHEN is_used = FALSE THEN 1 ELSE 0 END) as available_count,
    SUM(CASE WHEN is_used = TRUE THEN 1 ELSE 0 END) as used_count
FROM redemption_codes
GROUP BY amount;

-- ============================================
-- 待分配用户视图（新增）
-- ============================================
CREATE VIEW IF NOT EXISTS pending_distributions AS
SELECT 
    c.id as checkin_id,
    c.user_id,
    u.username,
    u.linux_do_id,
    c.check_in_date,
    c.check_in_time,
    c.created_at
FROM check_ins c
JOIN users u ON c.user_id = u.id
WHERE c.status = 'pending_distribution'
ORDER BY c.created_at ASC;

-- ============================================
-- 索引优化
-- ============================================
-- 基础索引
CREATE INDEX IF NOT EXISTS idx_redemption_codes_is_used ON redemption_codes(is_used);
CREATE INDEX IF NOT EXISTS idx_redemption_codes_batch_id ON redemption_codes(batch_id);
CREATE INDEX IF NOT EXISTS idx_check_ins_user_id ON check_ins(user_id);
CREATE INDEX IF NOT EXISTS idx_check_ins_date ON check_ins(check_in_date);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_is_admin ON sessions(is_admin);

-- V5新增索引
CREATE INDEX IF NOT EXISTS idx_redemption_codes_amount ON redemption_codes(amount, is_used);
CREATE INDEX IF NOT EXISTS idx_redemption_codes_distribution ON redemption_codes(distribution_type, distribution_time);
CREATE INDEX IF NOT EXISTS idx_check_ins_status ON check_ins(status, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON system_notifications(user_id, is_dismissed, created_at);
CREATE INDEX IF NOT EXISTS idx_distribution_logs_created ON distribution_logs(created_at);

-- ============================================
-- 初始化管理员用户（ID=0 表示系统管理员）
-- ============================================
INSERT OR IGNORE INTO users (id, linux_do_id, username, email, created_at) 
VALUES (0, 0, 'System Admin', 'admin@system', CURRENT_TIMESTAMP);