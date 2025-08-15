import Redis from 'ioredis'

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined
}

export const redis = globalForRedis.redis ?? new Redis(process.env.REDIS_URL || 'redis://localhost:6379')

if (process.env.NODE_ENV !== 'production') globalForRedis.redis = redis

// Redis工具函数
export class RedisCache {
  private static prefix = 'kyx:'

  static async get<T>(key: string): Promise<T | null> {
    try {
      const value = await redis.get(`${this.prefix}${key}`)
      return value ? JSON.parse(value) : null
    } catch (error) {
      console.error('Redis get error:', error)
      return null
    }
  }

  static async set(key: string, value: any, ttl?: number): Promise<boolean> {
    try {
      const serialized = JSON.stringify(value)
      if (ttl) {
        await redis.setex(`${this.prefix}${key}`, ttl, serialized)
      } else {
        await redis.set(`${this.prefix}${key}`, serialized)
      }
      return true
    } catch (error) {
      console.error('Redis set error:', error)
      return false
    }
  }

  static async del(key: string): Promise<boolean> {
    try {
      await redis.del(`${this.prefix}${key}`)
      return true
    } catch (error) {
      console.error('Redis del error:', error)
      return false
    }
  }

  static async exists(key: string): Promise<boolean> {
    try {
      const result = await redis.exists(`${this.prefix}${key}`)
      return result === 1
    } catch (error) {
      console.error('Redis exists error:', error)
      return false
    }
  }

  // 用户签到状态缓存
  static async getUserCheckinStatus(userId: number): Promise<boolean> {
    const today = new Date().toISOString().split('T')[0]
    return await this.exists(`checkin:${userId}:${today}`)
  }

  static async setUserCheckinStatus(userId: number): Promise<boolean> {
    const today = new Date().toISOString().split('T')[0]
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(0, 0, 0, 0)
    const ttl = Math.floor((tomorrow.getTime() - Date.now()) / 1000)
    
    return await this.set(`checkin:${userId}:${today}`, true, ttl)
  }

  // 用户抽奖次数缓存
  static async getUserLotteryAttempts(userId: number): Promise<number> {
    const today = new Date().toISOString().split('T')[0]
    const attempts = await this.get<number>(`lottery:${userId}:${today}`)
    return attempts || 0
  }

  static async incrementUserLotteryAttempts(userId: number): Promise<number> {
    const today = new Date().toISOString().split('T')[0]
    const key = `${this.prefix}lottery:${userId}:${today}`
    
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(0, 0, 0, 0)
    const ttl = Math.floor((tomorrow.getTime() - Date.now()) / 1000)
    
    const result = await redis.incr(key)
    await redis.expire(key, ttl)
    
    return result
  }
}