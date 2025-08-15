-- KYX 签到系统 - 初始数据插入
-- 在表创建完成后执行此文件

-- ============================================
-- 插入默认签到奖励配置
-- ============================================

INSERT OR IGNORE INTO checkin_rewards (consecutive_days, reward_amount, description) VALUES
(1, 5.00, '首次签到奖励'),
(3, 8.00, '连续3天签到奖励'),
(7, 15.00, '连续7天签到奖励'),
(14, 25.00, '连续14天签到奖励'),
(30, 50.00, '连续30天签到奖励');

-- ============================================
-- 插入用户等级配置
-- ============================================

INSERT OR IGNORE INTO user_levels (level, required_experience, level_name, benefits) VALUES
(1, 0, '新手', '基础签到奖励'),
(2, 50, '熟练', '签到奖励+10%'),
(3, 150, '专家', '签到奖励+20%'),
(4, 300, '大师', '签到奖励+30%'),
(5, 500, '传奇', '签到奖励+50%'),
(6, 800, '史诗', '签到奖励+75%'),
(7, 1200, '神话', '签到奖励+100%'),
(8, 1800, '至尊', '签到奖励+150%'),
(9, 2500, '无双', '签到奖励+200%'),
(10, 3500, '超凡', '签到奖励+300%');

-- ============================================
-- 插入默认弹窗配置
-- ============================================

INSERT OR IGNORE INTO modal_configs (modal_type, max_display_count, cooldown_minutes, title, content, description) VALUES
('gift', 1, 0, '🎁 欢迎礼包', '欢迎使用 KYX 签到系统！每日签到即可获得奖励。', '系统赠送弹窗'),
('checkin_reminder', 3, 1440, '📅 签到提醒', '别忘了今天的签到哦！连续签到可以获得更多奖励。', '签到提醒弹窗'),
('reward_notification', 5, 60, '🎉 奖励通知', '恭喜您获得了签到奖励！', '奖励通知弹窗'),
('level_up', 1, 0, '🚀 等级提升', '恭喜您的等级提升了！解锁了新的奖励加成。', '升级通知弹窗'),
('streak_milestone', 1, 0, '🔥 连击里程碑', '太棒了！您达成了连续签到里程碑！', '连击里程碑弹窗'),
('welcome_back', 2, 10080, '👋 欢迎回来', '好久不见！继续您的签到之旅吧。', '回归欢迎弹窗');

-- ============================================
-- 创建索引以提升性能
-- ============================================

-- 用户表索引
CREATE INDEX IF NOT EXISTS idx_users_linux_do_id ON users(linux_do_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_last_checkin ON users(last_checkin_date);

-- 签到记录索引
CREATE INDEX IF NOT EXISTS idx_checkins_user_date ON check_ins(user_id, check_in_date);
CREATE INDEX IF NOT EXISTS idx_checkins_date ON check_ins(check_in_date);
CREATE INDEX IF NOT EXISTS idx_checkins_user_id ON check_ins(user_id);

-- 兑换码索引
CREATE INDEX IF NOT EXISTS idx_codes_distributed ON redemption_codes(is_distributed);
CREATE INDEX IF NOT EXISTS idx_codes_amount ON redemption_codes(amount);
CREATE INDEX IF NOT EXISTS idx_codes_distributed_to ON redemption_codes(distributed_to);

-- 会话索引
CREATE INDEX IF NOT EXISTS idx_sessions_session_id ON sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- 系统日志索引
CREATE INDEX IF NOT EXISTS idx_logs_type ON system_logs(log_type);
CREATE INDEX IF NOT EXISTS idx_logs_created ON system_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_logs_user_id ON system_logs(user_id);

-- 用户统计索引
CREATE INDEX IF NOT EXISTS idx_stats_user_id ON user_statistics(user_id);

-- 弹窗记录索引
CREATE INDEX IF NOT EXISTS idx_modal_logs_user_type ON user_modal_logs(user_id, modal_type);
CREATE INDEX IF NOT EXISTS idx_modal_logs_displayed ON user_modal_logs(last_displayed_at);

-- ============================================
-- 创建视图以简化查询
-- ============================================

-- 用户签到统计视图
CREATE VIEW IF NOT EXISTS user_checkin_stats AS
SELECT 
    u.id,
    u.username,
    u.total_checkins,
    u.consecutive_days,
    u.max_consecutive_days,
    u.last_checkin_date,
    u.level,
    u.experience,
    COUNT(c.id) as actual_checkins,
    MAX(c.check_in_date) as last_actual_checkin,
    SUM(c.reward_amount) as total_rewards_earned
FROM users u
LEFT JOIN check_ins c ON u.id = c.user_id
GROUP BY u.id;

-- 每日签到统计视图
CREATE VIEW IF NOT EXISTS daily_checkin_stats AS
SELECT 
    check_in_date,
    COUNT(*) as total_checkins,
    COUNT(DISTINCT user_id) as unique_users,
    SUM(reward_amount) as total_rewards,
    AVG(consecutive_days) as avg_consecutive_days
FROM check_ins
GROUP BY check_in_date
ORDER BY check_in_date DESC;

-- 兑换码库存视图
CREATE VIEW IF NOT EXISTS code_inventory AS
SELECT 
    amount,
    COUNT(*) as total_codes,
    SUM(CASE WHEN is_distributed = 0 THEN 1 ELSE 0 END) as available_codes,
    SUM(CASE WHEN is_distributed = 1 THEN 1 ELSE 0 END) as distributed_codes
FROM redemption_codes
GROUP BY amount
ORDER BY amount;

-- ============================================
-- 插入测试数据（可选）
-- ============================================

-- 注意：这些是测试数据，生产环境中可以删除

-- 插入一些测试兑换码（仅用于测试）
-- INSERT OR IGNORE INTO redemption_codes (code, amount) VALUES
-- ('TEST5-ABCD-1234', 5.00),
-- ('TEST8-EFGH-5678', 8.00),
-- ('TEST15-IJKL-9012', 15.00);

-- ============================================
-- 数据完整性检查
-- ============================================

-- 检查关键表是否创建成功
SELECT 'users' as table_name, COUNT(*) as count FROM users
UNION ALL
SELECT 'admins' as table_name, COUNT(*) as count FROM admins
UNION ALL
SELECT 'redemption_codes' as table_name, COUNT(*) as count FROM redemption_codes
UNION ALL
SELECT 'check_ins' as table_name, COUNT(*) as count FROM check_ins
UNION ALL
SELECT 'checkin_rewards' as table_name, COUNT(*) as count FROM checkin_rewards
UNION ALL
SELECT 'sessions' as table_name, COUNT(*) as count FROM sessions
UNION ALL
SELECT 'user_levels' as table_name, COUNT(*) as count FROM user_levels
UNION ALL
SELECT 'modal_configs' as table_name, COUNT(*) as count FROM modal_configs
UNION ALL
SELECT 'user_modal_logs' as table_name, COUNT(*) as count FROM user_modal_logs;
