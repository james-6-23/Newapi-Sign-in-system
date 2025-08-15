-- ============================================
-- KYX 签到系统 - 秘境抽奖系统数据库设计
-- 基于现有用户等级系统的完整抽奖功能
-- ============================================

-- ============================================
-- 1. 主奖品池表 - 存储所有可用奖品模板
-- ============================================

CREATE TABLE IF NOT EXISTS prize_pool (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prize_name TEXT NOT NULL,                    -- 奖品名称
    prize_description TEXT,                      -- 奖品描述
    prize_type TEXT NOT NULL,                    -- 奖品类型: redemption_code, experience, level_boost, signin_effect
    prize_value REAL NOT NULL,                   -- 奖品数值（金额/经验值/等级数）
    prize_rarity TEXT NOT NULL DEFAULT 'common', -- 稀有度: common, rare, epic, legendary
    prize_icon TEXT,                             -- 奖品图标
    prize_color TEXT DEFAULT '#3498db',          -- 奖品颜色
    effect_duration INTEGER DEFAULT 0,           -- 效果持续时间（小时，0表示永久）
    effect_multiplier REAL DEFAULT 1.0,          -- 效果倍数（用于签到增益等）
    is_punishment BOOLEAN DEFAULT FALSE,         -- 是否为惩罚类奖品
    is_active BOOLEAN DEFAULT TRUE,              -- 是否启用
    min_user_level INTEGER DEFAULT 1,            -- 最低用户等级要求
    max_user_level INTEGER DEFAULT 13,           -- 最高用户等级要求
    created_by INTEGER NOT NULL,                 -- 创建者管理员ID
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (created_by) REFERENCES admins (id)
);

-- ============================================
-- 2. 转盘配置表 - 每个等级的转盘基础配置
-- ============================================

CREATE TABLE IF NOT EXISTS wheel_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    config_name TEXT NOT NULL,                   -- 配置名称
    target_user_level INTEGER NOT NULL,          -- 目标用户等级
    max_daily_spins INTEGER DEFAULT 3,           -- 每日最大抽奖次数
    spin_cost_type TEXT DEFAULT 'free',          -- 消耗类型: free, experience, money
    spin_cost_amount REAL DEFAULT 0,             -- 消耗数量
    pity_threshold INTEGER DEFAULT 10,           -- 保底触发次数
    pity_prize_id INTEGER,                       -- 保底奖品ID
    is_active BOOLEAN DEFAULT TRUE,              -- 是否启用
    active_start_time TEXT,                      -- 活动开始时间
    active_end_time TEXT,                        -- 活动结束时间
    daily_reset_hour INTEGER DEFAULT 0,          -- 每日重置时间（小时）
    description TEXT,                            -- 转盘描述
    background_image TEXT,                       -- 转盘背景图
    created_by INTEGER NOT NULL,                 -- 创建者管理员ID
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (target_user_level) REFERENCES user_levels (id),
    FOREIGN KEY (pity_prize_id) REFERENCES prize_pool (id),
    FOREIGN KEY (created_by) REFERENCES admins (id),
    UNIQUE(target_user_level, config_name)
);

-- ============================================
-- 3. 转盘物品关联表 - 转盘中的具体奖品配置
-- ============================================

CREATE TABLE IF NOT EXISTS wheel_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wheel_config_id INTEGER NOT NULL,            -- 转盘配置ID
    prize_id INTEGER NOT NULL,                   -- 奖品ID
    probability INTEGER NOT NULL,                -- 中奖概率（1-99的整数）
    position_index INTEGER NOT NULL,             -- 在转盘中的位置（0-9）
    is_pity_item BOOLEAN DEFAULT FALSE,          -- 是否为保底物品
    weight_multiplier REAL DEFAULT 1.0,          -- 权重倍数
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (wheel_config_id) REFERENCES wheel_config (id) ON DELETE CASCADE,
    FOREIGN KEY (prize_id) REFERENCES prize_pool (id),
    UNIQUE(wheel_config_id, position_index),
    CHECK(probability >= 1 AND probability <= 99),
    CHECK(position_index >= 0 AND position_index <= 9)
);

-- ============================================
-- 4. 用户活动效果表 - 记录用户当前的时效性效果
-- ============================================

CREATE TABLE IF NOT EXISTS user_activity_effects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,                    -- 用户ID
    effect_type TEXT NOT NULL,                   -- 效果类型: signin_boost, experience_boost, level_lock
    effect_value REAL NOT NULL,                  -- 效果数值
    effect_multiplier REAL DEFAULT 1.0,          -- 效果倍数
    source_prize_id INTEGER,                     -- 来源奖品ID
    source_lottery_id INTEGER,                   -- 来源抽奖记录ID
    start_time TEXT NOT NULL,                    -- 效果开始时间
    end_time TEXT,                               -- 效果结束时间（NULL表示永久）
    is_active BOOLEAN DEFAULT TRUE,              -- 是否生效
    description TEXT,                            -- 效果描述
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users (id),
    FOREIGN KEY (source_prize_id) REFERENCES prize_pool (id),
    FOREIGN KEY (source_lottery_id) REFERENCES user_lottery_records (id)
);

-- ============================================
-- 5. 用户抽奖记录表 - 详细的抽奖历史
-- ============================================

CREATE TABLE IF NOT EXISTS user_lottery_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,                    -- 用户ID
    wheel_config_id INTEGER NOT NULL,            -- 使用的转盘配置ID
    prize_id INTEGER NOT NULL,                   -- 获得的奖品ID
    spin_result_position INTEGER NOT NULL,       -- 转盘停止位置
    is_pity_triggered BOOLEAN DEFAULT FALSE,     -- 是否触发保底
    spin_cost_type TEXT,                         -- 消耗类型
    spin_cost_amount REAL DEFAULT 0,             -- 消耗数量
    reward_delivered BOOLEAN DEFAULT FALSE,      -- 奖励是否已发放
    delivery_status TEXT DEFAULT 'pending',      -- 发放状态: pending, success, failed
    delivery_error TEXT,                         -- 发放失败原因
    user_level_at_spin INTEGER,                  -- 抽奖时用户等级
    user_experience_at_spin INTEGER,             -- 抽奖时用户经验
    spin_timestamp TEXT NOT NULL,                -- 抽奖时间戳
    ip_address TEXT,                             -- 用户IP地址
    user_agent TEXT,                             -- 用户代理
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users (id),
    FOREIGN KEY (wheel_config_id) REFERENCES wheel_config (id),
    FOREIGN KEY (prize_id) REFERENCES prize_pool (id)
);

-- ============================================
-- 6. 用户抽奖统计表 - 用户抽奖汇总数据
-- ============================================

CREATE TABLE IF NOT EXISTS user_lottery_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,                    -- 用户ID
    wheel_config_id INTEGER NOT NULL,            -- 转盘配置ID
    total_spins INTEGER DEFAULT 0,               -- 总抽奖次数
    daily_spins INTEGER DEFAULT 0,               -- 今日抽奖次数
    last_spin_date TEXT,                         -- 最后抽奖日期
    pity_counter INTEGER DEFAULT 0,              -- 保底计数器
    last_pity_reset_time TEXT,                   -- 最后保底重置时间
    total_rewards_value REAL DEFAULT 0,          -- 总奖励价值
    best_prize_rarity TEXT,                      -- 最佳奖品稀有度
    consecutive_days INTEGER DEFAULT 0,          -- 连续抽奖天数
    last_reset_time TEXT,                        -- 最后重置时间
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users (id),
    FOREIGN KEY (wheel_config_id) REFERENCES wheel_config (id),
    UNIQUE(user_id, wheel_config_id)
);

-- ============================================
-- 7. 抽奖系统配置表 - 全局系统配置
-- ============================================

CREATE TABLE IF NOT EXISTS lottery_system_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    config_key TEXT UNIQUE NOT NULL,             -- 配置键
    config_value TEXT NOT NULL,                  -- 配置值
    config_type TEXT NOT NULL,                   -- 配置类型: string, integer, float, boolean, json
    config_description TEXT,                     -- 配置描述
    is_editable BOOLEAN DEFAULT TRUE,            -- 是否可编辑
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- 8. 索引创建
-- ============================================

-- 奖品池索引
CREATE INDEX IF NOT EXISTS idx_prize_pool_type ON prize_pool(prize_type);
CREATE INDEX IF NOT EXISTS idx_prize_pool_rarity ON prize_pool(prize_rarity);
CREATE INDEX IF NOT EXISTS idx_prize_pool_level_range ON prize_pool(min_user_level, max_user_level);
CREATE INDEX IF NOT EXISTS idx_prize_pool_active ON prize_pool(is_active);

-- 转盘配置索引
CREATE INDEX IF NOT EXISTS idx_wheel_config_level ON wheel_config(target_user_level);
CREATE INDEX IF NOT EXISTS idx_wheel_config_active ON wheel_config(is_active);
CREATE INDEX IF NOT EXISTS idx_wheel_config_time ON wheel_config(active_start_time, active_end_time);

-- 转盘物品索引
CREATE INDEX IF NOT EXISTS idx_wheel_items_config ON wheel_items(wheel_config_id);
CREATE INDEX IF NOT EXISTS idx_wheel_items_prize ON wheel_items(prize_id);
CREATE INDEX IF NOT EXISTS idx_wheel_items_position ON wheel_items(wheel_config_id, position_index);

-- 用户效果索引
CREATE INDEX IF NOT EXISTS idx_user_effects_user ON user_activity_effects(user_id);
CREATE INDEX IF NOT EXISTS idx_user_effects_active ON user_activity_effects(is_active);
CREATE INDEX IF NOT EXISTS idx_user_effects_time ON user_activity_effects(start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_user_effects_type ON user_activity_effects(effect_type);

-- 抽奖记录索引
CREATE INDEX IF NOT EXISTS idx_lottery_records_user ON user_lottery_records(user_id);
CREATE INDEX IF NOT EXISTS idx_lottery_records_wheel ON user_lottery_records(wheel_config_id);
CREATE INDEX IF NOT EXISTS idx_lottery_records_time ON user_lottery_records(spin_timestamp);
CREATE INDEX IF NOT EXISTS idx_lottery_records_prize ON user_lottery_records(prize_id);
CREATE INDEX IF NOT EXISTS idx_lottery_records_delivery ON user_lottery_records(reward_delivered, delivery_status);

-- 抽奖统计索引
CREATE INDEX IF NOT EXISTS idx_lottery_stats_user ON user_lottery_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_lottery_stats_wheel ON user_lottery_stats(wheel_config_id);
CREATE INDEX IF NOT EXISTS idx_lottery_stats_date ON user_lottery_stats(last_spin_date);

-- ============================================
-- 9. 触发器 - 自动维护统计数据
-- ============================================

-- 抽奖后自动更新统计数据
CREATE TRIGGER IF NOT EXISTS update_lottery_stats_after_spin
AFTER INSERT ON user_lottery_records
FOR EACH ROW
BEGIN
    -- 更新或插入用户抽奖统计
    INSERT OR REPLACE INTO user_lottery_stats (
        user_id, wheel_config_id, total_spins, daily_spins, last_spin_date,
        pity_counter, total_rewards_value, updated_at
    ) VALUES (
        NEW.user_id,
        NEW.wheel_config_id,
        COALESCE((SELECT total_spins FROM user_lottery_stats
                 WHERE user_id = NEW.user_id AND wheel_config_id = NEW.wheel_config_id), 0) + 1,
        CASE
            WHEN date(NEW.spin_timestamp) = date('now') THEN
                COALESCE((SELECT daily_spins FROM user_lottery_stats
                         WHERE user_id = NEW.user_id AND wheel_config_id = NEW.wheel_config_id
                         AND date(last_spin_date) = date('now')), 0) + 1
            ELSE 1
        END,
        NEW.spin_timestamp,
        CASE
            WHEN NEW.is_pity_triggered = TRUE THEN 0
            ELSE COALESCE((SELECT pity_counter FROM user_lottery_stats
                          WHERE user_id = NEW.user_id AND wheel_config_id = NEW.wheel_config_id), 0) + 1
        END,
        COALESCE((SELECT total_rewards_value FROM user_lottery_stats
                 WHERE user_id = NEW.user_id AND wheel_config_id = NEW.wheel_config_id), 0) +
        COALESCE((SELECT prize_value FROM prize_pool WHERE id = NEW.prize_id), 0),
        datetime('now')
    );
END;

-- 自动清理过期效果
CREATE TRIGGER IF NOT EXISTS cleanup_expired_effects
AFTER UPDATE ON user_activity_effects
FOR EACH ROW
WHEN NEW.end_time IS NOT NULL AND datetime(NEW.end_time) <= datetime('now')
BEGIN
    UPDATE user_activity_effects
    SET is_active = FALSE
    WHERE id = NEW.id;
END;

-- ============================================
-- 10. 初始数据插入
-- ============================================

-- 插入系统配置
INSERT OR REPLACE INTO lottery_system_config (config_key, config_value, config_type, config_description) VALUES
('system_enabled', 'true', 'boolean', '抽奖系统总开关'),
('max_daily_spins_global', '10', 'integer', '全局每日最大抽奖次数'),
('pity_system_enabled', 'true', 'boolean', '保底系统开关'),
('effect_cleanup_interval', '3600', 'integer', '效果清理间隔（秒）'),
('spin_animation_duration', '3000', 'integer', '转盘动画持续时间（毫秒）'),
('reward_delivery_timeout', '30', 'integer', '奖励发放超时时间（秒）'),
('log_retention_days', '90', 'integer', '日志保留天数'),
('maintenance_mode', 'false', 'boolean', '维护模式开关');

-- 插入基础奖品池数据
INSERT OR REPLACE INTO prize_pool (
    id, prize_name, prize_description, prize_type, prize_value, prize_rarity,
    prize_icon, prize_color, effect_duration, effect_multiplier, is_punishment,
    min_user_level, max_user_level, created_by
) VALUES
-- 通用奖品（所有等级可用）
(1, '小额兑换码', '获得5元兑换码', 'redemption_code', 5.0, 'common', '💰', '#27ae60', 0, 1.0, FALSE, 1, 13, 1),
(2, '中额兑换码', '获得10元兑换码', 'redemption_code', 10.0, 'rare', '💎', '#3498db', 0, 1.0, FALSE, 1, 13, 1),
(3, '大额兑换码', '获得20元兑换码', 'redemption_code', 20.0, 'epic', '💍', '#9b59b6', 0, 1.0, FALSE, 1, 13, 1),
(4, '巨额兑换码', '获得50元兑换码', 'redemption_code', 50.0, 'legendary', '👑', '#f39c12', 0, 1.0, FALSE, 1, 13, 1),

-- 经验值奖励
(5, '经验小包', '获得50点经验值', 'experience', 50, 'common', '📚', '#27ae60', 0, 1.0, FALSE, 1, 13, 1),
(6, '经验中包', '获得100点经验值', 'experience', 100, 'rare', '📖', '#3498db', 0, 1.0, FALSE, 1, 13, 1),
(7, '经验大包', '获得200点经验值', 'experience', 200, 'epic', '📜', '#9b59b6', 0, 1.0, FALSE, 1, 13, 1),
(8, '经验巨包', '获得500点经验值', 'experience', 500, 'legendary', '🎓', '#f39c12', 0, 1.0, FALSE, 1, 13, 1),

-- 签到增益效果
(9, '签到双倍', '24小时内签到经验翻倍', 'signin_effect', 0, 'rare', '⚡', '#e74c3c', 24, 2.0, FALSE, 1, 13, 1),
(10, '签到三倍', '12小时内签到经验三倍', 'signin_effect', 0, 'epic', '🔥', '#e67e22', 12, 3.0, FALSE, 3, 13, 1),
(11, '签到五倍', '6小时内签到经验五倍', 'signin_effect', 0, 'legendary', '💫', '#f1c40f', 6, 5.0, FALSE, 5, 13, 1),

-- 惩罚类奖品
(12, '经验流失', '失去30点经验值', 'experience', -30, 'common', '💀', '#95a5a6', 0, 1.0, TRUE, 1, 13, 1),
(13, '签到减半', '24小时内签到经验减半', 'signin_effect', 0, 'common', '🐌', '#7f8c8d', 24, 0.5, TRUE, 1, 13, 1),

-- 高级奖品（高等级专用）
(14, '等级提升', '直接获得1000经验值', 'experience', 1000, 'legendary', '🌟', '#8e44ad', 0, 1.0, FALSE, 8, 13, 1),
(15, '超级兑换码', '获得100元兑换码', 'redemption_code', 100.0, 'legendary', '💸', '#c0392b', 0, 1.0, FALSE, 10, 13, 1);

-- 为每个用户等级创建基础转盘配置
INSERT OR REPLACE INTO wheel_config (
    id, config_name, target_user_level, max_daily_spins, spin_cost_type, spin_cost_amount,
    pity_threshold, pity_prize_id, is_active, description, created_by
) VALUES
(1, '炼气境转盘', 1, 3, 'free', 0, 10, 2, TRUE, '炼气境界专属转盘，适合新手修炼者', 1),
(2, '筑基境转盘', 2, 3, 'free', 0, 9, 2, TRUE, '筑基境界专属转盘，根基稳固者的选择', 1),
(3, '结丹境转盘', 3, 4, 'free', 0, 8, 3, TRUE, '结丹境界专属转盘，金丹凝聚的力量', 1),
(4, '元婴境转盘', 4, 4, 'free', 0, 8, 3, TRUE, '元婴境界专属转盘，神识强大的体现', 1),
(5, '化神境转盘', 5, 5, 'free', 0, 7, 4, TRUE, '化神境界专属转盘，掌握神通的奥秘', 1),
(6, '炼虚境转盘', 6, 5, 'free', 0, 7, 4, TRUE, '炼虚境界专属转盘，超脱凡俗的境界', 1),
(7, '合体境转盘', 7, 6, 'free', 0, 6, 4, TRUE, '合体境界专属转盘，天人合一的感悟', 1),
(8, '大乘境转盘', 8, 6, 'free', 0, 6, 8, TRUE, '大乘境界专属转盘，接近仙道的力量', 1),
(9, '真仙境转盘', 9, 7, 'free', 0, 5, 8, TRUE, '真仙境界专属转盘，超脱生死的存在', 1),
(10, '金仙境转盘', 10, 7, 'free', 0, 5, 14, TRUE, '金仙境界专属转盘，不朽不灭的体魄', 1),
(11, '太乙境转盘', 11, 8, 'free', 0, 4, 14, TRUE, '太乙境界专属转盘，掌控时空的能力', 1),
(12, '大罗境转盘', 12, 8, 'free', 0, 4, 15, TRUE, '大罗境界专属转盘，超越时空的存在', 1),
(13, '道祖境转盘', 13, 10, 'free', 0, 3, 15, TRUE, '道祖境界专属转盘，开天辟地的至尊', 1);

-- ============================================
-- 11. 转盘物品配置初始化
-- ============================================

-- 炼气境转盘配置 (ID=1)
INSERT OR REPLACE INTO wheel_items (wheel_config_id, prize_id, probability, position_index, is_pity_item) VALUES
(1, 1, 30, 0, FALSE),   -- 小额兑换码 30%
(1, 5, 25, 1, FALSE),   -- 经验小包 25%
(1, 12, 15, 2, FALSE),  -- 经验流失 15%
(1, 13, 10, 3, FALSE),  -- 签到减半 10%
(1, 2, 8, 4, FALSE),    -- 中额兑换码 8%
(1, 6, 7, 5, FALSE),    -- 经验中包 7%
(1, 9, 3, 6, FALSE),    -- 签到双倍 3%
(1, 3, 2, 7, TRUE);     -- 大额兑换码 2% (保底物品)

-- 筑基境转盘配置 (ID=2)
INSERT OR REPLACE INTO wheel_items (wheel_config_id, prize_id, probability, position_index, is_pity_item) VALUES
(2, 1, 25, 0, FALSE),   -- 小额兑换码 25%
(2, 5, 20, 1, FALSE),   -- 经验小包 20%
(2, 2, 15, 2, FALSE),   -- 中额兑换码 15%
(2, 6, 12, 3, FALSE),   -- 经验中包 12%
(2, 12, 10, 4, FALSE),  -- 经验流失 10%
(2, 9, 8, 5, FALSE),    -- 签到双倍 8%
(2, 13, 5, 6, FALSE),   -- 签到减半 5%
(2, 3, 3, 7, FALSE),    -- 大额兑换码 3%
(2, 7, 2, 8, TRUE);     -- 经验大包 2% (保底物品)

-- 结丹境转盘配置 (ID=3)
INSERT OR REPLACE INTO wheel_items (wheel_config_id, prize_id, probability, position_index, is_pity_item) VALUES
(3, 2, 22, 0, FALSE),   -- 中额兑换码 22%
(3, 6, 18, 1, FALSE),   -- 经验中包 18%
(3, 1, 15, 2, FALSE),   -- 小额兑换码 15%
(3, 7, 12, 3, FALSE),   -- 经验大包 12%
(3, 9, 10, 4, FALSE),   -- 签到双倍 10%
(3, 3, 8, 5, FALSE),    -- 大额兑换码 8%
(3, 12, 8, 6, FALSE),   -- 经验流失 8%
(3, 10, 4, 7, FALSE),   -- 签到三倍 4%
(3, 13, 2, 8, FALSE),   -- 签到减半 2%
(3, 4, 1, 9, TRUE);     -- 巨额兑换码 1% (保底物品)

-- 元婴境转盘配置 (ID=4)
INSERT OR REPLACE INTO wheel_items (wheel_config_id, prize_id, probability, position_index, is_pity_item) VALUES
(4, 2, 20, 0, FALSE),   -- 中额兑换码 20%
(4, 6, 18, 1, FALSE),   -- 经验中包 18%
(4, 7, 15, 2, FALSE),   -- 经验大包 15%
(4, 3, 12, 3, FALSE),   -- 大额兑换码 12%
(4, 9, 10, 4, FALSE),   -- 签到双倍 10%
(4, 1, 8, 5, FALSE),    -- 小额兑换码 8%
(4, 10, 6, 6, FALSE),   -- 签到三倍 6%
(4, 12, 5, 7, FALSE),   -- 经验流失 5%
(4, 4, 3, 8, FALSE),    -- 巨额兑换码 3%
(4, 8, 3, 9, TRUE);     -- 经验巨包 3% (保底物品)

-- 化神境转盘配置 (ID=5)
INSERT OR REPLACE INTO wheel_items (wheel_config_id, prize_id, probability, position_index, is_pity_item) VALUES
(5, 3, 18, 0, FALSE),   -- 大额兑换码 18%
(5, 7, 16, 1, FALSE),   -- 经验大包 16%
(5, 2, 14, 2, FALSE),   -- 中额兑换码 14%
(5, 9, 12, 3, FALSE),   -- 签到双倍 12%
(5, 6, 10, 4, FALSE),   -- 经验中包 10%
(5, 10, 8, 5, FALSE),   -- 签到三倍 8%
(5, 4, 6, 6, FALSE),    -- 巨额兑换码 6%
(5, 8, 5, 7, FALSE),    -- 经验巨包 5%
(5, 12, 5, 8, FALSE),   -- 经验流失 5%
(5, 11, 6, 9, TRUE);    -- 签到五倍 6% (保底物品)

-- 炼虚境转盘配置 (ID=6)
INSERT OR REPLACE INTO wheel_items (wheel_config_id, prize_id, probability, position_index, is_pity_item) VALUES
(6, 3, 16, 0, FALSE),   -- 大额兑换码 16%
(6, 7, 15, 1, FALSE),   -- 经验大包 15%
(6, 4, 12, 2, FALSE),   -- 巨额兑换码 12%
(6, 10, 11, 3, FALSE),  -- 签到三倍 11%
(6, 8, 10, 4, FALSE),   -- 经验巨包 10%
(6, 2, 9, 5, FALSE),    -- 中额兑换码 9%
(6, 9, 8, 6, FALSE),    -- 签到双倍 8%
(6, 11, 7, 7, FALSE),   -- 签到五倍 7%
(6, 12, 6, 8, FALSE),   -- 经验流失 6%
(6, 14, 6, 9, TRUE);    -- 等级提升 6% (保底物品)

-- 合体境转盘配置 (ID=7)
INSERT OR REPLACE INTO wheel_items (wheel_config_id, prize_id, probability, position_index, is_pity_item) VALUES
(7, 4, 15, 0, FALSE),   -- 巨额兑换码 15%
(7, 8, 14, 1, FALSE),   -- 经验巨包 14%
(7, 3, 13, 2, FALSE),   -- 大额兑换码 13%
(7, 10, 12, 3, FALSE),  -- 签到三倍 12%
(7, 7, 11, 4, FALSE),   -- 经验大包 11%
(7, 11, 10, 5, FALSE),  -- 签到五倍 10%
(7, 2, 8, 6, FALSE),    -- 中额兑换码 8%
(7, 14, 7, 7, FALSE),   -- 等级提升 7%
(7, 9, 5, 8, FALSE),    -- 签到双倍 5%
(7, 12, 5, 9, TRUE);    -- 经验流失 5% (保底物品)

-- 大乘境转盘配置 (ID=8)
INSERT OR REPLACE INTO wheel_items (wheel_config_id, prize_id, probability, position_index, is_pity_item) VALUES
(8, 4, 16, 0, FALSE),   -- 巨额兑换码 16%
(8, 8, 15, 1, FALSE),   -- 经验巨包 15%
(8, 14, 12, 2, FALSE),  -- 等级提升 12%
(8, 11, 11, 3, FALSE),  -- 签到五倍 11%
(8, 3, 10, 4, FALSE),   -- 大额兑换码 10%
(8, 10, 9, 5, FALSE),   -- 签到三倍 9%
(8, 7, 8, 6, FALSE),    -- 经验大包 8%
(8, 2, 7, 7, FALSE),    -- 中额兑换码 7%
(8, 9, 6, 8, FALSE),    -- 签到双倍 6%
(8, 12, 6, 9, TRUE);    -- 经验流失 6% (保底物品)

-- 真仙境转盘配置 (ID=9)
INSERT OR REPLACE INTO wheel_items (wheel_config_id, prize_id, probability, position_index, is_pity_item) VALUES
(9, 8, 16, 0, FALSE),   -- 经验巨包 16%
(9, 4, 15, 1, FALSE),   -- 巨额兑换码 15%
(9, 14, 13, 2, FALSE),  -- 等级提升 13%
(9, 11, 12, 3, FALSE),  -- 签到五倍 12%
(9, 3, 10, 4, FALSE),   -- 大额兑换码 10%
(9, 10, 9, 5, FALSE),   -- 签到三倍 9%
(9, 7, 8, 6, FALSE),    -- 经验大包 8%
(9, 2, 7, 7, FALSE),    -- 中额兑换码 7%
(9, 9, 5, 8, FALSE),    -- 签到双倍 5%
(9, 12, 5, 9, TRUE);    -- 经验流失 5% (保底物品)

-- 金仙境转盘配置 (ID=10)
INSERT OR REPLACE INTO wheel_items (wheel_config_id, prize_id, probability, position_index, is_pity_item) VALUES
(10, 14, 18, 0, FALSE), -- 等级提升 18%
(10, 8, 16, 1, FALSE),  -- 经验巨包 16%
(10, 4, 14, 2, FALSE),  -- 巨额兑换码 14%
(10, 11, 12, 3, FALSE), -- 签到五倍 12%
(10, 15, 8, 4, FALSE),  -- 超级兑换码 8%
(10, 3, 8, 5, FALSE),   -- 大额兑换码 8%
(10, 10, 7, 6, FALSE),  -- 签到三倍 7%
(10, 7, 6, 7, FALSE),   -- 经验大包 6%
(10, 2, 5, 8, FALSE),   -- 中额兑换码 5%
(10, 12, 6, 9, TRUE);   -- 经验流失 6% (保底物品)

-- 太乙境转盘配置 (ID=11)
INSERT OR REPLACE INTO wheel_items (wheel_config_id, prize_id, probability, position_index, is_pity_item) VALUES
(11, 14, 20, 0, FALSE), -- 等级提升 20%
(11, 15, 12, 1, FALSE), -- 超级兑换码 12%
(11, 8, 14, 2, FALSE),  -- 经验巨包 14%
(11, 11, 12, 3, FALSE), -- 签到五倍 12%
(11, 4, 10, 4, FALSE),  -- 巨额兑换码 10%
(11, 3, 8, 5, FALSE),   -- 大额兑换码 8%
(11, 10, 7, 6, FALSE),  -- 签到三倍 7%
(11, 7, 6, 7, FALSE),   -- 经验大包 6%
(11, 2, 5, 8, FALSE),   -- 中额兑换码 5%
(11, 12, 6, 9, TRUE);   -- 经验流失 6% (保底物品)

-- 大罗境转盘配置 (ID=12)
INSERT OR REPLACE INTO wheel_items (wheel_config_id, prize_id, probability, position_index, is_pity_item) VALUES
(12, 15, 18, 0, FALSE), -- 超级兑换码 18%
(12, 14, 16, 1, FALSE), -- 等级提升 16%
(12, 8, 14, 2, FALSE),  -- 经验巨包 14%
(12, 11, 12, 3, FALSE), -- 签到五倍 12%
(12, 4, 10, 4, FALSE),  -- 巨额兑换码 10%
(12, 3, 8, 5, FALSE),   -- 大额兑换码 8%
(12, 10, 6, 6, FALSE),  -- 签到三倍 6%
(12, 7, 5, 7, FALSE),   -- 经验大包 5%
(12, 2, 5, 8, FALSE),   -- 中额兑换码 5%
(12, 12, 6, 9, TRUE);   -- 经验流失 6% (保底物品)

-- 道祖境转盘配置 (ID=13)
INSERT OR REPLACE INTO wheel_items (wheel_config_id, prize_id, probability, position_index, is_pity_item) VALUES
(13, 15, 22, 0, FALSE), -- 超级兑换码 22%
(13, 14, 18, 1, FALSE), -- 等级提升 18%
(13, 8, 15, 2, FALSE),  -- 经验巨包 15%
(13, 11, 12, 3, FALSE), -- 签到五倍 12%
(13, 4, 10, 4, FALSE),  -- 巨额兑换码 10%
(13, 3, 8, 5, FALSE),   -- 大额兑换码 8%
(13, 10, 5, 6, FALSE),  -- 签到三倍 5%
(13, 7, 4, 7, FALSE),   -- 经验大包 4%
(13, 2, 3, 8, FALSE),   -- 中额兑换码 3%
(13, 12, 3, 9, TRUE);   -- 经验流失 3% (保底物品)

-- ============================================
-- 12. 数据完整性验证
-- ============================================

-- 验证所有转盘的概率总和是否为100%
-- 这个查询应该返回所有转盘ID，如果某个转盘概率不等于100%则不会出现在结果中
SELECT
    wc.id as wheel_id,
    wc.config_name,
    SUM(wi.probability) as total_probability
FROM wheel_config wc
LEFT JOIN wheel_items wi ON wc.id = wi.wheel_config_id
GROUP BY wc.id, wc.config_name
HAVING SUM(wi.probability) = 100
ORDER BY wc.id;
