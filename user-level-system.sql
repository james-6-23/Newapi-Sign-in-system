-- ============================================
-- KYX 签到系统 - 用户等级系统实现
-- 基于修仙境界的13级等级体系
-- ============================================

-- ============================================
-- 1. 等级配置表 - 存储等级信息和升级条件
-- ============================================

CREATE TABLE IF NOT EXISTS user_levels (
    id INTEGER PRIMARY KEY,                    -- 等级ID (1-13)
    level_name TEXT NOT NULL,                  -- 等级名称
    level_description TEXT,                    -- 等级描述
    required_experience INTEGER NOT NULL,      -- 升级所需总经验值
    required_checkin_days INTEGER NOT NULL,    -- 升级所需总签到天数
    required_consecutive_days INTEGER DEFAULT 0, -- 升级所需连续签到天数
    daily_experience_bonus INTEGER DEFAULT 0,  -- 每日经验加成
    checkin_reward_multiplier REAL DEFAULT 1.0, -- 签到奖励倍数
    special_privileges TEXT,                   -- 特殊权益(JSON格式)
    level_color TEXT DEFAULT '#666666',        -- 等级颜色
    level_icon TEXT,                          -- 等级图标
    is_active BOOLEAN DEFAULT TRUE,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- 2. 用户经验记录表 - 记录经验获取历史
-- ============================================

CREATE TABLE IF NOT EXISTS user_experience_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    experience_type TEXT NOT NULL,             -- 经验类型: checkin, consecutive, bonus, special
    experience_amount INTEGER NOT NULL,        -- 获得的经验值
    source_id INTEGER,                        -- 来源ID (如签到记录ID)
    source_type TEXT,                         -- 来源类型: checkin, reward, admin_grant
    description TEXT,                         -- 经验获得描述
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users (id)
);

-- ============================================
-- 3. 用户等级历史表 - 记录等级变化
-- ============================================

CREATE TABLE IF NOT EXISTS user_level_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    old_level INTEGER NOT NULL,
    new_level INTEGER NOT NULL,
    old_experience INTEGER NOT NULL,
    new_experience INTEGER NOT NULL,
    level_up_reason TEXT,                     -- 升级原因
    level_up_time TEXT DEFAULT (datetime('now')),
    checkin_days_at_levelup INTEGER,          -- 升级时的签到天数
    consecutive_days_at_levelup INTEGER,      -- 升级时的连续签到天数
    FOREIGN KEY (user_id) REFERENCES users (id),
    FOREIGN KEY (old_level) REFERENCES user_levels (id),
    FOREIGN KEY (new_level) REFERENCES user_levels (id)
);

-- ============================================
-- 4. 等级奖励配置表 - 升级奖励
-- ============================================

CREATE TABLE IF NOT EXISTS level_rewards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level_id INTEGER NOT NULL,
    reward_type TEXT NOT NULL,                -- 奖励类型: money, experience, special
    reward_amount REAL NOT NULL,              -- 奖励数量
    reward_description TEXT,                  -- 奖励描述
    is_one_time BOOLEAN DEFAULT TRUE,         -- 是否一次性奖励
    is_active BOOLEAN DEFAULT TRUE,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (level_id) REFERENCES user_levels (id)
);

-- ============================================
-- 5. 用户等级奖励领取记录表
-- ============================================

CREATE TABLE IF NOT EXISTS user_level_rewards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    level_id INTEGER NOT NULL,
    reward_id INTEGER NOT NULL,
    reward_amount REAL NOT NULL,
    claimed_at TEXT DEFAULT (datetime('now')),
    status TEXT DEFAULT 'claimed',            -- claimed, pending, failed
    FOREIGN KEY (user_id) REFERENCES users (id),
    FOREIGN KEY (level_id) REFERENCES user_levels (id),
    FOREIGN KEY (reward_id) REFERENCES level_rewards (id),
    UNIQUE(user_id, reward_id)               -- 防止重复领取
);

-- ============================================
-- 6. 索引创建
-- ============================================

-- 用户经验记录索引
CREATE INDEX IF NOT EXISTS idx_exp_logs_user_id ON user_experience_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_exp_logs_type ON user_experience_logs(experience_type);
CREATE INDEX IF NOT EXISTS idx_exp_logs_created ON user_experience_logs(created_at);

-- 用户等级历史索引
CREATE INDEX IF NOT EXISTS idx_level_history_user_id ON user_level_history(user_id);
CREATE INDEX IF NOT EXISTS idx_level_history_time ON user_level_history(level_up_time);

-- 等级奖励索引
CREATE INDEX IF NOT EXISTS idx_level_rewards_level ON level_rewards(level_id);
CREATE INDEX IF NOT EXISTS idx_level_rewards_type ON level_rewards(reward_type);

-- 用户奖励记录索引
CREATE INDEX IF NOT EXISTS idx_user_rewards_user ON user_level_rewards(user_id);
CREATE INDEX IF NOT EXISTS idx_user_rewards_level ON user_level_rewards(level_id);

-- 用户表等级相关索引
CREATE INDEX IF NOT EXISTS idx_users_level ON users(level);
CREATE INDEX IF NOT EXISTS idx_users_experience ON users(experience);

-- ============================================
-- 7. 初始化等级数据 - 13个修仙境界
-- ============================================

INSERT OR REPLACE INTO user_levels (id, level_name, level_description, required_experience, required_checkin_days, required_consecutive_days, daily_experience_bonus, checkin_reward_multiplier, special_privileges, level_color, level_icon) VALUES
(1, '炼气', '修仙入门境界，初窥修炼门径', 0, 0, 0, 10, 1.0, '{"description": "新手修炼者，开始踏上修仙之路"}', '#8B4513', '🌱'),
(2, '筑基', '巩固根基，为后续修炼打下坚实基础', 100, 7, 3, 15, 1.1, '{"description": "根基稳固，修炼速度提升", "bonus": "签到奖励+10%"}', '#CD853F', '🏗️'),
(3, '结丹', '凝聚金丹，修为大幅提升', 300, 15, 5, 20, 1.2, '{"description": "金丹凝聚，实力大增", "bonus": "签到奖励+20%"}', '#DAA520', '💊'),
(4, '元婴', '元婴出窍，神识大增', 600, 30, 7, 25, 1.3, '{"description": "元婴境界，神识强大", "bonus": "签到奖励+30%"}', '#FF6347', '👶'),
(5, '化神', '化神通玄，掌握神通', 1000, 50, 10, 30, 1.4, '{"description": "化神境界，掌握神通", "bonus": "签到奖励+40%"}', '#FF4500', '🔮'),
(6, '炼虚', '炼化虚空，超脱凡俗', 1500, 75, 15, 35, 1.5, '{"description": "炼虚境界，超脱凡俗", "bonus": "签到奖励+50%"}', '#9370DB', '🌌'),
(7, '合体', '天人合一，与道相合', 2200, 100, 20, 40, 1.6, '{"description": "合体境界，天人合一", "bonus": "签到奖励+60%"}', '#4169E1', '☯️'),
(8, '大乘', '大乘境界，接近仙道', 3000, 150, 25, 50, 1.8, '{"description": "大乘境界，接近仙道", "bonus": "签到奖励+80%"}', '#0000FF', '🌟'),
(9, '真仙', '踏入仙境，超脱生死', 4000, 200, 30, 60, 2.0, '{"description": "真仙境界，超脱生死", "bonus": "签到奖励翻倍"}', '#FFD700', '✨'),
(10, '金仙', '金仙之体，不朽不灭', 5500, 300, 40, 75, 2.5, '{"description": "金仙境界，不朽不灭", "bonus": "签到奖励+150%"}', '#FFA500', '👑'),
(11, '太乙', '太乙境界，掌控时空', 7500, 450, 50, 100, 3.0, '{"description": "太乙境界，掌控时空", "bonus": "签到奖励+200%"}', '#FF1493', '⏰'),
(12, '大罗', '大罗金仙，超越时空', 10000, 600, 60, 150, 4.0, '{"description": "大罗金仙，超越时空", "bonus": "签到奖励+300%"}', '#DC143C', '🌠'),
(13, '道祖', '道祖境界，开天辟地', 15000, 1000, 100, 200, 5.0, '{"description": "道祖境界，开天辟地", "bonus": "签到奖励+400%"}', '#8A2BE2', '🌍');

-- ============================================
-- 8. 初始化等级奖励数据
-- ============================================

INSERT OR REPLACE INTO level_rewards (level_id, reward_type, reward_amount, reward_description) VALUES
-- 筑基奖励
(2, 'money', 20.00, '筑基成功奖励'),
(2, 'experience', 50, '筑基境界经验奖励'),

-- 结丹奖励
(3, 'money', 50.00, '结丹成功奖励'),
(3, 'experience', 100, '结丹境界经验奖励'),

-- 元婴奖励
(4, 'money', 100.00, '元婴出窍奖励'),
(4, 'experience', 200, '元婴境界经验奖励'),

-- 化神奖励
(5, 'money', 200.00, '化神通玄奖励'),
(5, 'experience', 300, '化神境界经验奖励'),

-- 炼虚奖励
(6, 'money', 350.00, '炼虚超脱奖励'),
(6, 'experience', 500, '炼虚境界经验奖励'),

-- 合体奖励
(7, 'money', 500.00, '天人合一奖励'),
(7, 'experience', 700, '合体境界经验奖励'),

-- 大乘奖励
(8, 'money', 800.00, '大乘境界奖励'),
(8, 'experience', 1000, '大乘境界经验奖励'),

-- 真仙奖励
(9, 'money', 1200.00, '踏入仙境奖励'),
(9, 'experience', 1500, '真仙境界经验奖励'),

-- 金仙奖励
(10, 'money', 2000.00, '金仙不朽奖励'),
(10, 'experience', 2500, '金仙境界经验奖励'),

-- 太乙奖励
(11, 'money', 3500.00, '太乙时空奖励'),
(11, 'experience', 4000, '太乙境界经验奖励'),

-- 大罗奖励
(12, 'money', 6000.00, '大罗金仙奖励'),
(12, 'experience', 6000, '大罗境界经验奖励'),

-- 道祖奖励
(13, 'money', 10000.00, '道祖至尊奖励'),
(13, 'experience', 10000, '道祖境界经验奖励');

-- ============================================
-- 9. 经验获取规则配置表
-- ============================================

CREATE TABLE IF NOT EXISTS experience_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_name TEXT NOT NULL,
    rule_type TEXT NOT NULL,                  -- daily_checkin, consecutive_bonus, special_event
    base_experience INTEGER NOT NULL,         -- 基础经验值
    bonus_conditions TEXT,                    -- 加成条件(JSON格式)
    max_daily_gain INTEGER DEFAULT 0,         -- 每日最大获得经验(0表示无限制)
    is_active BOOLEAN DEFAULT TRUE,
    description TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- 初始化经验规则
INSERT OR REPLACE INTO experience_rules (rule_name, rule_type, base_experience, bonus_conditions, description) VALUES
('每日签到', 'daily_checkin', 10, '{"consecutive_multiplier": 1.1}', '每日签到基础经验，连续签到有加成'),
('连续签到奖励', 'consecutive_bonus', 5, '{"min_consecutive": 3, "max_bonus": 50}', '连续签到3天以上额外经验奖励'),
('完美签到', 'perfect_checkin', 20, '{"consecutive_days": 7}', '连续签到7天完美奖励'),
('月度坚持', 'monthly_bonus', 100, '{"consecutive_days": 30}', '连续签到30天月度奖励');

-- ============================================
-- 10. 等级系统相关视图
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
    -- 下一级信息
    next_ul.id as next_level_id,
    next_ul.level_name as next_level_name,
    next_ul.required_experience as next_level_required_exp,
    (next_ul.required_experience - u.experience) as experience_to_next_level,
    -- 进度百分比
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
-- 11. 等级系统函数和触发器
-- ============================================

-- 更新用户等级的触发器
CREATE TRIGGER IF NOT EXISTS update_user_level_on_experience_change
AFTER UPDATE OF experience ON users
FOR EACH ROW
WHEN NEW.experience > OLD.experience
BEGIN
    -- 检查是否需要升级
    UPDATE users
    SET level = (
        SELECT COALESCE(MAX(id), 1)
        FROM user_levels
        WHERE required_experience <= NEW.experience
        AND required_checkin_days <= NEW.total_checkins
        AND (required_consecutive_days <= NEW.consecutive_days OR required_consecutive_days = 0)
    ),
    updated_at = datetime('now')
    WHERE id = NEW.id
    AND level < (
        SELECT COALESCE(MAX(id), 1)
        FROM user_levels
        WHERE required_experience <= NEW.experience
        AND required_checkin_days <= NEW.total_checkins
        AND (required_consecutive_days <= NEW.consecutive_days OR required_consecutive_days = 0)
    );
END;

-- 记录等级变化历史的触发器
CREATE TRIGGER IF NOT EXISTS log_level_change
AFTER UPDATE OF level ON users
FOR EACH ROW
WHEN NEW.level > OLD.level
BEGIN
    -- 记录等级变化
    INSERT INTO user_level_history (
        user_id, old_level, new_level, old_experience, new_experience,
        level_up_reason, checkin_days_at_levelup, consecutive_days_at_levelup
    ) VALUES (
        NEW.id, OLD.level, NEW.level, OLD.experience, NEW.experience,
        '经验值达到升级条件', NEW.total_checkins, NEW.consecutive_days
    );

    -- 添加升级通知到弹窗系统
    INSERT INTO modal_display_logs (
        user_id, modal_type, modal_key, display_count, is_dismissed
    ) VALUES (
        NEW.id, 'level_up', 'level_up_' || NEW.level || '_' || datetime('now'), 0, FALSE
    );
END;

-- ============================================
-- 12. 经验计算和等级检查函数 (通过应用层实现)
-- ============================================

-- 由于SQLite的限制，复杂的业务逻辑将在应用层实现
-- 以下是需要在应用层实现的关键函数：

/*
1. calculateCheckinExperience(userId, consecutiveDays)
   - 计算签到获得的经验值
   - 考虑连续签到加成和等级加成

2. checkLevelUp(userId)
   - 检查用户是否满足升级条件
   - 自动升级并发放奖励

3. grantLevelRewards(userId, newLevel)
   - 发放升级奖励
   - 记录奖励领取历史

4. getUserLevelInfo(userId)
   - 获取用户完整等级信息
   - 包括当前等级、经验、进度等

5. getLeaderboard(limit, offset)
   - 获取等级排行榜
   - 支持分页查询
*/

-- ============================================
-- 13. 数据迁移脚本 - 为现有用户初始化等级
-- ============================================

-- 为现有用户设置初始等级（基于签到天数）
UPDATE users
SET level = CASE
    WHEN total_checkins >= 1000 THEN 13  -- 道祖
    WHEN total_checkins >= 600 THEN 12   -- 大罗
    WHEN total_checkins >= 450 THEN 11   -- 太乙
    WHEN total_checkins >= 300 THEN 10   -- 金仙
    WHEN total_checkins >= 200 THEN 9    -- 真仙
    WHEN total_checkins >= 150 THEN 8    -- 大乘
    WHEN total_checkins >= 100 THEN 7    -- 合体
    WHEN total_checkins >= 75 THEN 6     -- 炼虚
    WHEN total_checkins >= 50 THEN 5     -- 化神
    WHEN total_checkins >= 30 THEN 4     -- 元婴
    WHEN total_checkins >= 15 THEN 3     -- 结丹
    WHEN total_checkins >= 7 THEN 2      -- 筑基
    ELSE 1                               -- 炼气
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
    ELSE total_checkins * 10  -- 每次签到10经验
END,
updated_at = datetime('now')
WHERE level = 1 AND experience = 0;  -- 只更新未设置等级的用户

-- ============================================
-- 14. 性能优化建议
-- ============================================

/*
性能优化建议：

1. 缓存策略：
   - 用户等级信息缓存（Redis）
   - 排行榜数据缓存
   - 等级配置数据缓存

2. 批量处理：
   - 经验值更新批量处理
   - 等级检查定时任务
   - 排行榜定时更新

3. 索引优化：
   - 复合索引：(level, experience, total_checkins)
   - 分区表：按时间分区经验日志表

4. 数据归档：
   - 定期归档历史经验记录
   - 保留最近3个月的详细记录
*/
