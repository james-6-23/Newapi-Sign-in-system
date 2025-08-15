import { validateSession, getSessionIdFromRequest } from '../utils/session.js';

/**
 * 认证中间件
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境变量
 * @returns {Promise<Response|null>} 如果未认证返回错误响应，否则返回 null
 */
export async function requireAuth(request, env) {
  const sessionId = getSessionIdFromRequest(request);
  
  if (!sessionId) {
    return new Response(JSON.stringify({ error: '未登录' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const session = await validateSession(env.DB, sessionId);
  
  if (!session) {
    return new Response(JSON.stringify({ error: '会话已过期，请重新登录' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // 将会话信息附加到请求对象
  request.session = session;
  
  return null;
}

/**
 * CORS 中间件
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境变量
 * @returns {Object} CORS 头部
 */
export function getCorsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowedOrigin = env.FRONTEND_URL;
  
  // 检查请求来源是否允许
  if (origin === allowedOrigin || origin === 'http://localhost:3000') {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age': '86400',
    };
  }
  
  return {};
}

/**
 * 处理 OPTIONS 请求
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境变量
 * @returns {Response} OPTIONS 响应
 */
export function handleOptions(request, env) {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request, env)
  });
}

/**
 * 创建 JSON 响应
 * @param {Object} data - 响应数据
 * @param {number} status - HTTP 状态码
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境变量
 * @returns {Response} JSON 响应
 */
export function jsonResponse(data, status = 200, request, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...getCorsHeaders(request, env)
    }
  });
}

/**
 * 错误响应
 * @param {string} message - 错误消息
 * @param {number} status - HTTP 状态码
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境变量
 * @returns {Response} 错误响应
 */
export function errorResponse(message, status = 400, request, env) {
  return jsonResponse({ error: message }, status, request, env);
}