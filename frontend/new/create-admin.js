/**
 * 简单的管理员账户创建工具
 * 使用方法：node create-admin.js 用户名 密码
 */

// 从命令行参数获取用户名和密码
const args = process.argv.slice(2);
const username = args[0] || 'admin';
const password = args[1] || 'admin123';

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
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256');
  hash.update(password + salt);
  return hash.digest('hex');
}

// 创建管理员账户
async function createAdmin() {
  console.log('🔐 创建管理员账户...\n');
  
  const salt = generateSalt();
  const hash = await hashPassword(password, salt);
  const now = new Date().toISOString();
  
  console.log('📋 账户信息:');
  console.log(`   用户名: ${username}`);
  console.log(`   密码: ${password}`);
  console.log(`   盐值: ${salt}`);
  console.log(`   哈希: ${hash}`);
  console.log('');
  
  const sql = `INSERT INTO admins (username, password_hash, salt, email, created_at) VALUES ('${username}', '${hash}', '${salt}', 'admin@example.com', '${now}');`;
  
  console.log('📝 执行以下命令创建管理员:');
  console.log('');
  console.log(`wrangler d1 execute kyx-checkin-system --command="${sql}"`);
  console.log('');
  
  console.log('✅ 完成！现在你可以使用以下信息登录:');
  console.log(`   用户名: ${username}`);
  console.log(`   密码: ${password}`);
  console.log('');
  console.log('⚠️  安全提示: 请在首次登录后修改密码！');
}

// 显示使用说明
if (args.includes('--help') || args.includes('-h')) {
  console.log('📖 使用说明:');
  console.log('');
  console.log('创建默认管理员 (admin/admin123):');
  console.log('  node create-admin.js');
  console.log('');
  console.log('创建自定义管理员:');
  console.log('  node create-admin.js 用户名 密码');
  console.log('');
  console.log('示例:');
  console.log('  node create-admin.js myuser mypassword123');
  console.log('  node create-admin.js admin 123456');
  console.log('');
  process.exit(0);
}

// 运行
createAdmin().catch(console.error);
