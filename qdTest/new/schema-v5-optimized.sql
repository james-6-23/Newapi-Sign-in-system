-- 每日签到系统 V5 优化数据库架构
-- 支持兑换码金额管理、待分配机制、系统赠送、弹窗控制等功能
-- 优化版本：改进性能、增强功能、优化索引

-- ============================================
-- 用户表（优化版）
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    linux_do_id INTEGER UNIQUE NOT NULL,
    username TEXT NOT NULL,
    email TEXT,
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,  -- 用户状态
    last_login_at DATETIME,  -- 最后登录时间
    total_checkins INTEGER DEFAULT 0,  -- 总签到次数（冗余字段，提高查询性能）
    total_amount DECIMAL(10,2) DEFAULT 0,  -- 累计获得金额（冗余字段）
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 上传批次表（优化版）
-- ============================================
CREATE TABLE IF NOT EXISTS upload_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    amount DECIMAL(10,2) DEFAULT 0,  -- 批次金额
    total_codes INTEGER NOT NULL,
    valid_codes INTEGER NOT NULL,
    duplicate_codes INTEGER NOT NULL,
    invalid_codes INTEGER DEFAULT 0,  -- 无效兑换码数量
    upload_status TEXT DEFAULT 'completed',  -- 上传状态: processing/completed/failed
    uploaded_by INTEGER,  -- 上传者ID
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME,  -- 处理完成时间
    FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

-- ============================================
-- 兑换码表（优化版）
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
    distribution_type TEXT DEFAULT 'checkin',  -- 分发类型: checkin/gift/manual/pending/system
    distribution_time DATETIME,  -- 分发时间
    expires_at DATETIME,  -- 过期时间（可选）
    notes TEXT,  -- 备注信息
    FOREIGN KEY (used_by) REFERENCES users(id),
    FOREIGN KEY (batch_id) REFERENCES upload_batches(id)
);

-- ============================================
-- 签到记录表（优化版）
-- ============================================
CREATE TABLE IF NOT EXISTS check_ins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    check_in_date DATE NOT NULL,
    check_in_time DATETIME NOT NULL,  -- 精确到毫秒的时间戳
    redemption_code TEXT,
    amount DECIMAL(10,2) DEFAULT 0,  -- 冗余字段：兑换码金额
    status TEXT DEFAULT 'completed',  -- 状态: completed/pending_distribution/failed
    ip_address TEXT,  -- 签到IP地址
    user_agent TEXT,  -- 用户代理
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (redemption_code) REFERENCES redemption_codes(code),
    UNIQUE(user_id, check_in_date)
);

-- ============================================
-- 会话表（优化版）
-- ============================================
CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,  -- 更明确的字段名
    user_id INTEGER NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP,  -- 最后访问时间
    ip_address TEXT,  -- 会话IP地址
    user_agent TEXT,  -- 用户代理
    is_active BOOLEAN DEFAULT TRUE,  -- 会话状态
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ============================================
-- 系统通知表（优化版）
-- ============================================
CREATE TABLE IF NOT EXISTS system_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,  -- 通知类型: gift/system/pending_resolved/maintenance
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    redemption_code TEXT,
    amount DECIMAL(10,2),
    priority INTEGER DEFAULT 1,  -- 优先级: 1=低, 2=中, 3=高
    is_read BOOLEAN DEFAULT FALSE,
    is_dismissed BOOLEAN DEFAULT FALSE,
    expires_at DATETIME,  -- 通知过期时间
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    read_at DATETIME,
    dismissed_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (redemption_code) REFERENCES redemption_codes(code)
);

-- ============================================
-- 弹窗显示记录表（新增）
-- ============================================
CREATE TABLE IF NOT EXISTS modal_display_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    notification_id INTEGER,  -- 关联的通知ID（可选）
    modal_type TEXT NOT NULL,  -- 弹窗类型: gift/pending/checkin/system
    modal_key TEXT NOT NULL,  -- 弹窗唯一标识（如兑换码）
    display_count INTEGER DEFAULT 0,  -- 显示次数
    max_display_count INTEGER DEFAULT 1,  -- 最大显示次数
    first_displayed_at DATETIME,  -- 首次显示时间
    last_displayed_at DATETIME,  -- 最后显示时间
    is_dismissed BOOLEAN DEFAULT FALSE,  -- 是否已关闭
    dismissed_at DATETIME,  -- 关闭时间
    dismiss_reason TEXT,  -- 关闭原因: user_action/copy_action/timeout/system
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (notification_id) REFERENCES system_notifications(id),
    UNIQUE(user_id, modal_type, modal_key)
);

-- ============================================
-- 弹窗配置表（新增）
-- ============================================
CREATE TABLE IF NOT EXISTS modal_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    modal_type TEXT UNIQUE NOT NULL,  -- 弹窗类型
    max_display_count INTEGER DEFAULT 1,  -- 默认最大显示次数
    cooldown_minutes INTEGER DEFAULT 0,  -- 冷却时间（分钟）
    is_enabled BOOLEAN DEFAULT TRUE,  -- 是否启用
    auto_dismiss_seconds INTEGER DEFAULT 0,  -- 自动关闭时间（秒，0表示不自动关闭）
    description TEXT,  -- 配置描述
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 分发记录表（优化版）
-- ============================================
CREATE TABLE IF NOT EXISTS distribution_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER NOT NULL,  -- 执行分发的管理员（0表示系统管理员）
    operation_type TEXT NOT NULL,  -- 操作类型: batch/gift/pending_resolve/manual
    target_users TEXT NOT NULL,  -- JSON数组存储目标用户ID
    amount DECIMAL(10,2),
    codes_distributed INTEGER DEFAULT 0,
    codes_failed INTEGER DEFAULT 0,  -- 分发失败的兑换码数量
    status TEXT DEFAULT 'success',  -- 状态: success/partial/failed/processing
    error_message TEXT,
    execution_time_ms INTEGER,  -- 执行时间（毫秒）
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,  -- 完成时间
    FOREIGN KEY (admin_id) REFERENCES users(id)
);

-- ============================================
-- 系统配置表（新增）
-- ============================================
CREATE TABLE IF NOT EXISTS system_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    config_key TEXT UNIQUE NOT NULL,  -- 配置键
    config_value TEXT NOT NULL,  -- 配置值
    config_type TEXT DEFAULT 'string',  -- 配置类型: string/number/boolean/json
    description TEXT,  -- 配置描述
    is_public BOOLEAN DEFAULT FALSE,  -- 是否为公开配置（前端可访问）
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 操作日志表（新增）
-- ============================================
CREATE TABLE IF NOT EXISTS operation_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,  -- 操作用户ID（NULL表示系统操作）
    operation_type TEXT NOT NULL,  -- 操作类型: login/logout/checkin/admin_action
    operation_detail TEXT,  -- 操作详情
    ip_address TEXT,  -- 操作IP地址
    user_agent TEXT,  -- 用户代理
    result TEXT DEFAULT 'success',  -- 操作结果: success/failed/error
    error_message TEXT,  -- 错误信息
    execution_time_ms INTEGER,  -- 执行时间（毫秒）
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ============================================
-- 优化视图
-- ============================================

-- 库存统计视图（优化版）
CREATE VIEW IF NOT EXISTS inventory_stats AS
SELECT 
    amount,
    COUNT(*) as total_count,
    SUM(CASE WHEN is_used = FALSE THEN 1 ELSE 0 END) as available_count,
    SUM(CASE WHEN is_used = TRUE THEN 1 ELSE 0 END) as used_count,
    ROUND(
        CASE 
            WHEN COUNT(*) > 0 THEN 
                (SUM(CASE WHEN is_used = TRUE THEN 1 ELSE 0 END) * 100.0 / COUNT(*))
            ELSE 0 
        END, 2
    ) as usage_rate,
    MIN(created_at) as first_created_at,
    MAX(created_at) as last_created_at
FROM redemption_codes
GROUP BY amount
ORDER BY amount ASC;

-- 待分配用户视图（优化版）
CREATE VIEW IF NOT EXISTS pending_distributions AS
SELECT 
    c.id as checkin_id,
    c.user_id,
    u.username,
    u.linux_do_id,
    u.avatar_url,
    c.check_in_date,
    c.check_in_time,
    c.created_at,
    ROUND((julianday('now') - julianday(c.created_at)) * 24, 1) as hours_pending
FROM check_ins c
JOIN users u ON c.user_id = u.id
WHERE c.status = 'pending_distribution'
ORDER BY c.created_at ASC;

-- 用户统计视图（新增）
CREATE VIEW IF NOT EXISTS user_stats AS
SELECT 
    u.id,
    u.username,
    u.linux_do_id,
    u.total_checkins,
    u.total_amount,
    COUNT(DISTINCT c.check_in_date) as actual_checkin_days,
    COUNT(DISTINCT CASE WHEN c.check_in_date >= date('now', '-30 days') THEN c.check_in_date END) as checkins_last_30_days,
    COUNT(DISTINCT CASE WHEN c.check_in_date >= date('now', '-7 days') THEN c.check_in_date END) as checkins_last_7_days,
    MAX(c.check_in_date) as last_checkin_date,
    SUM(CASE WHEN c.status = 'pending_distribution' THEN 1 ELSE 0 END) as pending_count
FROM users u
LEFT JOIN check_ins c ON u.id = c.user_id
WHERE u.id > 0  -- 排除系统管理员
GROUP BY u.id, u.username, u.linux_do_id, u.total_checkins, u.total_amount;

-- 每日统计视图（新增）
CREATE VIEW IF NOT EXISTS daily_stats AS
SELECT 
    check_in_date,
    COUNT(*) as total_checkins,
    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_checkins,
    COUNT(CASE WHEN status = 'pending_distribution' THEN 1 END) as pending_checkins,
    SUM(amount) as total_amount_distributed,
    COUNT(DISTINCT user_id) as unique_users
FROM check_ins
GROUP BY check_in_date
ORDER BY check_in_date DESC;

-- ============================================
-- 优化索引策略
-- ============================================

-- 用户表索引
CREATE INDEX IF NOT EXISTS idx_users_linux_do_id ON users(linux_do_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login_at);

-- 兑换码表索引（优化版）
CREATE INDEX IF NOT EXISTS idx_redemption_codes_code ON redemption_codes(code);
CREATE INDEX IF NOT EXISTS idx_redemption_codes_is_used ON redemption_codes(is_used);
CREATE INDEX IF NOT EXISTS idx_redemption_codes_amount_used ON redemption_codes(amount, is_used);
CREATE INDEX IF NOT EXISTS idx_redemption_codes_distribution ON redemption_codes(distribution_type, distribution_time);
CREATE INDEX IF NOT EXISTS idx_redemption_codes_batch_id ON redemption_codes(batch_id);
CREATE INDEX IF NOT EXISTS idx_redemption_codes_used_by ON redemption_codes(used_by);
CREATE INDEX IF NOT EXISTS idx_redemption_codes_expires_at ON redemption_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_redemption_codes_created_at ON redemption_codes(created_at);

-- 签到记录表索引（优化版）
CREATE INDEX IF NOT EXISTS idx_check_ins_user_id ON check_ins(user_id);
CREATE INDEX IF NOT EXISTS idx_check_ins_date ON check_ins(check_in_date);
CREATE INDEX IF NOT EXISTS idx_check_ins_user_date ON check_ins(user_id, check_in_date);
CREATE INDEX IF NOT EXISTS idx_check_ins_status ON check_ins(status, created_at);
CREATE INDEX IF NOT EXISTS idx_check_ins_redemption_code ON check_ins(redemption_code);
CREATE INDEX IF NOT EXISTS idx_check_ins_created_at ON check_ins(created_at);

-- 会话表索引（优化版）
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_is_active ON sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_sessions_last_accessed ON sessions(last_accessed_at);

-- 系统通知表索引
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON system_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON system_notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_user_dismissed ON system_notifications(user_id, is_dismissed, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON system_notifications(user_id, is_read, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_expires_at ON system_notifications(expires_at);
CREATE INDEX IF NOT EXISTS idx_notifications_priority ON system_notifications(priority, created_at);

-- 弹窗显示记录表索引
CREATE INDEX IF NOT EXISTS idx_modal_logs_user_type ON modal_display_logs(user_id, modal_type);
CREATE INDEX IF NOT EXISTS idx_modal_logs_user_type_key ON modal_display_logs(user_id, modal_type, modal_key);
CREATE INDEX IF NOT EXISTS idx_modal_logs_modal_key ON modal_display_logs(modal_key, display_count);
CREATE INDEX IF NOT EXISTS idx_modal_logs_dismissed ON modal_display_logs(is_dismissed, dismissed_at);
CREATE INDEX IF NOT EXISTS idx_modal_logs_notification_id ON modal_display_logs(notification_id);

-- 分发记录表索引
CREATE INDEX IF NOT EXISTS idx_distribution_logs_admin_id ON distribution_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_distribution_logs_operation_type ON distribution_logs(operation_type);
CREATE INDEX IF NOT EXISTS idx_distribution_logs_status ON distribution_logs(status);
CREATE INDEX IF NOT EXISTS idx_distribution_logs_created_at ON distribution_logs(created_at);

-- 系统配置表索引
CREATE INDEX IF NOT EXISTS idx_system_configs_key ON system_configs(config_key);
CREATE INDEX IF NOT EXISTS idx_system_configs_is_public ON system_configs(is_public);

-- 操作日志表索引
CREATE INDEX IF NOT EXISTS idx_operation_logs_user_id ON operation_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_operation_logs_type ON operation_logs(operation_type);
CREATE INDEX IF NOT EXISTS idx_operation_logs_result ON operation_logs(result);
CREATE INDEX IF NOT EXISTS idx_operation_logs_created_at ON operation_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_operation_logs_ip_address ON operation_logs(ip_address);

-- 上传批次表索引
CREATE INDEX IF NOT EXISTS idx_upload_batches_uploaded_by ON upload_batches(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_upload_batches_status ON upload_batches(upload_status);
CREATE INDEX IF NOT EXISTS idx_upload_batches_uploaded_at ON upload_batches(uploaded_at);

-- ============================================
-- 初始化系统数据
-- ============================================

-- 初始化系统管理员用户（ID=0）
INSERT OR IGNORE INTO users (id, linux_do_id, username, email, is_active, created_at)
VALUES (0, 0, 'System Admin', 'admin@system', TRUE, CURRENT_TIMESTAMP);

-- 初始化弹窗配置
INSERT OR IGNORE INTO modal_configs (modal_type, max_display_count, cooldown_minutes, auto_dismiss_seconds, description) VALUES
('gift', 1, 0, 0, '系统赠送弹窗 - 每个兑换码只显示一次'),
('pending', 1, 0, 0, '待分配弹窗 - 签到成功但无可用兑换码时显示'),
('checkin', 1, 0, 0, '签到成功弹窗 - 显示获得的兑换码'),
('system', 3, 60, 10, '系统通知弹窗 - 重要系统消息'),
('maintenance', 1, 1440, 0, '维护通知弹窗 - 系统维护时显示');

-- 初始化系统配置
INSERT OR IGNORE INTO system_configs (config_key, config_value, config_type, description, is_public) VALUES
('default_checkin_amount', '10', 'number', '默认签到兑换码金额', FALSE),
('max_checkin_per_day', '1', 'number', '每日最大签到次数', FALSE),
('system_maintenance', 'false', 'boolean', '系统维护状态', TRUE),
('maintenance_message', '系统正在维护中，请稍后再试', 'string', '维护提示信息', TRUE),
('enable_notifications', 'true', 'boolean', '是否启用系统通知', FALSE),
('notification_retention_days', '30', 'number', '通知保留天数', FALSE),
('session_timeout_hours', '168', 'number', '会话超时时间（小时）', FALSE),
('max_pending_distributions', '100', 'number', '最大待分配签到数量', FALSE),
('enable_operation_logs', 'true', 'boolean', '是否启用操作日志', FALSE),
('log_retention_days', '90', 'number', '日志保留天数', FALSE);

-- ============================================
-- 数据清理触发器（可选）
-- ============================================

-- 自动清理过期会话的触发器
CREATE TRIGGER IF NOT EXISTS cleanup_expired_sessions
AFTER INSERT ON sessions
BEGIN
    DELETE FROM sessions
    WHERE expires_at < datetime('now')
    AND session_id != NEW.session_id;
END;

-- 自动清理过期通知的触发器
CREATE TRIGGER IF NOT EXISTS cleanup_expired_notifications
AFTER INSERT ON system_notifications
BEGIN
    DELETE FROM system_notifications
    WHERE expires_at < datetime('now')
    AND is_dismissed = TRUE
    AND id != NEW.id;
END;

-- 更新用户统计信息的触发器
CREATE TRIGGER IF NOT EXISTS update_user_stats_on_checkin
AFTER INSERT ON check_ins
WHEN NEW.status = 'completed'
BEGIN
    UPDATE users
    SET
        total_checkins = total_checkins + 1,
        total_amount = total_amount + COALESCE(NEW.amount, 0),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.user_id;
END;

-- 更新用户最后登录时间的触发器
CREATE TRIGGER IF NOT EXISTS update_user_last_login
AFTER INSERT ON sessions
BEGIN
    UPDATE users
    SET
        last_login_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.user_id;
END;

-- ============================================
-- 性能优化建议
-- ============================================

-- 1. 定期执行 VACUUM 命令清理数据库
-- 2. 定期执行 ANALYZE 命令更新统计信息
-- 3. 考虑对大表进行分区（如果数据量很大）
-- 4. 定期清理过期数据（会话、通知、日志等）
-- 5. 监控慢查询并优化索引

-- 示例清理命令（可以通过定时任务执行）:
-- DELETE FROM sessions WHERE expires_at < datetime('now', '-7 days');
-- DELETE FROM system_notifications WHERE expires_at < datetime('now') AND is_dismissed = TRUE;
-- DELETE FROM operation_logs WHERE created_at < datetime('now', '-90 days');
-- DELETE FROM modal_display_logs WHERE created_at < datetime('now', '-30 days') AND is_dismissed = TRUE;
