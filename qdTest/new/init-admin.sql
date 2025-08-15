-- 初始化管理员账户脚本
-- 创建默认管理员账户，用户名: admin，密码: admin123

-- 生成密码哈希（admin123 + salt）
-- 这里使用简单的示例，实际部署时应该使用更安全的密码

-- 删除现有的默认管理员（如果存在）
DELETE FROM admins WHERE username = 'admin';

-- 插入新的管理员账户
-- 密码: admin123
-- 盐值: randomsalt123456
-- 哈希: SHA256(admin123 + randomsalt123456)
INSERT INTO admins (
    username, 
    password_hash, 
    salt, 
    is_active, 
    created_at, 
    updated_at
) VALUES (
    'admin',
    'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3', -- 这是示例哈希，实际使用时需要正确计算
    'randomsalt123456',
    TRUE,
    datetime('now'),
    datetime('now')
);

-- 验证插入结果
SELECT 
    id,
    username,
    is_active,
    created_at
FROM admins 
WHERE username = 'admin';

-- 注意：
-- 1. 这个脚本仅用于开发和测试环境
-- 2. 生产环境中应该：
--    - 使用更强的密码
--    - 使用更安全的哈希算法（如bcrypt）
--    - 使用随机生成的盐值
--    - 立即修改默认密码
-- 3. 密码哈希计算示例（JavaScript）：
--    const password = 'admin123';
--    const salt = 'randomsalt123456';
--    const hash = await crypto.subtle.digest('SHA-256', 
--        new TextEncoder().encode(password + salt));
--    const hashHex = Array.from(new Uint8Array(hash))
--        .map(b => b.toString(16).padStart(2, '0')).join('');
