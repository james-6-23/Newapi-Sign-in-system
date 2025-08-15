/**
 * 生成兑换码
 * 格式: XXXX-XXXX-XXXX-XXXX
 * @returns {string} 生成的兑换码
 */
export function generateRedemptionCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const segments = 4;
  const segmentLength = 4;
  
  let code = [];
  for (let i = 0; i < segments; i++) {
    let segment = '';
    for (let j = 0; j < segmentLength; j++) {
      segment += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    code.push(segment);
  }
  
  return code.join('-');
}

/**
 * 验证兑换码格式
 * @param {string} code - 要验证的兑换码
 * @returns {boolean} 是否有效
 */
export function validateCodeFormat(code) {
  const pattern = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
  return pattern.test(code);
}