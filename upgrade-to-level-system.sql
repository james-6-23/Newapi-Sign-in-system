-- ============================================
-- KYX 签到系统 - 等级系统升级脚本
-- 在现有数据库基础上添加等级系统功能
-- ============================================

-- 开始事务
BEGIN TRANSACTION;

-- ============================================
-- 1. 检查现有表结构
-- ============================================

-- 验证用户表是否存在必要字段
-- 如果不存在则添加（兼容性处理）
ALTER TABLE users ADD COLUMN level INTEGER DEFAULT 1;
ALTER TABLE users ADD COLUMN experience INTEGER DEFAULT 0;

-- 更新现有用户的updated_at字段格式（如果需要）
UPDATE users SET updated_at = datetime('now') WHERE updated_at IS NULL;

-- ============================================
-- 2. 创建等级系统核心表
-- ============================================

-- 等级配置表
CREATE TABLE IF NOT EXISTS user_levels (
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
);

-- 用户经验记录表
CREATE TABLE IF NOT EXISTS user_experience_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    experience_type TEXT NOT NULL,
    experience_amount INTEGER NOT NULL,
    source_id INTEGER,
    source_type TEXT,
    description TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users (id)
);

-- 用户等级历史表
CREATE TABLE IF NOT EXISTS user_level_history (
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
);

-- 等级奖励配置表
CREATE TABLE IF NOT EXISTS level_rewards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level_id INTEGER NOT NULL,
    reward_type TEXT NOT NULL,
    reward_amount REAL NOT NULL,
    reward_description TEXT,
    is_one_time BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (level_id) REFERENCES user_levels (id)
);

-- 用户等级奖励领取记录表
CREATE TABLE IF NOT EXISTS user_level_rewards (
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
);

-- 经验获取规则配置表
CREATE TABLE IF NOT EXISTS experience_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_name TEXT NOT NULL,
    rule_type TEXT NOT NULL,
    base_experience INTEGER NOT NULL,
    bonus_conditions TEXT,
    max_daily_gain INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    description TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- 3. 创建索引
-- ============================================

-- 用户表等级相关索引
CREATE INDEX IF NOT EXISTS idx_users_level ON users(level);
CREATE INDEX IF NOT EXISTS idx_users_experience ON users(experience);
CREATE INDEX IF NOT EXISTS idx_users_level_exp ON users(level, experience);

-- 经验记录索引
CREATE INDEX IF NOT EXISTS idx_exp_logs_user_id ON user_experience_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_exp_logs_type ON user_experience_logs(experience_type);
CREATE INDEX IF NOT EXISTS idx_exp_logs_created ON user_experience_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_exp_logs_user_date ON user_experience_logs(user_id, date(created_at));

-- 等级历史索引
CREATE INDEX IF NOT EXISTS idx_level_history_user_id ON user_level_history(user_id);
CREATE INDEX IF NOT EXISTS idx_level_history_time ON user_level_history(level_up_time);

-- 等级奖励索引
CREATE INDEX IF NOT EXISTS idx_level_rewards_level ON level_rewards(level_id);
CREATE INDEX IF NOT EXISTS idx_user_rewards_user ON user_level_rewards(user_id);

-- ============================================
-- 4. 创建视图
-- ============================================

-- 用户等级详情视图
CREATE VIEW IF NOT EXISTS user_level_details AS
SELECT 
    u.id as user_id,
    u.username,
    u.level as current_level,
    u.experience as current_experience,
    ul.level_name as current_level_name,
    ul.level_description,
    ul.level_color,
    ul.level_icon,
    ul.checkin_reward_multiplier,
    ul.special_privileges,
    u.total_checkins,
    u.consecutive_days,
    u.max_consecutive_days,
    next_ul.id as next_level_id,
    next_ul.level_name as next_level_name,
    next_ul.required_experience as next_level_required_exp,
    (next_ul.required_experience - u.experience) as experience_to_next_level,
    CASE 
        WHEN next_ul.required_experience IS NULL THEN 100.0
        ELSE ROUND((u.experience * 100.0) / next_ul.required_experience, 2)
    END as level_progress_percent
FROM users u
LEFT JOIN user_levels ul ON u.level = ul.id
LEFT JOIN user_levels next_ul ON u.level + 1 = next_ul.id
WHERE u.is_active = TRUE;

-- 等级排行榜视图
CREATE VIEW IF NOT EXISTS level_leaderboard AS
SELECT 
    u.id,
    u.username,
    u.level,
    ul.level_name,
    ul.level_color,
    ul.level_icon,
    u.experience,
    u.total_checkins,
    u.consecutive_days,
    u.max_consecutive_days,
    ROW_NUMBER() OVER (ORDER BY u.level DESC, u.experience DESC, u.total_checkins DESC) as rank
FROM users u
LEFT JOIN user_levels ul ON u.level = ul.id
WHERE u.is_active = TRUE
ORDER BY u.level DESC, u.experience DESC, u.total_checkins DESC;

-- ============================================
-- 5. 插入初始数据
-- ============================================

-- 插入13个修仙境界等级
INSERT OR REPLACE INTO user_levels (id, level_name, level_description, required_experience, required_checkin_days, required_consecutive_days, daily_experience_bonus, checkin_reward_multiplier, special_privileges, level_color, level_icon) VALUES
(1, '炼气', '修仙入门境界，初窥修炼门径', 0, 0, 0, 10, 1.0, '{"description": "新手修炼者"}', '#8B4513', '🌱'),
(2, '筑基', '巩固根基，为后续修炼打下坚实基础', 100, 7, 3, 15, 1.1, '{"description": "根基稳固", "bonus": "签到奖励+10%"}', '#CD853F', '🏗️'),
(3, '结丹', '凝聚金丹，修为大幅提升', 300, 15, 5, 20, 1.2, '{"description": "金丹凝聚", "bonus": "签到奖励+20%"}', '#DAA520', '💊'),
(4, '元婴', '元婴出窍，神识大增', 600, 30, 7, 25, 1.3, '{"description": "元婴境界", "bonus": "签到奖励+30%"}', '#FF6347', '👶'),
(5, '化神', '化神通玄，掌握神通', 1000, 50, 10, 30, 1.4, '{"description": "化神境界", "bonus": "签到奖励+40%"}', '#FF4500', '🔮'),
(6, '炼虚', '炼化虚空，超脱凡俗', 1500, 75, 15, 35, 1.5, '{"description": "炼虚境界", "bonus": "签到奖励+50%"}', '#9370DB', '🌌'),
(7, '合体', '天人合一，与道相合', 2200, 100, 20, 40, 1.6, '{"description": "合体境界", "bonus": "签到奖励+60%"}', '#4169E1', '☯️'),
(8, '大乘', '大乘境界，接近仙道', 3000, 150, 25, 50, 1.8, '{"description": "大乘境界", "bonus": "签到奖励+80%"}', '#0000FF', '🌟'),
(9, '真仙', '踏入仙境，超脱生死', 4000, 200, 30, 60, 2.0, '{"description": "真仙境界", "bonus": "签到奖励翻倍"}', '#FFD700', '✨'),
(10, '金仙', '金仙之体，不朽不灭', 5500, 300, 40, 75, 2.5, '{"description": "金仙境界", "bonus": "签到奖励+150%"}', '#FFA500', '👑'),
(11, '太乙', '太乙境界，掌控时空', 7500, 450, 50, 100, 3.0, '{"description": "太乙境界", "bonus": "签到奖励+200%"}', '#FF1493', '⏰'),
(12, '大罗', '大罗金仙，超越时空', 10000, 600, 60, 150, 4.0, '{"description": "大罗金仙", "bonus": "签到奖励+300%"}', '#DC143C', '🌠'),
(13, '道祖', '道祖境界，开天辟地', 15000, 1000, 100, 200, 5.0, '{"description": "道祖境界", "bonus": "签到奖励+400%"}', '#8A2BE2', '🌍');

-- 插入等级奖励
INSERT OR REPLACE INTO level_rewards (level_id, reward_type, reward_amount, reward_description) VALUES
(2, 'money', 20.00, '筑基成功奖励'),
(3, 'money', 50.00, '结丹成功奖励'),
(4, 'money', 100.00, '元婴出窍奖励'),
(5, 'money', 200.00, '化神通玄奖励'),
(6, 'money', 350.00, '炼虚超脱奖励'),
(7, 'money', 500.00, '天人合一奖励'),
(8, 'money', 800.00, '大乘境界奖励'),
(9, 'money', 1200.00, '踏入仙境奖励'),
(10, 'money', 2000.00, '金仙不朽奖励'),
(11, 'money', 3500.00, '太乙时空奖励'),
(12, 'money', 6000.00, '大罗金仙奖励'),
(13, 'money', 10000.00, '道祖至尊奖励');

-- 插入经验规则
INSERT OR REPLACE INTO experience_rules (rule_name, rule_type, base_experience, bonus_conditions, description) VALUES
('每日签到', 'daily_checkin', 10, '{"consecutive_multiplier": 1.1}', '每日签到基础经验'),
('连续签到奖励', 'consecutive_bonus', 5, '{"min_consecutive": 3}', '连续签到3天以上额外奖励'),
('完美签到', 'perfect_checkin', 20, '{"consecutive_days": 7}', '连续签到7天完美奖励'),
('月度坚持', 'monthly_bonus', 100, '{"consecutive_days": 30}', '连续签到30天月度奖励');

-- ============================================
-- 6. 数据迁移 - 为现有用户设置等级
-- ============================================

-- 根据签到天数为现有用户分配合适的等级和经验
UPDATE users 
SET 
    level = CASE 
        WHEN total_checkins >= 1000 THEN 13
        WHEN total_checkins >= 600 THEN 12
        WHEN total_checkins >= 450 THEN 11
        WHEN total_checkins >= 300 THEN 10
        WHEN total_checkins >= 200 THEN 9
        WHEN total_checkins >= 150 THEN 8
        WHEN total_checkins >= 100 THEN 7
        WHEN total_checkins >= 75 THEN 6
        WHEN total_checkins >= 50 THEN 5
        WHEN total_checkins >= 30 THEN 4
        WHEN total_checkins >= 15 THEN 3
        WHEN total_checkins >= 7 THEN 2
        ELSE 1
    END,
    experience = CASE 
        WHEN total_checkins >= 1000 THEN 15000
        WHEN total_checkins >= 600 THEN 10000
        WHEN total_checkins >= 450 THEN 7500
        WHEN total_checkins >= 300 THEN 5500
        WHEN total_checkins >= 200 THEN 4000
        WHEN total_checkins >= 150 THEN 3000
        WHEN total_checkins >= 100 THEN 2200
        WHEN total_checkins >= 75 THEN 1500
        WHEN total_checkins >= 50 THEN 1000
        WHEN total_checkins >= 30 THEN 600
        WHEN total_checkins >= 15 THEN 300
        WHEN total_checkins >= 7 THEN 100
        ELSE GREATEST(total_checkins * 10, 0)
    END,
    updated_at = datetime('now')
WHERE (level = 1 AND experience = 0) OR level IS NULL OR experience IS NULL;

-- ============================================
-- 7. 更新弹窗配置（如果表存在）
-- ============================================

-- 添加升级通知弹窗配置
INSERT OR IGNORE INTO modal_configs (modal_type, max_display_count, cooldown_minutes, description) VALUES
('level_up', 1, 0, '升级通知弹窗');

-- ============================================
-- 8. 验证数据完整性
-- ============================================

-- 检查等级数据
SELECT 'Level Distribution:' as info;
SELECT 
    ul.level_name,
    COUNT(u.id) as user_count
FROM user_levels ul
LEFT JOIN users u ON ul.id = u.level
GROUP BY ul.id, ul.level_name
ORDER BY ul.id;

-- 检查经验分布
SELECT 'Experience Distribution:' as info;
SELECT 
    CASE 
        WHEN experience < 100 THEN '0-99'
        WHEN experience < 500 THEN '100-499'
        WHEN experience < 1000 THEN '500-999'
        WHEN experience < 5000 THEN '1000-4999'
        ELSE '5000+'
    END as exp_range,
    COUNT(*) as user_count
FROM users
WHERE is_active = TRUE
GROUP BY 
    CASE 
        WHEN experience < 100 THEN '0-99'
        WHEN experience < 500 THEN '100-499'
        WHEN experience < 1000 THEN '500-999'
        WHEN experience < 5000 THEN '1000-4999'
        ELSE '5000+'
    END
ORDER BY MIN(experience);

-- 提交事务
COMMIT;

-- ============================================
-- 9. 升级完成信息
-- ============================================

SELECT '🎉 等级系统升级完成！' as message;
SELECT '📊 系统统计:' as info;
SELECT COUNT(*) as total_users FROM users WHERE is_active = TRUE;
SELECT COUNT(*) as total_levels FROM user_levels;
SELECT COUNT(*) as total_rewards FROM level_rewards;

-- 显示升级后的用户等级分布
SELECT 
    '等级分布:' as distribution,
    ul.level_name,
    COUNT(u.id) as user_count,
    ROUND(COUNT(u.id) * 100.0 / (SELECT COUNT(*) FROM users WHERE is_active = TRUE), 1) as percentage
FROM user_levels ul
LEFT JOIN users u ON ul.id = u.level AND u.is_active = TRUE
GROUP BY ul.id, ul.level_name
ORDER BY ul.id;
