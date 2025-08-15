/**
 * 创建新的会话
 * @param {D1Database} db - D1 数据库实例
 * @param {number} userId - 用户 ID
 * @returns {Promise<string>} 会话 ID
 */
export async function createSession(db, userId) {
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7天有效期
  
  await db.prepare(
    'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)'
  ).bind(sessionId, userId, expiresAt.toISOString()).run();
  
  return sessionId;
}

/**
 * 验证会话
 * @param {D1Database} db - D1 数据库实例
 * @param {string} sessionId - 会话 ID
 * @returns {Promise<Object|null>} 用户信息或 null
 */
export async function validateSession(db, sessionId) {
  if (!sessionId) return null;
  
  const result = await db.prepare(`
    SELECT s.*, u.id as user_id, u.linux_do_id, u.username, u.email, u.avatar_url 
    FROM sessions s 
    JOIN users u ON s.user_id = u.id 
    WHERE s.id = ? AND s.expires_at > datetime('now')
  `).bind(sessionId).first();
  
  return result;
}

/**
 * 删除会话（登出）
 * @param {D1Database} db - D1 数据库实例
 * @param {string} sessionId - 会话 ID
 * @returns {Promise<void>}
 */
export async function deleteSession(db, sessionId) {
  await db.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
}

/**
 * 清理过期会话
 * @param {D1Database} db - D1 数据库实例
 * @returns {Promise<void>}
 */
export async function cleanupExpiredSessions(db) {
  await db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();
}

/**
 * 从请求中获取会话 ID
 * @param {Request} request - 请求对象
 * @returns {string|null} 会话 ID
 */
export function getSessionIdFromRequest(request) {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return null;
  
  const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split('=');
    acc[key] = value;
    return acc;
  }, {});
  
  return cookies['session_id'] || null;
}

/**
 * 创建会话 Cookie
 * @param {string} sessionId - 会话 ID
 * @param {string} domain - Cookie 域名
 * @returns {string} Set-Cookie 头部值
 */
export function createSessionCookie(sessionId, domain = '') {
  const expires = new Date();
  expires.setDate(expires.getDate() + 7);
  
  let cookie = `session_id=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires.toUTCString()}`;
  
  if (domain) {
    cookie += `; Domain=${domain}`;
  }
  
  // 在生产环境中使用 Secure
  if (domain && !domain.includes('localhost')) {
    cookie += '; Secure';
  }
  
  return cookie;
}