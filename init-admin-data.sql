-- 管理员功能测试数据初始化脚本
-- 用于测试 workers-admin.js 的各项功能

-- ============================================
-- 创建测试管理员账户
-- ============================================

-- 插入测试管理员 (密码: admin123)
-- 注意：实际部署时应该使用更安全的密码和盐值
INSERT OR IGNORE INTO admins (
    username, 
    password_hash, 
    salt, 
    email, 
    role, 
    is_active, 
    created_at,
    notes
) VALUES (
    'admin',
    'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3', -- admin123 的简单hash
    'testsalt123',
    'admin@kyx.com',
    'admin',
    TRUE,
    datetime('now'),
    '测试管理员账户'
);

-- 插入另一个测试管理员
INSERT OR IGNORE INTO admins (
    username, 
    password_hash, 
    salt, 
    email, 
    role, 
    is_active, 
    created_at,
    notes
) VALUES (
    'testadmin',
    'b109f3bbbc244eb82441917ed06d618b9008dd09b3befd1b5e07394c706a8bb980b1d7785e5976ec049b46df5f1326af5a2ea6d103fd07c95385ffab0cacbc86', -- password123 的hash
    'testsalt456',
    'test@kyx.com',
    'admin',
    TRUE,
    datetime('now'),
    '测试管理员账户2'
);

-- ============================================
-- 创建测试用户数据
-- ============================================

-- 插入测试用户
INSERT OR IGNORE INTO users (
    linux_do_id,
    username,
    email,
    avatar_url,
    total_checkins,
    consecutive_days,
    max_consecutive_days,
    last_checkin_date,
    level,
    experience,
    created_at,
    updated_at,
    is_active
) VALUES 
(10001, 'testuser1', 'user1@test.com', 'https://avatar.example.com/1.jpg', 15, 5, 10, date('now'), 2, 150, datetime('now', '-30 days'), datetime('now'), TRUE),
(10002, 'testuser2', 'user2@test.com', 'https://avatar.example.com/2.jpg', 8, 3, 8, date('now', '-1 day'), 1, 80, datetime('now', '-20 days'), datetime('now'), TRUE),
(10003, 'testuser3', 'user3@test.com', 'https://avatar.example.com/3.jpg', 25, 12, 15, date('now'), 3, 250, datetime('now', '-45 days'), datetime('now'), TRUE),
(10004, 'testuser4', 'user4@test.com', 'https://avatar.example.com/4.jpg', 3, 1, 3, date('now', '-5 days'), 1, 30, datetime('now', '-10 days'), datetime('now'), TRUE),
(10005, 'inactiveuser', 'inactive@test.com', 'https://avatar.example.com/5.jpg', 1, 0, 1, date('now', '-30 days'), 1, 10, datetime('now', '-60 days'), datetime('now'), FALSE);

-- ============================================
-- 创建测试兑换码数据
-- ============================================

-- 插入测试兑换码
INSERT OR IGNORE INTO redemption_codes (
    code,
    amount,
    is_used,
    is_distributed,
    used_by,
    used_at,
    distributed_to,
    distributed_at,
    distributed_by,
    distribution_type,
    batch_id,
    created_at
) VALUES 
-- 未分配的兑换码
('TEST001ABCD', 10.00, FALSE, FALSE, NULL, NULL, NULL, NULL, NULL, NULL, 1, datetime('now', '-5 days')),
('TEST002EFGH', 15.00, FALSE, FALSE, NULL, NULL, NULL, NULL, NULL, NULL, 1, datetime('now', '-5 days')),
('TEST003IJKL', 20.00, FALSE, FALSE, NULL, NULL, NULL, NULL, NULL, NULL, 2, datetime('now', '-3 days')),
('TEST004MNOP', 25.00, FALSE, FALSE, NULL, NULL, NULL, NULL, NULL, NULL, 2, datetime('now', '-3 days')),

-- 已分配但未使用的兑换码
('DIST001QRST', 10.00, FALSE, TRUE, NULL, NULL, 1, datetime('now', '-2 days'), 1, 'manual', 3, datetime('now', '-4 days')),
('DIST002UVWX', 15.00, FALSE, TRUE, NULL, NULL, 2, datetime('now', '-1 day'), 1, 'batch', 3, datetime('now', '-4 days')),

-- 已使用的兑换码
('USED001YZAB', 10.00, TRUE, TRUE, 1, datetime('now', '-1 day'), 1, datetime('now', '-2 days'), 1, 'manual', 4, datetime('now', '-6 days')),
('USED002CDEF', 20.00, TRUE, TRUE, 3, datetime('now'), 3, datetime('now', '-1 day'), 1, 'batch', 4, datetime('now', '-6 days'));

-- ============================================
-- 创建测试签到记录
-- ============================================

-- 插入测试签到记录
INSERT OR IGNORE INTO check_ins (
    user_id,
    check_in_date,
    check_in_time,
    redemption_code,
    consecutive_days,
    reward_amount,
    status,
    created_at
) VALUES 
(1, date('now'), datetime('now'), 'USED001YZAB', 5, 10.00, 'completed', datetime('now')),
(1, date('now', '-1 day'), datetime('now', '-1 day'), NULL, 4, 8.00, 'pending', datetime('now', '-1 day')),
(1, date('now', '-2 days'), datetime('now', '-2 days'), NULL, 3, 7.00, 'completed', datetime('now', '-2 days')),
(2, date('now', '-1 day'), datetime('now', '-1 day'), 'DIST002UVWX', 3, 15.00, 'completed', datetime('now', '-1 day')),
(2, date('now', '-2 days'), datetime('now', '-2 days'), NULL, 2, 6.00, 'completed', datetime('now', '-2 days')),
(3, date('now'), datetime('now'), 'USED002CDEF', 12, 20.00, 'completed', datetime('now')),
(3, date('now', '-1 day'), datetime('now', '-1 day'), NULL, 11, 10.00, 'completed', datetime('now', '-1 day')),
(4, date('now', '-5 days'), datetime('now', '-5 days'), NULL, 1, 5.00, 'completed', datetime('now', '-5 days'));

-- ============================================
-- 创建测试批次记录
-- ============================================

INSERT OR IGNORE INTO upload_batches (
    filename,
    amount,
    total_codes,
    valid_codes,
    duplicate_codes,
    invalid_codes,
    uploaded_by,
    uploaded_at,
    processed_at,
    upload_status,
    notes
) VALUES 
('test_batch_1.txt', 10.00, 2, 2, 0, 0, 1, datetime('now', '-5 days'), datetime('now', '-5 days'), 'completed', '测试批次1'),
('test_batch_2.txt', 20.00, 2, 2, 0, 0, 1, datetime('now', '-3 days'), datetime('now', '-3 days'), 'completed', '测试批次2'),
('test_batch_3.txt', 12.50, 2, 2, 0, 0, 1, datetime('now', '-4 days'), datetime('now', '-4 days'), 'completed', '测试批次3'),
('test_batch_4.txt', 15.00, 2, 2, 0, 0, 1, datetime('now', '-6 days'), datetime('now', '-6 days'), 'completed', '测试批次4');

-- ============================================
-- 创建测试操作日志
-- ============================================

INSERT OR IGNORE INTO operation_logs (
    operator_type,
    operator_id,
    operation_type,
    operation_detail,
    target_type,
    target_id,
    result,
    created_at,
    ip_address,
    user_agent
) VALUES 
('admin', 1, 'upload', '上传兑换码批次: test_batch_1.txt', 'batch', 1, 'success', datetime('now', '-5 days'), '127.0.0.1', 'Test Browser'),
('admin', 1, 'distribute', '手动分配兑换码给用户: testuser1', 'code', 5, 'success', datetime('now', '-2 days'), '127.0.0.1', 'Test Browser'),
('admin', 1, 'generate', '生成测试兑换码', 'batch', 5, 'success', datetime('now', '-1 day'), '127.0.0.1', 'Test Browser');

-- ============================================
-- 创建测试分配日志
-- ============================================

INSERT OR IGNORE INTO distribution_logs (
    admin_id,
    operation_type,
    target_users,
    amount,
    codes_distributed,
    codes_failed,
    status,
    notes,
    created_at,
    completed_at
) VALUES 
(1, 'manual', '[1]', 10.00, 1, 0, 'success', '手动分配给testuser1', datetime('now', '-2 days'), datetime('now', '-2 days')),
(1, 'batch', '[2,3]', 15.00, 2, 0, 'success', '批量分配给多个用户', datetime('now', '-1 day'), datetime('now', '-1 day'));

-- ============================================
-- 更新统计信息
-- ============================================

-- 更新用户统计信息以匹配签到记录
UPDATE users SET 
    total_checkins = (SELECT COUNT(*) FROM check_ins WHERE user_id = users.id),
    consecutive_days = CASE 
        WHEN id = 1 THEN 5
        WHEN id = 2 THEN 3  
        WHEN id = 3 THEN 12
        WHEN id = 4 THEN 1
        ELSE 0
    END,
    last_checkin_date = (SELECT MAX(check_in_date) FROM check_ins WHERE user_id = users.id)
WHERE id IN (1, 2, 3, 4);

-- 验证数据插入
SELECT 'Admins created:' as info, COUNT(*) as count FROM admins WHERE username IN ('admin', 'testadmin');
SELECT 'Users created:' as info, COUNT(*) as count FROM users WHERE is_active = TRUE;
SELECT 'Codes created:' as info, COUNT(*) as count FROM redemption_codes;
SELECT 'Check-ins created:' as info, COUNT(*) as count FROM check_ins;
SELECT 'Batches created:' as info, COUNT(*) as count FROM upload_batches;
