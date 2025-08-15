/**
 * 获取用户的签到记录
 * @param {D1Database} db - D1 数据库实例
 * @param {number} userId - 用户 ID
 * @param {number} year - 年份
 * @param {number} month - 月份 (1-12)
 * @returns {Promise<Array>} 签到记录列表
 */
export async function getCheckInsByMonth(db, userId, year, month) {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(month).padStart(2, '0')}-31`;
  
  const results = await db.prepare(`
    SELECT check_in_date, redemption_code, created_at
    FROM check_ins
    WHERE user_id = ? AND check_in_date >= ? AND check_in_date <= ?
    ORDER BY check_in_date DESC
  `).bind(userId, startDate, endDate).all();
  
  return results.results || [];
}

/**
 * 获取用户的所有兑换码
 * @param {D1Database} db - D1 数据库实例
 * @param {number} userId - 用户 ID
 * @param {number} limit - 限制数量
 * @param {number} offset - 偏移量
 * @returns {Promise<Object>} 兑换码列表和总数
 */
export async function getUserCodes(db, userId, limit = 20, offset = 0) {
  // 获取总数
  const countResult = await db.prepare(
    'SELECT COUNT(*) as total FROM check_ins WHERE user_id = ?'
  ).bind(userId).first();
  
  // 获取兑换码列表
  const results = await db.prepare(`
    SELECT id, check_in_date, redemption_code, created_at
    FROM check_ins
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).bind(userId, limit, offset).all();
  
  return {
    codes: results.results || [],
    total: countResult.total || 0,
    limit,
    offset
  };
}

/**
 * 检查用户今日是否已签到
 * @param {D1Database} db - D1 数据库实例
 * @param {number} userId - 用户 ID
 * @returns {Promise<Object|null>} 签到记录或 null
 */
export async function getTodayCheckIn(db, userId) {
  const today = new Date().toISOString().split('T')[0];
  
  return await db.prepare(
    'SELECT * FROM check_ins WHERE user_id = ? AND check_in_date = ?'
  ).bind(userId, today).first();
}

/**
 * 创建签到记录
 * @param {D1Database} db - D1 数据库实例
 * @param {number} userId - 用户 ID
 * @param {string} code - 兑换码
 * @returns {Promise<Object>} 签到记录
 */
export async function createCheckIn(db, userId, code) {
  const today = new Date().toISOString().split('T')[0];
  
  const result = await db.prepare(`
    INSERT INTO check_ins (user_id, check_in_date, redemption_code)
    VALUES (?, ?, ?)
  `).bind(userId, today, code).run();
  
  return {
    id: result.meta.last_row_id,
    user_id: userId,
    check_in_date: today,
    redemption_code: code,
    created_at: new Date().toISOString()
  };
}

/**
 * 获取签到统计信息
 * @param {D1Database} db - D1 数据库实例
 * @param {number} userId - 用户 ID
 * @returns {Promise<Object>} 统计信息
 */
export async function getCheckInStats(db, userId) {
  // 总签到天数
  const totalResult = await db.prepare(
    'SELECT COUNT(*) as total FROM check_ins WHERE user_id = ?'
  ).bind(userId).first();
  
  // 连续签到天数（简化版本，只计算最近的连续天数）
  const recentCheckIns = await db.prepare(`
    SELECT check_in_date
    FROM check_ins
    WHERE user_id = ?
    ORDER BY check_in_date DESC
    LIMIT 30
  `).bind(userId).all();
  
  let consecutiveDays = 0;
  const today = new Date();
  const checkIns = recentCheckIns.results || [];
  
  for (let i = 0; i < checkIns.length; i++) {
    const checkInDate = new Date(checkIns[i].check_in_date);
    const expectedDate = new Date(today);
    expectedDate.setDate(expectedDate.getDate() - i);
    
    if (checkInDate.toDateString() === expectedDate.toDateString()) {
      consecutiveDays++;
    } else {
      break;
    }
  }
  
  return {
    totalDays: totalResult.total || 0,
    consecutiveDays
  };
}