-- KYX 签到系统初始化数据

-- 插入用户等级配置（13级修仙境界）
INSERT INTO user_levels (level, name, required_exp, checkin_bonus, lottery_attempts, description) VALUES
(1, '练气期', 0, 1.0, 1, '修仙之路的起点，每日签到获得基础奖励'),
(2, '筑基期', 100, 1.1, 1, '筑基成功，签到奖励提升10%'),
(3, '金丹期', 300, 1.2, 2, '凝结金丹，签到奖励提升20%，每日可抽奖2次'),
(4, '元婴期', 600, 1.3, 2, '元婴出窍，签到奖励提升30%'),
(5, '化神期', 1000, 1.4, 3, '化神境界，签到奖励提升40%，每日可抽奖3次'),
(6, '炼虚期', 1500, 1.5, 3, '炼虚合道，签到奖励提升50%'),
(7, '合体期', 2200, 1.6, 4, '合体大成，签到奖励提升60%，每日可抽奖4次'),
(8, '大乘期', 3000, 1.7, 4, '大乘境界，签到奖励提升70%'),
(9, '渡劫期', 4000, 1.8, 5, '渡劫成功，签到奖励提升80%，每日可抽奖5次'),
(10, '地仙', 5500, 2.0, 5, '成就地仙，签到奖励翻倍'),
(11, '天仙', 7500, 2.2, 6, '位列天仙，签到奖励提升120%，每日可抽奖6次'),
(12, '金仙', 10000, 2.5, 6, '证道金仙，签到奖励提升150%'),
(13, '大罗金仙', 15000, 3.0, 10, '大罗境界，签到奖励提升200%，每日可抽奖10次');

-- 插入奖品池数据
INSERT INTO prize_pool (name, type, rarity, effect_data, description, icon_url) VALUES
-- 丹药类
('小还丹', 'item', 'common', '{"type": "medicine", "effect": "heal", "value": 10}', '恢复少量生命值的基础丹药', '/icons/pill-common.png'),
('大还丹', 'item', 'rare', '{"type": "medicine", "effect": "heal", "value": 50}', '恢复大量生命值的珍贵丹药', '/icons/pill-rare.png'),
('筑基丹', 'item', 'epic', '{"type": "medicine", "effect": "exp_boost", "value": 100}', '帮助突破境界的神奇丹药', '/icons/pill-epic.png'),
('九转金丹', 'item', 'legendary', '{"type": "medicine", "effect": "level_up", "value": 1}', '传说中的仙丹，可直接提升等级', '/icons/pill-legendary.png'),

-- 毒药类
('蒙汗药', 'item', 'common', '{"type": "poison", "effect": "sleep", "duration": 60}', '让人昏睡的普通毒药', '/icons/poison-common.png'),
('断肠草', 'item', 'rare', '{"type": "poison", "effect": "damage", "value": 30}', '剧毒的草药，使用需谨慎', '/icons/poison-rare.png'),
('七步断魂散', 'item', 'epic', '{"type": "poison", "effect": "curse", "duration": 3600}', '走七步即毙命的恐怖毒药', '/icons/poison-epic.png'),

-- 经验类
('修炼心得', 'experience', 'common', '{"amount": 20}', '获得20点修炼经验', '/icons/exp-common.png'),
('武学秘籍', 'experience', 'rare', '{"amount": 50}', '获得50点修炼经验', '/icons/exp-rare.png'),
('仙人指点', 'experience', 'epic', '{"amount": 100}', '获得100点修炼经验', '/icons/exp-epic.png'),

-- 兑换码类
('灵石袋', 'code', 'common', '{"amount": 1.0}', '获得1元兑换码', '/icons/code-common.png'),
('灵石包', 'code', 'rare', '{"amount": 5.0}', '获得5元兑换码', '/icons/code-rare.png'),
('灵石箱', 'code', 'epic', '{"amount": 10.0}', '获得10元兑换码', '/icons/code-epic.png'),
('灵石库', 'code', 'legendary', '{"amount": 50.0}', '获得50元兑换码', '/icons/code-legendary.png');

-- 插入转盘配置（为每个等级配置转盘）
INSERT INTO wheel_config (level, daily_attempts, guaranteed_prize, guaranteed_after) VALUES
(1, 1, true, 10),
(2, 1, true, 9),
(3, 2, true, 8),
(4, 2, true, 8),
(5, 3, true, 7),
(6, 3, true, 7),
(7, 4, true, 6),
(8, 4, true, 6),
(9, 5, true, 5),
(10, 5, true, 5),
(11, 6, true, 4),
(12, 6, true, 4),
(13, 10, true, 3);

-- 插入转盘奖品配置（以等级1为例）
INSERT INTO wheel_items (wheel_id, prize_id, probability, position) VALUES
-- 等级1转盘配置
(1, 1, 30.0, 1),  -- 小还丹 30%
(1, 9, 25.0, 2),  -- 修炼心得 25%
(1, 12, 20.0, 3), -- 灵石袋 20%
(1, 5, 15.0, 4),  -- 蒙汗药 15%
(1, 2, 8.0, 5),   -- 大还丹 8%
(1, 13, 2.0, 6);  -- 灵石包 2%

-- 插入系统配置
INSERT INTO system_config (key, value, description) VALUES
('system_name', 'KYX签到系统', '系统名称'),
('checkin_base_reward', '10', '签到基础经验奖励'),
('max_consecutive_bonus', '100', '最大连续签到奖励'),
('lottery_cooldown', '86400', '抽奖冷却时间（秒）'),
('code_expiry_days', '30', '兑换码过期天数'),
('maintenance_mode', 'false', '维护模式开关'),
('welcome_message', '欢迎来到KYX签到系统！开始您的修仙之旅吧！', '欢迎消息');

-- 创建管理员账户
INSERT INTO admins (username, password, role) VALUES
('admin', '$2b$10$rQZ9QZ9QZ9QZ9QZ9QZ9QZO', 'super_admin');

-- 注意：上面的密码是 'admin123' 的 bcrypt 哈希值
-- 实际部署时请修改为安全的密码

-- 插入一些示例兑换码（用于测试）
INSERT INTO redemption_codes (code, amount, distributed, source, batch_id) VALUES
('TEST001ABCDE', 1.00, false, 'admin', 'INIT_BATCH_001'),
('TEST002FGHIJ', 5.00, false, 'admin', 'INIT_BATCH_001'),
('TEST003KLMNO', 10.00, false, 'admin', 'INIT_BATCH_001');