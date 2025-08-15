import { getUserCodes } from '../utils/db.js';
import { jsonResponse, errorResponse } from '../middleware/auth.js';

/**
 * 获取用户的兑换码列表
 */
export async function handleGetCodes(request, env) {
  const session = request.session;
  
  if (!session) {
    return errorResponse('未登录', 401, request, env);
  }
  
  try {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page')) || 1;
    const limit = parseInt(url.searchParams.get('limit')) || 20;
    
    // 验证参数
    if (page < 1 || limit < 1 || limit > 100) {
      return errorResponse('无效的分页参数', 400, request, env);
    }
    
    const offset = (page - 1) * limit;
    const result = await getUserCodes(env.DB, session.user_id, limit, offset);
    
    // 计算分页信息
    const totalPages = Math.ceil(result.total / limit);
    
    return jsonResponse({
      codes: result.codes,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    }, 200, request, env);
  } catch (error) {
    console.error('获取兑换码列表失败:', error);
    return errorResponse('获取兑换码列表失败: ' + error.message, 500, request, env);
  }
}

/**
 * 获取特定兑换码详情
 */
export async function handleGetCodeDetail(request, env) {
  const session = request.session;
  
  if (!session) {
    return errorResponse('未登录', 401, request, env);
  }
  
  try {
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const codeId = pathParts[pathParts.length - 1];
    
    if (!codeId || isNaN(codeId)) {
      return errorResponse('无效的兑换码 ID', 400, request, env);
    }
    
    // 查询兑换码详情，确保属于当前用户
    const code = await env.DB.prepare(`
      SELECT * FROM check_ins 
      WHERE id = ? AND user_id = ?
    `).bind(codeId, session.user_id).first();
    
    if (!code) {
      return errorResponse('兑换码不存在', 404, request, env);
    }
    
    return jsonResponse({
      code: {
        id: code.id,
        redemption_code: code.redemption_code,
        check_in_date: code.check_in_date,
        created_at: code.created_at
      }
    }, 200, request, env);
  } catch (error) {
    console.error('获取兑换码详情失败:', error);
    return errorResponse('获取兑换码详情失败: ' + error.message, 500, request, env);
  }
}

/**
 * 搜索兑换码
 */
export async function handleSearchCodes(request, env) {
  const session = request.session;
  
  if (!session) {
    return errorResponse('未登录', 401, request, env);
  }
  
  try {
    const url = new URL(request.url);
    const query = url.searchParams.get('q');
    
    if (!query || query.length < 3) {
      return errorResponse('搜索关键词至少需要3个字符', 400, request, env);
    }
    
    // 搜索兑换码
    const results = await env.DB.prepare(`
      SELECT * FROM check_ins 
      WHERE user_id = ? AND redemption_code LIKE ?
      ORDER BY created_at DESC
      LIMIT 20
    `).bind(session.user_id, `%${query}%`).all();
    
    return jsonResponse({
      codes: results.results || [],
      query: query
    }, 200, request, env);
  } catch (error) {
    console.error('搜索兑换码失败:', error);
    return errorResponse('搜索兑换码失败: ' + error.message, 500, request, env);
  }
}