/**
 * 生成 OAuth2 授权 URL
 * @param {Object} env - 环境变量
 * @returns {string} 授权 URL
 */
export function getAuthUrl(env) {
  const params = new URLSearchParams({
    client_id: env.CLIENT_ID,
    redirect_uri: `${env.FRONTEND_URL}/auth/callback`,
    response_type: 'code',
    scope: 'user'
  });

  return `${env.AUTH_URL}?${params.toString()}`;
}

/**
 * 使用授权码获取访问令牌
 * @param {string} code - 授权码
 * @param {Object} env - 环境变量
 * @returns {Promise<Object>} Token 数据
 */
export async function getAccessToken(code, env) {
  try {
    const response = await fetch(env.TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: env.CLIENT_ID,
        client_secret: env.CLIENT_SECRET,
        code: code,
        redirect_uri: `${env.FRONTEND_URL}/auth/callback`,
        grant_type: 'authorization_code'
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`获取访问令牌失败: ${error}`);
    }

    return await response.json();
  } catch (error) {
    console.error('获取访问令牌失败:', error);
    throw error;
  }
}

/**
 * 使用访问令牌获取用户信息
 * @param {string} accessToken - 访问令牌
 * @param {Object} env - 环境变量
 * @returns {Promise<Object>} 用户信息
 */
export async function getUserInfo(accessToken, env) {
  try {
    const response = await fetch(env.USER_INFO_URL, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`获取用户信息失败: ${error}`);
    }

    return await response.json();
  } catch (error) {
    console.error('获取用户信息失败:', error);
    throw error;
  }
}

/**
 * 创建或更新用户
 * @param {D1Database} db - D1 数据库实例
 * @param {Object} userInfo - Linux Do 用户信息
 * @returns {Promise<Object>} 用户记录
 */
export async function createOrUpdateUser(db, userInfo) {
  // 检查用户是否存在
  const existingUser = await db.prepare(
    'SELECT * FROM users WHERE linux_do_id = ?'
  ).bind(userInfo.sub || userInfo.id).first();

  if (existingUser) {
    // 更新用户信息
    await db.prepare(`
      UPDATE users 
      SET username = ?, email = ?, avatar_url = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(
      userInfo.preferred_username || userInfo.username,
      userInfo.email || null,
      userInfo.picture || userInfo.avatar_url || null,
      existingUser.id
    ).run();

    return existingUser;
  } else {
    // 创建新用户
    const result = await db.prepare(`
      INSERT INTO users (linux_do_id, username, email, avatar_url)
      VALUES (?, ?, ?, ?)
    `).bind(
      userInfo.sub || userInfo.id,
      userInfo.preferred_username || userInfo.username,
      userInfo.email || null,
      userInfo.picture || userInfo.avatar_url || null
    ).run();

    return {
      id: result.meta.last_row_id,
      linux_do_id: userInfo.sub || userInfo.id,
      username: userInfo.preferred_username || userInfo.username,
      email: userInfo.email || null,
      avatar_url: userInfo.picture || userInfo.avatar_url || null
    };
  }
}