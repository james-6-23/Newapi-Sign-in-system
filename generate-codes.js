/**
 * 兑换码生成脚本
 * 用于为签到系统生成足够的兑换码
 */

// 生成随机字符串
function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 生成兑换码
function generateRedemptionCode() {
  const prefix = 'KYX';
  const randomPart = generateRandomString(8);
  return `${prefix}${randomPart}`;
}

// 生成多个兑换码的SQL语句
function generateCodesSQL(count = 100, amounts = [1.0, 1.5, 2.0, 2.5, 3.0]) {
  const codes = [];
  const now = new Date().toISOString();
  
  for (let i = 0; i < count; i++) {
    const code = generateRedemptionCode();
    const amount = amounts[Math.floor(Math.random() * amounts.length)];
    
    codes.push({
      code: code,
      amount: amount,
      created_at: now
    });
  }
  
  // 生成INSERT语句
  const values = codes.map(code => 
    `('${code.code}', ${code.amount}, FALSE, NULL, NULL, NULL, FALSE, NULL, NULL, '${code.created_at}')`
  ).join(',\n    ');
  
  const sql = `INSERT INTO redemption_codes (
    code, amount, is_distributed, distributed_to, distributed_at, distribution_type, 
    is_used, used_by, used_at, created_at
) VALUES
    ${values};`;

  return { codes, sql };
}

// 生成兑换码并输出
function main() {
  console.log('=== KYX 签到系统兑换码生成器 ===\n');
  
  const { codes, sql } = generateCodesSQL(50, [1.0, 1.5, 2.0]);
  
  console.log(`生成了 ${codes.length} 个兑换码:`);
  console.log('金额分布:');
  
  const amountCounts = {};
  codes.forEach(code => {
    amountCounts[code.amount] = (amountCounts[code.amount] || 0) + 1;
  });
  
  Object.entries(amountCounts).forEach(([amount, count]) => {
    console.log(`  $${amount}: ${count} 个`);
  });
  
  console.log('\n=== SQL 插入语句 ===');
  console.log(sql);
  
  console.log('\n=== 兑换码列表 ===');
  codes.forEach((code, index) => {
    console.log(`${index + 1}. ${code.code} - $${code.amount}`);
  });
  
  return { codes, sql };
}

// 如果是在Node.js环境中运行
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    generateRandomString,
    generateRedemptionCode,
    generateCodesSQL,
    main
  };
  
  // 如果直接运行此脚本
  if (require.main === module) {
    main();
  }
}

// 如果是在浏览器环境中运行
if (typeof window !== 'undefined') {
  window.CodeGenerator = {
    generateRandomString,
    generateRedemptionCode,
    generateCodesSQL,
    main
  };
}
