import { handleOptions, requireAuth } from './middleware/auth.js';
import { handleLogin, handleCallback, handleLogout, handleGetMe } from './routes/auth.js';
import { handleCheckIn, handleCheckTodayStatus, handleGetCalendar } from './routes/checkin.js';
import { handleGetCodes, handleGetCodeDetail, handleSearchCodes } from './routes/codes.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    
    // 处理 OPTIONS 请求
    if (method === 'OPTIONS') {
      return handleOptions(request, env);
    }
    
    // 路由匹配
    try {
      // 认证相关路由（无需登录）
      if (path === '/api/auth/login' && method === 'GET') {
        return await handleLogin(request, env);
      }
      
      if (path === '/api/auth/callback' && method === 'GET') {
        return await handleCallback(request, env);
      }
      
      if (path === '/api/auth/logout' && method === 'POST') {
        return await handleLogout(request, env);
      }
      
      // 以下路由需要认证
      const authError = await requireAuth(request, env);
      if (authError) {
        return authError;
      }
      
      // 用户信息
      if (path === '/api/auth/me' && method === 'GET') {
        return await handleGetMe(request, env);
      }
      
      // 签到相关路由
      if (path === '/api/checkin' && method === 'POST') {
        return await handleCheckIn(request, env);
      }
      
      if (path === '/api/checkin/today' && method === 'GET') {
        return await handleCheckTodayStatus(request, env);
      }
      
      if (path === '/api/checkin/calendar' && method === 'GET') {
        return await handleGetCalendar(request, env);
      }
      
      // 兑换码相关路由
      if (path === '/api/codes' && method === 'GET') {
        return await handleGetCodes(request, env);
      }
      
      if (path === '/api/codes/search' && method === 'GET') {
        return await handleSearchCodes(request, env);
      }
      
      if (path.startsWith('/api/codes/') && method === 'GET') {
        return await handleGetCodeDetail(request, env);
      }
      
      // 404 处理
      return new Response(JSON.stringify({ error: '未找到请求的资源' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
      
    } catch (error) {
      console.error('请求处理失败:', error);
      return new Response(JSON.stringify({ 
        error: '服务器内部错误',
        message: error.message 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },
  
  // 定时任务：清理过期会话
  async scheduled(event, env, ctx) {
    switch (event.cron) {
      case '0 0 * * *': // 每天凌晨执行
        await cleanupExpiredSessions(env.DB);
        break;
    }
  }
};

// 导入清理函数
import { cleanupExpiredSessions } from './utils/session.js';