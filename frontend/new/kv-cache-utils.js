/**
 * KV 缓存工具函数
 * 为 KYX 签到系统提供高性能缓存支持
 */

// ============================================
// 缓存配置
// ============================================

const CACHE_TTL = {
  SESSION: 7 * 24 * 60 * 60,      // 会话: 7天
  USER_STATS: 60 * 60,            // 用户统计: 1小时
  SYSTEM_CONFIG: 24 * 60 * 60,    // 系统配置: 24小时
  INVENTORY: 30 * 60,             // 库存: 30分钟
  RANKING: 5 * 60,                // 排行榜: 5分钟
  TEMP: 10 * 60                   // 临时数据: 10分钟
};

const CACHE_KEYS = {
  SESSION: (sessionId) => `session:${sessionId}`,
  USER_STATS: (userId) => `user_stats:${userId}`,
  USER_PROFILE: (userId) => `user_profile:${userId}`,
  CHECKIN_REWARDS: 'checkin_rewards',
  INVENTORY: 'code_inventory',
  DAILY_RANKING: (date) => `ranking:daily:${date}`,
  WEEKLY_RANKING: (week) => `ranking:weekly:${week}`,
  SYSTEM_STATS: 'system_stats',
  ONLINE_USERS: 'online_users'
};

// ============================================
// 基础缓存操作
// ============================================

/**
 * 获取缓存数据
 */
async function getCache(env, key, defaultValue = null) {
  try {
    const data = await env.KV.get(key, 'json');
    return data !== null ? data : defaultValue;
  } catch (error) {
    console.error(`KV get error for key ${key}:`, error);
    return defaultValue;
  }
}

/**
 * 设置缓存数据
 */
async function setCache(env, key, value, ttl = CACHE_TTL.TEMP) {
  try {
    await env.KV.put(key, JSON.stringify(value), { expirationTtl: ttl });
    return true;
  } catch (error) {
    console.error(`KV set error for key ${key}:`, error);
    return false;
  }
}

/**
 * 删除缓存数据
 */
async function deleteCache(env, key) {
  try {
    await env.KV.delete(key);
    return true;
  } catch (error) {
    console.error(`KV delete error for key ${key}:`, error);
    return false;
  }
}

/**
 * 批量删除缓存
 */
async function deleteCacheByPrefix(env, prefix) {
  try {
    const list = await env.KV.list({ prefix });
    const deletePromises = list.keys.map(key => env.KV.delete(key.name));
    await Promise.all(deletePromises);
    return true;
  } catch (error) {
    console.error(`KV batch delete error for prefix ${prefix}:`, error);
    return false;
  }
}

// ============================================
// 会话缓存
// ============================================

/**
 * 缓存用户会话
 */
async function cacheUserSession(env, sessionId, sessionData) {
  const key = CACHE_KEYS.SESSION(sessionId);
  return await setCache(env, key, sessionData, CACHE_TTL.SESSION);
}

/**
 * 获取缓存的会话
 */
async function getCachedSession(env, sessionId) {
  const key = CACHE_KEYS.SESSION(sessionId);
  return await getCache(env, key);
}

/**
 * 删除会话缓存
 */
async function deleteCachedSession(env, sessionId) {
  const key = CACHE_KEYS.SESSION(sessionId);
  return await deleteCache(env, key);
}

// ============================================
// 用户数据缓存
// ============================================

/**
 * 缓存用户统计数据
 */
async function cacheUserStats(env, userId, stats) {
  const key = CACHE_KEYS.USER_STATS(userId);
  return await setCache(env, key, stats, CACHE_TTL.USER_STATS);
}

/**
 * 获取缓存的用户统计
 */
async function getCachedUserStats(env, userId) {
  const key = CACHE_KEYS.USER_STATS(userId);
  return await getCache(env, key);
}

/**
 * 缓存用户资料
 */
async function cacheUserProfile(env, userId, profile) {
  const key = CACHE_KEYS.USER_PROFILE(userId);
  return await setCache(env, key, profile, CACHE_TTL.USER_STATS);
}

/**
 * 获取缓存的用户资料
 */
async function getCachedUserProfile(env, userId) {
  const key = CACHE_KEYS.USER_PROFILE(userId);
  return await getCache(env, key);
}

/**
 * 清除用户相关缓存
 */
async function clearUserCache(env, userId) {
  const promises = [
    deleteCache(env, CACHE_KEYS.USER_STATS(userId)),
    deleteCache(env, CACHE_KEYS.USER_PROFILE(userId))
  ];
  await Promise.all(promises);
}

// ============================================
// 系统配置缓存
// ============================================

/**
 * 缓存签到奖励配置
 */
async function cacheCheckinRewards(env, rewards) {
  return await setCache(env, CACHE_KEYS.CHECKIN_REWARDS, rewards, CACHE_TTL.SYSTEM_CONFIG);
}

/**
 * 获取缓存的签到奖励配置
 */
async function getCachedCheckinRewards(env) {
  return await getCache(env, CACHE_KEYS.CHECKIN_REWARDS);
}

/**
 * 缓存系统统计
 */
async function cacheSystemStats(env, stats) {
  return await setCache(env, CACHE_KEYS.SYSTEM_STATS, stats, CACHE_TTL.USER_STATS);
}

/**
 * 获取缓存的系统统计
 */
async function getCachedSystemStats(env) {
  return await getCache(env, CACHE_KEYS.SYSTEM_STATS);
}

// ============================================
// 库存缓存
// ============================================

/**
 * 缓存兑换码库存
 */
async function cacheInventory(env, inventory) {
  return await setCache(env, CACHE_KEYS.INVENTORY, inventory, CACHE_TTL.INVENTORY);
}

/**
 * 获取缓存的库存
 */
async function getCachedInventory(env) {
  return await getCache(env, CACHE_KEYS.INVENTORY);
}

/**
 * 更新库存缓存
 */
async function updateInventoryCache(env, amount, change) {
  const inventory = await getCachedInventory(env) || {};
  if (!inventory[amount]) {
    inventory[amount] = 0;
  }
  inventory[amount] += change;
  inventory[amount] = Math.max(0, inventory[amount]); // 确保不为负数
  
  await cacheInventory(env, inventory);
  return inventory;
}

// ============================================
// 排行榜缓存
// ============================================

/**
 * 缓存每日排行榜
 */
async function cacheDailyRanking(env, date, ranking) {
  const key = CACHE_KEYS.DAILY_RANKING(date);
  return await setCache(env, key, ranking, CACHE_TTL.RANKING);
}

/**
 * 获取缓存的每日排行榜
 */
async function getCachedDailyRanking(env, date) {
  const key = CACHE_KEYS.DAILY_RANKING(date);
  return await getCache(env, key);
}

/**
 * 缓存在线用户数
 */
async function cacheOnlineUsers(env, count) {
  return await setCache(env, CACHE_KEYS.ONLINE_USERS, { count, timestamp: Date.now() }, CACHE_TTL.RANKING);
}

/**
 * 获取缓存的在线用户数
 */
async function getCachedOnlineUsers(env) {
  return await getCache(env, CACHE_KEYS.ONLINE_USERS);
}

// ============================================
// 高级缓存功能
// ============================================

/**
 * 缓存穿透保护 - 获取或计算数据
 */
async function getOrCompute(env, key, computeFunction, ttl = CACHE_TTL.TEMP) {
  // 先尝试从缓存获取
  let data = await getCache(env, key);
  
  if (data === null) {
    // 缓存未命中，计算数据
    try {
      data = await computeFunction();
      if (data !== null && data !== undefined) {
        // 缓存计算结果
        await setCache(env, key, data, ttl);
      }
    } catch (error) {
      console.error(`Compute function error for key ${key}:`, error);
      return null;
    }
  }
  
  return data;
}

/**
 * 预热缓存
 */
async function warmupCache(env) {
  try {
    console.log('Starting cache warmup...');
    
    // 预热签到奖励配置
    // 这里需要从数据库加载数据
    // const rewards = await loadCheckinRewardsFromDB(env);
    // await cacheCheckinRewards(env, rewards);
    
    console.log('Cache warmup completed');
  } catch (error) {
    console.error('Cache warmup error:', error);
  }
}

/**
 * 缓存健康检查
 */
async function cacheHealthCheck(env) {
  try {
    const testKey = 'health_check';
    const testValue = { timestamp: Date.now() };
    
    // 测试写入
    await setCache(env, testKey, testValue, 60);
    
    // 测试读取
    const result = await getCache(env, testKey);
    
    // 清理测试数据
    await deleteCache(env, testKey);
    
    return result && result.timestamp === testValue.timestamp;
  } catch (error) {
    console.error('Cache health check error:', error);
    return false;
  }
}

// ============================================
// 导出函数
// ============================================

export {
  // 基础操作
  getCache,
  setCache,
  deleteCache,
  deleteCacheByPrefix,
  
  // 会话缓存
  cacheUserSession,
  getCachedSession,
  deleteCachedSession,
  
  // 用户数据缓存
  cacheUserStats,
  getCachedUserStats,
  cacheUserProfile,
  getCachedUserProfile,
  clearUserCache,
  
  // 系统配置缓存
  cacheCheckinRewards,
  getCachedCheckinRewards,
  cacheSystemStats,
  getCachedSystemStats,
  
  // 库存缓存
  cacheInventory,
  getCachedInventory,
  updateInventoryCache,
  
  // 排行榜缓存
  cacheDailyRanking,
  getCachedDailyRanking,
  cacheOnlineUsers,
  getCachedOnlineUsers,
  
  // 高级功能
  getOrCompute,
  warmupCache,
  cacheHealthCheck,
  
  // 常量
  CACHE_TTL,
  CACHE_KEYS
};
