import { getAuthUrl, getAccessToken, getUserInfo, createOrUpdateUser } from '../utils/oauth.js';
import { createSession, deleteSession, createSessionCookie } from '../utils/session.js';
import { jsonResponse, errorResponse } from '../middleware/auth.js';

/**
 * 处理登录请求 - 返回 OAuth2 授权 URL
 */
export async function handleLogin(request, env) {
  const authUrl = getAuthUrl(env);
  return jsonResponse({ authUrl }, 200, request, env);
}

/**
 * 处理 OAuth2 回调
 */
export async function handleCallback(request, env) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    
    if (!code) {
      return errorResponse('授权码缺失', 400, request, env);
    }
    
    // 获取访问令牌
    const tokenData = await getAccessToken(code, env);
    
    if (!tokenData.access_token) {
      return errorResponse('获取访问令牌失败', 400, request, env);
    }
    
    // 获取用户信息
    const userInfo = await getUserInfo(tokenData.access_token, env);
    
    // 创建或更新用户
    const user = await createOrUpdateUser(env.DB, userInfo);
    
    // 创建会话
    const sessionId = await createSession(env.DB, user.id);
    
    // 返回成功响应，包含会话 Cookie
    return new Response(JSON.stringify({ 
      success: true,
      user: {
        id: user.id,
        username: user.username,
        avatar_url: user.avatar_url
      }
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': createSessionCookie(sessionId, new URL(env.FRONTEND_URL).hostname),
        ...getCorsHeaders(request, env)
      }
    });
  } catch (error) {
    console.error('OAuth 回调处理失败:', error);
    return errorResponse('认证失败: ' + error.message, 500, request, env);
  }
}

/**
 * 处理登出请求
 */
export async function handleLogout(request, env) {
  const sessionId = getSessionIdFromRequest(request);
  
  if (sessionId) {
    await deleteSession(env.DB, sessionId);
  }
  
  // 清除会话 Cookie
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': `session_id=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
      ...getCorsHeaders(request, env)
    }
  });
}

/**
 * 获取当前用户信息
 */
export async function handleGetMe(request, env) {
  const session = request.session;
  
  if (!session) {
    return errorResponse('未登录', 401, request, env);
  }
  
  return jsonResponse({
    user: {
      id: session.user_id,
      username: session.username,
      email: session.email,
      avatar_url: session.avatar_url
    }
  }, 200, request, env);
}

// 导入必要的函数
import { getCorsHeaders } from '../middleware/auth.js';
import { getSessionIdFromRequest } from '../utils/session.js';