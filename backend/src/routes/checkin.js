import { generateRedemptionCode } from '../utils/code.js';
import { getTodayCheckIn, createCheckIn, getCheckInsByMonth, getCheckInStats } from '../utils/db.js';
import { jsonResponse, errorResponse } from '../middleware/auth.js';

/**
 * 处理签到请求
 */
export async function handleCheckIn(request, env) {
  const session = request.session;
  
  if (!session) {
    return errorResponse('未登录', 401, request, env);
  }
  
  try {
    // 检查今日是否已签到
    const existingCheckIn = await getTodayCheckIn(env.DB, session.user_id);
    
    if (existingCheckIn) {
      return jsonResponse({
        success: false,
        message: '今日已签到',
        code: existingCheckIn.redemption_code,
        checkedIn: true
      }, 200, request, env);
    }
    
    // 生成兑换码
    const code = generateRedemptionCode();
    
    // 创建签到记录
    const checkIn = await createCheckIn(env.DB, session.user_id, code);
    
    // 获取签到统计
    const stats = await getCheckInStats(env.DB, session.user_id);
    
    return jsonResponse({
      success: true,
      message: '签到成功！',
      code: code,
      checkIn: checkIn,
      stats: stats
    }, 200, request, env);
  } catch (error) {
    console.error('签到失败:', error);
    return errorResponse('签到失败: ' + error.message, 500, request, env);
  }
}

/**
 * 检查今日是否已签到
 */
export async function handleCheckTodayStatus(request, env) {
  const session = request.session;
  
  if (!session) {
    return errorResponse('未登录', 401, request, env);
  }
  
  try {
    const checkIn = await getTodayCheckIn(env.DB, session.user_id);
    const stats = await getCheckInStats(env.DB, session.user_id);
    
    return jsonResponse({
      checkedIn: !!checkIn,
      code: checkIn?.redemption_code || null,
      stats: stats
    }, 200, request, env);
  } catch (error) {
    console.error('检查签到状态失败:', error);
    return errorResponse('检查签到状态失败: ' + error.message, 500, request, env);
  }
}

/**
 * 获取签到日历数据
 */
export async function handleGetCalendar(request, env) {
  const session = request.session;
  
  if (!session) {
    return errorResponse('未登录', 401, request, env);
  }
  
  try {
    const url = new URL(request.url);
    const year = parseInt(url.searchParams.get('year')) || new Date().getFullYear();
    const month = parseInt(url.searchParams.get('month')) || new Date().getMonth() + 1;
    
    // 验证参数
    if (year < 2020 || year > 2100 || month < 1 || month > 12) {
      return errorResponse('无效的年月参数', 400, request, env);
    }
    
    const checkIns = await getCheckInsByMonth(env.DB, session.user_id, year, month);
    
    // 转换为日期集合，方便前端使用
    const checkedDates = checkIns.map(item => item.check_in_date);
    
    return jsonResponse({
      year,
      month,
      checkedDates,
      checkIns
    }, 200, request, env);
  } catch (error) {
    console.error('获取签到日历失败:', error);
    return errorResponse('获取签到日历失败: ' + error.message, 500, request, env);
  }
}