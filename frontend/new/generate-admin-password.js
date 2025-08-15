/**
 * 管理员密码哈希生成工具
 * 用于生成管理员账户的密码哈希和盐值
 */

// 生成随机盐值
function generateSalt() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 16; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 密码哈希函数
async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// 生成管理员密码
async function generateAdminPassword(username, password) {
  const salt = generateSalt();
  const hash = await hashPassword(password, salt);
  
  console.log('='.repeat(60));
  console.log('管理员账户信息');
  console.log('='.repeat(60));
  console.log(`用户名: ${username}`);
  console.log(`密码: ${password}`);
  console.log(`盐值: ${salt}`);
  console.log(`哈希: ${hash}`);
  console.log('='.repeat(60));
  console.log('SQL 插入语句:');
  console.log('='.repeat(60));
  
  const now = new Date().toISOString();
  const sql = `INSERT INTO admins (username, password_hash, salt, email, created_at) VALUES ('${username}', '${hash}', '${salt}', 'admin@example.com', '${now}');`;
  
  console.log(sql);
  console.log('='.repeat(60));
  
  return { username, password, salt, hash, sql };
}

// 验证密码函数
async function verifyPassword(password, hash, salt) {
  const computedHash = await hashPassword(password, salt);
  return computedHash === hash;
}

// 测试函数
async function testPassword() {
  console.log('测试密码哈希功能...\n');
  
  // 生成默认管理员账户
  const admin1 = await generateAdminPassword('admin', 'admin123');

  console.log('\n验证密码...');
  const isValid = await verifyPassword('admin123', admin1.hash, admin1.salt);
  console.log(`密码验证结果: ${isValid ? '✅ 正确' : '❌ 错误'}`);

  // 生成另一个管理员账户
  console.log('\n' + '='.repeat(60));
  const admin2 = await generateAdminPassword('superadmin', 'SuperSecure2024!');
  
  console.log('\n验证密码...');
  const isValid2 = await verifyPassword('SuperSecure2024!', admin2.hash, admin2.salt);
  console.log(`密码验证结果: ${isValid2 ? '✅ 正确' : '❌ 错误'}`);
}

// 如果在 Node.js 环境中运行
if (typeof window === 'undefined') {
  // Node.js 环境
  const crypto = require('crypto');
  
  // 重写 crypto.subtle.digest 为 Node.js 版本
  global.crypto = {
    subtle: {
      digest: async (algorithm, data) => {
        const hash = crypto.createHash('sha256');
        hash.update(data);
        return hash.digest();
      }
    }
  };
  
  // 运行测试
  testPassword().catch(console.error);
} else {
  // 浏览器环境
  console.log('在浏览器控制台中运行以下命令:');
  console.log('generateAdminPassword("admin", "your-password")');
}

// 导出函数供外部使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    generateSalt,
    hashPassword,
    generateAdminPassword,
    verifyPassword
  };
}

// 浏览器环境下的全局函数
if (typeof window !== 'undefined') {
  window.generateSalt = generateSalt;
  window.hashPassword = hashPassword;
  window.generateAdminPassword = generateAdminPassword;
  window.verifyPassword = verifyPassword;
}

/*
使用说明:

1. Node.js 环境:
   node generate-admin-password.js

2. 浏览器环境:
   在浏览器控制台中运行:
   generateAdminPassword("admin", "your-password")

3. 手动生成:
   const salt = generateSalt();
   const hash = await hashPassword("your-password", salt);

示例输出:
============================================================
管理员账户信息
============================================================
用户名: admin
密码: admin123
盐值: Kx9mP2nQ8rT5vW7z
哈希: a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456
============================================================
SQL 插入语句:
============================================================
INSERT INTO admins (username, password_hash, salt, email, created_at) 
VALUES ('admin', 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456', 'Kx9mP2nQ8rT5vW7z', 'admin@example.com', '2024-01-01T00:00:00.000Z');
============================================================

安全提示:
1. 请使用强密码
2. 不要在生产环境中使用默认密码
3. 定期更换密码
4. 妥善保管盐值和哈希值
5. 不要在代码中硬编码密码
*/
