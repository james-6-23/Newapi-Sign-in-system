-- ============================================
-- KYX 签到系统 - 管理员等级配置系统
-- 基于现有等级系统的管理员配置功能扩展
-- ============================================

-- ============================================
-- 1. 管理员权限控制表
-- ============================================

-- 管理员权限表
CREATE TABLE IF NOT EXISTS admin_permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER NOT NULL,
    permission_type TEXT NOT NULL,           -- level_config, experience_rules, rewards_config, system_settings
    permission_level TEXT NOT NULL,         -- read, write, admin
    granted_by INTEGER,                     -- 授权管理员ID
    granted_at TEXT DEFAULT (datetime('now')),
    expires_at TEXT,                        -- 权限过期时间
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT,
    FOREIGN KEY (admin_id) REFERENCES admins (id),
    FOREIGN KEY (granted_by) REFERENCES admins (id),
    UNIQUE(admin_id, permission_type)
);

-- 管理员操作日志表
CREATE TABLE IF NOT EXISTS admin_operation_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER NOT NULL,
    operation_type TEXT NOT NULL,           -- level_config_update, experience_rule_change, reward_modify
    operation_target TEXT NOT NULL,         -- 操作目标表名
    target_id INTEGER,                      -- 目标记录ID
    old_values TEXT,                        -- 修改前的值(JSON格式)
    new_values TEXT,                        -- 修改后的值(JSON格式)
    operation_reason TEXT,                  -- 操作原因
    affected_users_count INTEGER DEFAULT 0, -- 影响的用户数量
    operation_status TEXT DEFAULT 'pending', -- pending, approved, rejected, applied
    approved_by INTEGER,                    -- 审核管理员ID
    approved_at TEXT,                       -- 审核时间
    applied_at TEXT,                        -- 生效时间
    created_at TEXT DEFAULT (datetime('now')),
    ip_address TEXT,
    user_agent TEXT,
    FOREIGN KEY (admin_id) REFERENCES admins (id),
    FOREIGN KEY (approved_by) REFERENCES admins (id)
);

-- ============================================
-- 2. 等级配置版本控制表
-- ============================================

-- 等级配置版本表
CREATE TABLE IF NOT EXISTS level_config_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version_name TEXT NOT NULL,             -- 版本名称，如 "v1.0", "2024春节版"
    version_description TEXT,               -- 版本描述
    config_data TEXT NOT NULL,              -- 完整配置数据(JSON格式)
    created_by INTEGER NOT NULL,            -- 创建者管理员ID
    created_at TEXT DEFAULT (datetime('now')),
    is_active BOOLEAN DEFAULT FALSE,        -- 是否为当前生效版本
    effective_from TEXT,                    -- 生效开始时间
    effective_until TEXT,                   -- 生效结束时间
    rollback_version_id INTEGER,            -- 回滚到的版本ID
    FOREIGN KEY (created_by) REFERENCES admins (id),
    FOREIGN KEY (rollback_version_id) REFERENCES level_config_versions (id)
);

-- 等级配置变更历史表
CREATE TABLE IF NOT EXISTS level_config_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level_id INTEGER NOT NULL,
    field_name TEXT NOT NULL,               -- 字段名：required_experience, required_checkin_days等
    old_value TEXT,                         -- 旧值
    new_value TEXT,                         -- 新值
    change_reason TEXT,                     -- 变更原因
    changed_by INTEGER NOT NULL,            -- 变更管理员ID
    changed_at TEXT DEFAULT (datetime('now')),
    version_id INTEGER,                     -- 关联的版本ID
    is_reverted BOOLEAN DEFAULT FALSE,      -- 是否已回滚
    FOREIGN KEY (level_id) REFERENCES user_levels (id),
    FOREIGN KEY (changed_by) REFERENCES admins (id),
    FOREIGN KEY (version_id) REFERENCES level_config_versions (id)
);

-- ============================================
-- 3. 经验规则配置管理表
-- ============================================

-- 经验规则配置版本表
CREATE TABLE IF NOT EXISTS experience_rule_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_id INTEGER NOT NULL,
    version_number INTEGER NOT NULL,
    rule_name TEXT NOT NULL,
    rule_type TEXT NOT NULL,
    base_experience INTEGER NOT NULL,
    bonus_conditions TEXT,                  -- JSON格式的加成条件
    max_daily_gain INTEGER DEFAULT 0,
    multiplier_formula TEXT,                -- 倍数计算公式
    special_conditions TEXT,                -- 特殊条件(JSON格式)
    created_by INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    is_active BOOLEAN DEFAULT FALSE,
    effective_from TEXT,
    effective_until TEXT,
    FOREIGN KEY (rule_id) REFERENCES experience_rules (id),
    FOREIGN KEY (created_by) REFERENCES admins (id)
);

-- 经验规则变更影响分析表
CREATE TABLE IF NOT EXISTS experience_rule_impact_analysis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_version_id INTEGER NOT NULL,
    analysis_type TEXT NOT NULL,            -- user_impact, system_impact, economy_impact
    affected_user_count INTEGER DEFAULT 0,
    estimated_experience_change REAL DEFAULT 0, -- 预估经验变化
    estimated_level_changes INTEGER DEFAULT 0,  -- 预估等级变化人数
    analysis_data TEXT,                     -- 详细分析数据(JSON格式)
    analyzed_by INTEGER NOT NULL,
    analyzed_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (rule_version_id) REFERENCES experience_rule_versions (id),
    FOREIGN KEY (analyzed_by) REFERENCES admins (id)
);

-- ============================================
-- 4. 奖励配置管理表
-- ============================================

-- 奖励配置模板表
CREATE TABLE IF NOT EXISTS reward_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_name TEXT NOT NULL,
    template_description TEXT,
    reward_structure TEXT NOT NULL,         -- JSON格式的奖励结构
    applicable_levels TEXT,                 -- 适用等级范围(JSON数组)
    created_by INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    is_active BOOLEAN DEFAULT TRUE,
    usage_count INTEGER DEFAULT 0,
    FOREIGN KEY (created_by) REFERENCES admins (id)
);

-- 奖励配置变更记录表
CREATE TABLE IF NOT EXISTS reward_config_changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level_id INTEGER NOT NULL,
    reward_id INTEGER NOT NULL,
    change_type TEXT NOT NULL,              -- create, update, delete, disable
    old_reward_data TEXT,                   -- 旧奖励数据(JSON格式)
    new_reward_data TEXT,                   -- 新奖励数据(JSON格式)
    change_reason TEXT,
    changed_by INTEGER NOT NULL,
    changed_at TEXT DEFAULT (datetime('now')),
    approved_by INTEGER,
    approved_at TEXT,
    is_applied BOOLEAN DEFAULT FALSE,
    applied_at TEXT,
    FOREIGN KEY (level_id) REFERENCES user_levels (id),
    FOREIGN KEY (reward_id) REFERENCES level_rewards (id),
    FOREIGN KEY (changed_by) REFERENCES admins (id),
    FOREIGN KEY (approved_by) REFERENCES admins (id)
);

-- ============================================
-- 5. 配置审核工作流表
-- ============================================

-- 配置变更审核表
CREATE TABLE IF NOT EXISTS config_change_approvals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    change_type TEXT NOT NULL,              -- level_config, experience_rule, reward_config
    change_id INTEGER NOT NULL,             -- 对应变更记录的ID
    submitted_by INTEGER NOT NULL,          -- 提交者管理员ID
    submitted_at TEXT DEFAULT (datetime('now')),
    approval_status TEXT DEFAULT 'pending', -- pending, approved, rejected, withdrawn
    approver_id INTEGER,                    -- 审核者管理员ID
    approval_comments TEXT,                 -- 审核意见
    approved_at TEXT,                       -- 审核时间
    priority_level TEXT DEFAULT 'normal',   -- low, normal, high, urgent
    estimated_impact TEXT,                  -- 预估影响描述
    rollback_plan TEXT,                     -- 回滚计划
    FOREIGN KEY (submitted_by) REFERENCES admins (id),
    FOREIGN KEY (approver_id) REFERENCES admins (id)
);

-- 配置变更通知表
CREATE TABLE IF NOT EXISTS config_change_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    approval_id INTEGER NOT NULL,
    notification_type TEXT NOT NULL,        -- approval_request, approval_result, change_applied
    recipient_admin_id INTEGER NOT NULL,
    notification_title TEXT NOT NULL,
    notification_content TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    read_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (approval_id) REFERENCES config_change_approvals (id),
    FOREIGN KEY (recipient_admin_id) REFERENCES admins (id)
);

-- ============================================
-- 6. 系统配置参数表
-- ============================================

-- 系统配置参数表
CREATE TABLE IF NOT EXISTS system_config_parameters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    config_category TEXT NOT NULL,          -- level_system, experience_system, reward_system
    config_key TEXT NOT NULL,
    config_value TEXT NOT NULL,
    config_type TEXT NOT NULL,              -- string, integer, float, boolean, json
    config_description TEXT,
    default_value TEXT,
    validation_rules TEXT,                  -- JSON格式的验证规则
    is_editable BOOLEAN DEFAULT TRUE,
    requires_approval BOOLEAN DEFAULT FALSE,
    last_modified_by INTEGER,
    last_modified_at TEXT,
    FOREIGN KEY (last_modified_by) REFERENCES admins (id),
    UNIQUE(config_category, config_key)
);

-- ============================================
-- 7. 索引创建
-- ============================================

-- 管理员权限索引
CREATE INDEX IF NOT EXISTS idx_admin_permissions_admin ON admin_permissions(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_permissions_type ON admin_permissions(permission_type);

-- 操作日志索引
CREATE INDEX IF NOT EXISTS idx_admin_logs_admin ON admin_operation_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_logs_type ON admin_operation_logs(operation_type);
CREATE INDEX IF NOT EXISTS idx_admin_logs_created ON admin_operation_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_admin_logs_status ON admin_operation_logs(operation_status);

-- 配置版本索引
CREATE INDEX IF NOT EXISTS idx_level_versions_active ON level_config_versions(is_active);
CREATE INDEX IF NOT EXISTS idx_level_versions_created ON level_config_versions(created_at);

-- 配置历史索引
CREATE INDEX IF NOT EXISTS idx_level_history_level ON level_config_history(level_id);
CREATE INDEX IF NOT EXISTS idx_level_history_changed ON level_config_history(changed_at);

-- 经验规则版本索引
CREATE INDEX IF NOT EXISTS idx_exp_rule_versions_rule ON experience_rule_versions(rule_id);
CREATE INDEX IF NOT EXISTS idx_exp_rule_versions_active ON experience_rule_versions(is_active);

-- 审核工作流索引
CREATE INDEX IF NOT EXISTS idx_approvals_status ON config_change_approvals(approval_status);
CREATE INDEX IF NOT EXISTS idx_approvals_submitted ON config_change_approvals(submitted_at);
CREATE INDEX IF NOT EXISTS idx_approvals_type ON config_change_approvals(change_type);

-- 通知索引
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON config_change_notifications(recipient_admin_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON config_change_notifications(is_read);

-- 系统配置索引
CREATE INDEX IF NOT EXISTS idx_system_config_category ON system_config_parameters(config_category);
CREATE INDEX IF NOT EXISTS idx_system_config_key ON system_config_parameters(config_key);

-- ============================================
-- 8. 初始化管理员权限数据
-- ============================================

-- 插入默认系统配置参数
INSERT OR REPLACE INTO system_config_parameters (config_category, config_key, config_value, config_type, config_description, default_value, requires_approval) VALUES
('level_system', 'max_level', '13', 'integer', '系统最大等级数', '13', TRUE),
('level_system', 'enable_level_rewards', 'true', 'boolean', '是否启用等级奖励', 'true', TRUE),
('level_system', 'level_up_notification', 'true', 'boolean', '是否启用升级通知', 'true', FALSE),
('experience_system', 'daily_exp_limit', '1000', 'integer', '每日经验获取上限', '1000', TRUE),
('experience_system', 'consecutive_bonus_cap', '5.0', 'float', '连续签到加成上限倍数', '5.0', TRUE),
('experience_system', 'experience_decay_enabled', 'false', 'boolean', '是否启用经验衰减', 'false', TRUE),
('reward_system', 'auto_claim_rewards', 'false', 'boolean', '是否自动领取升级奖励', 'false', FALSE),
('reward_system', 'reward_expiry_days', '30', 'integer', '奖励过期天数(0表示不过期)', '30', TRUE),
('admin_system', 'require_approval_for_level_changes', 'true', 'boolean', '等级配置变更是否需要审核', 'true', FALSE),
('admin_system', 'require_approval_for_experience_changes', 'true', 'boolean', '经验规则变更是否需要审核', 'true', FALSE);

-- 为超级管理员分配所有权限（假设admin_id=1是超级管理员）
INSERT OR IGNORE INTO admin_permissions (admin_id, permission_type, permission_level, granted_by, notes) VALUES
(1, 'level_config', 'admin', 1, '超级管理员默认权限'),
(1, 'experience_rules', 'admin', 1, '超级管理员默认权限'),
(1, 'rewards_config', 'admin', 1, '超级管理员默认权限'),
(1, 'system_settings', 'admin', 1, '超级管理员默认权限');

-- ============================================
-- 9. 创建管理视图
-- ============================================

-- 管理员权限概览视图
CREATE VIEW IF NOT EXISTS admin_permissions_overview AS
SELECT 
    a.id as admin_id,
    a.username as admin_username,
    ap.permission_type,
    ap.permission_level,
    ap.granted_at,
    ap.expires_at,
    ap.is_active,
    CASE 
        WHEN ap.expires_at IS NULL THEN 'permanent'
        WHEN ap.expires_at > datetime('now') THEN 'active'
        ELSE 'expired'
    END as permission_status
FROM admins a
LEFT JOIN admin_permissions ap ON a.id = ap.admin_id
WHERE a.is_active = TRUE;

-- 配置变更统计视图
CREATE VIEW IF NOT EXISTS config_change_statistics AS
SELECT 
    DATE(created_at) as change_date,
    operation_type,
    operation_status,
    COUNT(*) as change_count,
    COUNT(DISTINCT admin_id) as admin_count
FROM admin_operation_logs
WHERE created_at >= date('now', '-30 days')
GROUP BY DATE(created_at), operation_type, operation_status
ORDER BY change_date DESC;
