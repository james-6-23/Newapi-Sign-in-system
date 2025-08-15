-- KYX 签到系统 V6 完整数据库架构
-- 支持连续签到奖励、用户等级、管理员功能等完整功能
-- 时间精确到秒，货币单位统一为$

-- ============================================
-- 用户表（完善版）
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    linux_do_id INTEGER UNIQUE NOT NULL,
    username TEXT NOT NULL,
    email TEXT,
    avatar_url TEXT,
    trust_level INTEGER DEFAULT 0,  -- 信任等级
    is_active BOOLEAN DEFAULT TRUE,
    last_login_at DATETIME,
    total_checkins INTEGER DEFAULT 0,  -- 总签到次数
    consecutive_checkins INTEGER DEFAULT 0,  -- 连续签到天数
    max_consecutive_checkins INTEGER DEFAULT 0,  -- 最大连续签到天数
    total_amount DECIMAL(10,2) DEFAULT 0,  -- 累计获得金额($)
    last_checkin_date DATE,  -- 最后签到日期
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 管理员表
-- ============================================
CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,  -- 密码哈希
    salt TEXT NOT NULL,  -- 密码盐值
    is_active BOOLEAN DEFAULT TRUE,
    last_login_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 管理员会话表
-- ============================================
CREATE TABLE IF NOT EXISTS admin_sessions (
    session_id TEXT PRIMARY KEY,
    admin_id INTEGER NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ip_address TEXT,
    user_agent TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (admin_id) REFERENCES admins(id)
);

-- ============================================
-- 上传批次表（完善版）
-- ============================================
CREATE TABLE IF NOT EXISTS upload_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    amount DECIMAL(10,2) DEFAULT 0,  -- 批次金额($)
    total_codes INTEGER NOT NULL,
    valid_codes INTEGER NOT NULL,
    duplicate_codes INTEGER NOT NULL,
    invalid_codes INTEGER DEFAULT 0,
    upload_status TEXT DEFAULT 'completed',  -- processing/completed/failed
    uploaded_by INTEGER,  -- 管理员ID
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME,
    notes TEXT,  -- 备注
    FOREIGN KEY (uploaded_by) REFERENCES admins(id)
);

-- ============================================
-- 兑换码表（完善版）
-- ============================================
CREATE TABLE IF NOT EXISTS redemption_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    amount DECIMAL(10,2) DEFAULT 0,  -- 兑换码金额($)
    is_distributed BOOLEAN DEFAULT FALSE,  -- 是否已发放
    distributed_by INTEGER,  -- 发放管理员ID
    distributed_to INTEGER,  -- 发放给用户ID
    distributed_at DATETIME,  -- 发放时间
    distribution_type TEXT DEFAULT 'checkin',  -- 发放类型: checkin/batch/manual/reward
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    batch_id INTEGER,
    expires_at DATETIME,  -- 过期时间
    notes TEXT,  -- 备注信息
    FOREIGN KEY (distributed_by) REFERENCES admins(id),
    FOREIGN KEY (distributed_to) REFERENCES users(id),
    FOREIGN KEY (batch_id) REFERENCES upload_batches(id)
);

-- ============================================
-- 签到记录表（完善版）
-- ============================================
CREATE TABLE IF NOT EXISTS check_ins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    check_in_date DATE NOT NULL,
    check_in_time DATETIME NOT NULL,  -- 精确到秒
    redemption_code TEXT,
    base_amount DECIMAL(10,2) DEFAULT 0,  -- 基础奖励金额($)
    bonus_amount DECIMAL(10,2) DEFAULT 0,  -- 连续签到奖励金额($)
    total_amount DECIMAL(10,2) DEFAULT 0,  -- 总金额($)
    consecutive_days INTEGER DEFAULT 0,  -- 当时的连续签到天数
    status TEXT DEFAULT 'completed',  -- completed/pending_distribution/failed
    ip_address TEXT,
    user_agent TEXT,
    timezone_offset INTEGER DEFAULT 480,  -- UTC+8 = 480分钟
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (redemption_code) REFERENCES redemption_codes(code),
    UNIQUE(user_id, check_in_date)
);

-- ============================================
-- 用户会话表（OAuth）
-- ============================================
CREATE TABLE IF NOT EXISTS user_sessions (
    session_id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ip_address TEXT,
    user_agent TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ============================================
-- 签到奖励配置表
-- ============================================
CREATE TABLE IF NOT EXISTS checkin_rewards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reward_type TEXT NOT NULL,  -- base/consecutive
    condition_value INTEGER DEFAULT 0,  -- 连续天数条件（base为0）
    amount DECIMAL(10,2) NOT NULL,  -- 奖励金额($)
    is_active BOOLEAN DEFAULT TRUE,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(reward_type, condition_value)
);

-- ============================================
-- 分发记录表（完善版）
-- ============================================
CREATE TABLE IF NOT EXISTS distribution_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER NOT NULL,
    operation_type TEXT NOT NULL,  -- batch/manual/ranking/unified
    target_users TEXT,  -- JSON数组存储目标用户ID
    amount DECIMAL(10,2),  -- 分发金额($)
    codes_distributed INTEGER DEFAULT 0,
    codes_failed INTEGER DEFAULT 0,
    status TEXT DEFAULT 'success',  -- success/partial/failed/processing
    error_message TEXT,
    execution_time_ms INTEGER,  -- 执行时间（毫秒）
    notes TEXT,  -- 操作备注
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY (admin_id) REFERENCES admins(id)
);

-- ============================================
-- 系统配置表（完善版）
-- ============================================
CREATE TABLE IF NOT EXISTS system_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    config_key TEXT UNIQUE NOT NULL,
    config_value TEXT NOT NULL,
    config_type TEXT DEFAULT 'string',  -- string/number/boolean/json
    category TEXT DEFAULT 'general',  -- general/checkin/reward/system
    description TEXT,
    is_public BOOLEAN DEFAULT FALSE,  -- 前端是否可访问
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 操作日志表（完善版）
-- ============================================
CREATE TABLE IF NOT EXISTS operation_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operator_type TEXT NOT NULL,  -- admin/user/system
    operator_id INTEGER,  -- 操作者ID
    operation_type TEXT NOT NULL,  -- login/logout/checkin/upload/distribute/config
    operation_detail TEXT,  -- 操作详情
    target_type TEXT,  -- 操作目标类型: user/code/config/system
    target_id TEXT,  -- 操作目标ID
    ip_address TEXT,
    user_agent TEXT,
    result TEXT DEFAULT 'success',  -- success/failed/error
    error_message TEXT,
    execution_time_ms INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 用户统计表（冗余表，提升查询性能）
-- ============================================
CREATE TABLE IF NOT EXISTS user_statistics (
    user_id INTEGER PRIMARY KEY,
    total_checkins INTEGER DEFAULT 0,
    consecutive_checkins INTEGER DEFAULT 0,
    max_consecutive_checkins INTEGER DEFAULT 0,
    total_amount DECIMAL(10,2) DEFAULT 0,
    total_codes INTEGER DEFAULT 0,
    last_checkin_date DATE,
    first_checkin_date DATE,
    checkins_this_month INTEGER DEFAULT 0,
    checkins_this_year INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ============================================
-- 排名快照表（用于排名奖励）
-- ============================================
CREATE TABLE IF NOT EXISTS ranking_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_date DATE NOT NULL,
    ranking_type TEXT NOT NULL,  -- daily/weekly/monthly
    user_id INTEGER NOT NULL,
    rank_position INTEGER NOT NULL,
    metric_value INTEGER NOT NULL,  -- 排名依据的数值
    reward_amount DECIMAL(10,2) DEFAULT 0,  -- 奖励金额($)
    is_rewarded BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(snapshot_date, ranking_type, user_id)
);

-- ============================================
-- 弹窗显示记录表
-- ============================================
CREATE TABLE IF NOT EXISTS modal_display_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    modal_type TEXT NOT NULL,  -- checkin/reward/system
    modal_key TEXT NOT NULL,  -- 弹窗唯一标识
    display_count INTEGER DEFAULT 0,
    max_display_count INTEGER DEFAULT 1,
    first_displayed_at DATETIME,
    last_displayed_at DATETIME,
    is_dismissed BOOLEAN DEFAULT FALSE,
    dismissed_at DATETIME,
    dismiss_reason TEXT,  -- user_action/copy_action/timeout/system
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(user_id, modal_type, modal_key)
);

-- ============================================
-- 弹窗配置表
-- ============================================
CREATE TABLE IF NOT EXISTS modal_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    modal_type TEXT UNIQUE NOT NULL,
    max_display_count INTEGER DEFAULT 1,
    cooldown_minutes INTEGER DEFAULT 0,
    auto_dismiss_seconds INTEGER DEFAULT 0,
    is_enabled BOOLEAN DEFAULT TRUE,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 优化索引策略
-- ============================================

-- 用户表索引
CREATE INDEX IF NOT EXISTS idx_users_linux_do_id ON users(linux_do_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_consecutive ON users(consecutive_checkins DESC);
CREATE INDEX IF NOT EXISTS idx_users_total_amount ON users(total_amount DESC);
CREATE INDEX IF NOT EXISTS idx_users_last_checkin ON users(last_checkin_date);

-- 管理员表索引
CREATE INDEX IF NOT EXISTS idx_admins_username ON admins(username);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions(expires_at);

-- 兑换码表索引
CREATE INDEX IF NOT EXISTS idx_codes_distributed ON redemption_codes(is_distributed);
CREATE INDEX IF NOT EXISTS idx_codes_amount_distributed ON redemption_codes(amount, is_distributed);
CREATE INDEX IF NOT EXISTS idx_codes_distributed_to ON redemption_codes(distributed_to);
CREATE INDEX IF NOT EXISTS idx_codes_distribution_type ON redemption_codes(distribution_type);
CREATE INDEX IF NOT EXISTS idx_codes_batch_id ON redemption_codes(batch_id);

-- 签到记录表索引
CREATE INDEX IF NOT EXISTS idx_checkins_user_date ON check_ins(user_id, check_in_date);
CREATE INDEX IF NOT EXISTS idx_checkins_date ON check_ins(check_in_date DESC);
CREATE INDEX IF NOT EXISTS idx_checkins_consecutive ON check_ins(consecutive_days DESC);
CREATE INDEX IF NOT EXISTS idx_checkins_amount ON check_ins(total_amount DESC);

-- 用户会话表索引
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);

-- 操作日志表索引
CREATE INDEX IF NOT EXISTS idx_logs_operator ON operation_logs(operator_type, operator_id);
CREATE INDEX IF NOT EXISTS idx_logs_operation_type ON operation_logs(operation_type);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON operation_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_target ON operation_logs(target_type, target_id);

-- 排名快照表索引
CREATE INDEX IF NOT EXISTS idx_ranking_date_type ON ranking_snapshots(snapshot_date, ranking_type);
CREATE INDEX IF NOT EXISTS idx_ranking_position ON ranking_snapshots(rank_position);
CREATE INDEX IF NOT EXISTS idx_ranking_rewarded ON ranking_snapshots(is_rewarded);

-- 弹窗记录表索引
CREATE INDEX IF NOT EXISTS idx_modal_user_type ON modal_display_logs(user_id, modal_type);
CREATE INDEX IF NOT EXISTS idx_modal_dismissed ON modal_display_logs(is_dismissed);

-- ============================================
-- 初始化系统数据
-- ============================================

-- 初始化默认管理员（密码需要在应用中设置）
INSERT OR IGNORE INTO admins (id, username, password_hash, salt, created_at) 
VALUES (1, 'admin', '', '', CURRENT_TIMESTAMP);

-- 初始化签到奖励配置
INSERT OR IGNORE INTO checkin_rewards (reward_type, condition_value, amount, description) VALUES
('base', 0, 10.00, '基础签到奖励'),
('consecutive', 5, 100.00, '连续签到5天奖励'),
('consecutive', 10, 500.00, '连续签到10天奖励'),
('consecutive', 15, 1000.00, '连续签到15天奖励'),
('consecutive', 30, 3000.00, '连续签到30天奖励');

-- 初始化弹窗配置
INSERT OR IGNORE INTO modal_configs (modal_type, max_display_count, cooldown_minutes, description) VALUES
('checkin', 1, 0, '签到成功弹窗'),
('reward', 1, 0, '连续签到奖励弹窗'),
('system', 3, 60, '系统通知弹窗');

-- 初始化系统配置
INSERT OR IGNORE INTO system_configs (config_key, config_value, config_type, category, description, is_public) VALUES
('timezone_offset', '480', 'number', 'general', 'UTC+8时区偏移（分钟）', TRUE),
('checkin_reset_hour', '0', 'number', 'checkin', '签到重置时间（小时）', FALSE),
('max_consecutive_break_days', '1', 'number', 'checkin', '连续签到中断容忍天数', FALSE),
('pagination_default_size', '10', 'number', 'general', '默认分页大小', TRUE),
('pagination_max_size', '50', 'number', 'general', '最大分页大小', TRUE),
('enable_ranking_rewards', 'true', 'boolean', 'reward', '是否启用排名奖励', FALSE),
('ranking_reward_top_n', '10', 'number', 'reward', '排名奖励前N名', FALSE),
('system_maintenance', 'false', 'boolean', 'system', '系统维护状态', TRUE),
('maintenance_message', '系统正在维护中，请稍后再试', 'string', 'system', '维护提示信息', TRUE);

-- ============================================
-- 数据维护触发器
-- ============================================

-- 更新用户统计信息的触发器
CREATE TRIGGER IF NOT EXISTS update_user_stats_on_checkin
AFTER INSERT ON check_ins
WHEN NEW.status = 'completed'
BEGIN
    -- 更新用户主表统计
    UPDATE users 
    SET 
        total_checkins = total_checkins + 1,
        total_amount = total_amount + NEW.total_amount,
        last_checkin_date = NEW.check_in_date,
        consecutive_checkins = NEW.consecutive_days,
        max_consecutive_checkins = MAX(max_consecutive_checkins, NEW.consecutive_days),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.user_id;
    
    -- 更新用户统计表
    INSERT OR REPLACE INTO user_statistics (
        user_id, total_checkins, consecutive_checkins, max_consecutive_checkins,
        total_amount, last_checkin_date, updated_at
    ) VALUES (
        NEW.user_id,
        (SELECT total_checkins FROM users WHERE id = NEW.user_id),
        NEW.consecutive_days,
        (SELECT max_consecutive_checkins FROM users WHERE id = NEW.user_id),
        (SELECT total_amount FROM users WHERE id = NEW.user_id),
        NEW.check_in_date,
        CURRENT_TIMESTAMP
    );
END;

-- 更新用户最后登录时间的触发器
CREATE TRIGGER IF NOT EXISTS update_user_last_login
AFTER INSERT ON user_sessions
BEGIN
    UPDATE users 
    SET 
        last_login_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.user_id;
END;

-- 自动清理过期会话的触发器
CREATE TRIGGER IF NOT EXISTS cleanup_expired_user_sessions
AFTER INSERT ON user_sessions
BEGIN
    DELETE FROM user_sessions 
    WHERE expires_at < datetime('now') 
    AND session_id != NEW.session_id;
END;

-- 自动清理过期管理员会话的触发器
CREATE TRIGGER IF NOT EXISTS cleanup_expired_admin_sessions
AFTER INSERT ON admin_sessions
BEGIN
    DELETE FROM admin_sessions 
    WHERE expires_at < datetime('now') 
    AND session_id != NEW.session_id;
END;
