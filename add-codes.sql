-- 为签到系统添加兑换码的SQL脚本
-- 请在D1数据库中执行此脚本

-- 插入一些测试兑换码
INSERT INTO redemption_codes (
    code, amount, is_distributed, distributed_to, distributed_at, distribution_type, 
    is_used, used_by, used_at, created_at
) VALUES
    ('KYX12345678', 1.00, FALSE, NULL, NULL, NULL, FALSE, NULL, NULL, datetime('now')),
    ('KYX87654321', 1.00, FALSE, NULL, NULL, NULL, FALSE, NULL, NULL, datetime('now')),
    ('KYX11111111', 1.50, FALSE, NULL, NULL, NULL, FALSE, NULL, NULL, datetime('now')),
    ('KYX22222222', 1.50, FALSE, NULL, NULL, NULL, FALSE, NULL, NULL, datetime('now')),
    ('KYX33333333', 2.00, FALSE, NULL, NULL, NULL, FALSE, NULL, NULL, datetime('now')),
    ('KYX44444444', 2.00, FALSE, NULL, NULL, NULL, FALSE, NULL, NULL, datetime('now')),
    ('KYX55555555', 2.50, FALSE, NULL, NULL, NULL, FALSE, NULL, NULL, datetime('now')),
    ('KYX66666666', 2.50, FALSE, NULL, NULL, NULL, FALSE, NULL, NULL, datetime('now')),
    ('KYX77777777', 3.00, FALSE, NULL, NULL, NULL, FALSE, NULL, NULL, datetime('now')),
    ('KYX88888888', 3.00, FALSE, NULL, NULL, NULL, FALSE, NULL, NULL, datetime('now')),
    ('KYX99999999', 1.00, FALSE, NULL, NULL, NULL, FALSE, NULL, NULL, datetime('now')),
    ('KYXAAAAAAAA', 1.00, FALSE, NULL, NULL, NULL, FALSE, NULL, NULL, datetime('now')),
    ('KYXBBBBBBBB', 1.50, FALSE, NULL, NULL, NULL, FALSE, NULL, NULL, datetime('now')),
    ('KYXCCCCCCCC', 1.50, FALSE, NULL, NULL, NULL, FALSE, NULL, NULL, datetime('now')),
    ('KYXDDDDDDDD', 2.00, FALSE, NULL, NULL, NULL, FALSE, NULL, NULL, datetime('now')),
    ('KYXEEEEEEEE', 2.00, FALSE, NULL, NULL, NULL, FALSE, NULL, NULL, datetime('now')),
    ('KYXFFFFFFFF', 2.50, FALSE, NULL, NULL, NULL, FALSE, NULL, NULL, datetime('now')),
    ('KYXGGGGGGGG', 2.50, FALSE, NULL, NULL, NULL, FALSE, NULL, NULL, datetime('now')),
    ('KYXHHHHHHHH', 3.00, FALSE, NULL, NULL, NULL, FALSE, NULL, NULL, datetime('now')),
    ('KYXIIIIIIII', 3.00, FALSE, NULL, NULL, NULL, FALSE, NULL, NULL, datetime('now'));

-- 检查插入结果
SELECT 
    amount,
    COUNT(*) as count
FROM redemption_codes 
WHERE is_distributed = FALSE
GROUP BY amount
ORDER BY amount;

-- 显示总的可用兑换码数量
SELECT COUNT(*) as total_available_codes
FROM redemption_codes 
WHERE is_distributed = FALSE;
