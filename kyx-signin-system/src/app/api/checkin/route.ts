import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { RedisCache } from '@/lib/redis'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id as number
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // 检查今日是否已签到
    const hasCheckedIn = await RedisCache.getUserCheckinStatus(userId)
    if (hasCheckedIn) {
      return NextResponse.json({ error: '今日已签到' }, { status: 400 })
    }

    // 获取用户信息
    const user = await prisma.user.findUnique({
      where: { id: userId }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // 计算连续签到天数
    let consecutiveDays = 1
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (user.last_checkin_date) {
      const lastCheckinDate = new Date(user.last_checkin_date)
      lastCheckinDate.setHours(0, 0, 0, 0)
      
      if (lastCheckinDate.getTime() === yesterday.getTime()) {
        consecutiveDays = user.consecutive_checkins + 1
      }
    }

    // 计算奖励
    const baseReward = 10 // 基础经验奖励
    const levelBonus = Math.floor(baseReward * (user.current_level * 0.1))
    const consecutiveBonus = Math.floor(consecutiveDays * 2)
    const totalReward = baseReward + levelBonus + consecutiveBonus

    // 生成兑换码
    const redemptionCode = generateRedemptionCode()
    const codeAmount = calculateCodeAmount(consecutiveDays, user.current_level)

    // 开始数据库事务
    const result = await prisma.$transaction(async (tx) => {
      // 创建签到记录
      const checkin = await tx.checkIn.create({
        data: {
          user_id: userId,
          checkin_date: today,
          consecutive_days: consecutiveDays,
          base_reward: baseReward,
          level_bonus: levelBonus,
          activity_bonus: consecutiveBonus,
          total_reward: totalReward,
          redemption_code: redemptionCode,
        }
      })

      // 创建兑换码记录
      await tx.redemptionCode.create({
        data: {
          code: redemptionCode,
          amount: codeAmount,
          user_id: userId,
          distributed: true,
          source: 'checkin',
          distributed_at: new Date(),
        }
      })

      // 更新用户信息
      const newExperience = user.experience + totalReward
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: {
          experience: newExperience,
          total_checkins: user.total_checkins + 1,
          consecutive_checkins: consecutiveDays,
          max_consecutive: Math.max(user.max_consecutive, consecutiveDays),
          last_checkin_date: today,
        }
      })

      // 记录经验获得日志
      await tx.userExperienceLog.create({
        data: {
          user_id: userId,
          amount: totalReward,
          source: 'checkin',
          description: `签到获得经验，连续${consecutiveDays}天`,
        }
      })

      // 检查是否升级
      const levelUp = await checkLevelUp(tx, userId, newExperience)

      return {
        checkin,
        user: updatedUser,
        redemptionCode,
        codeAmount,
        levelUp,
      }
    })

    // 设置签到缓存
    await RedisCache.setUserCheckinStatus(userId)

    return NextResponse.json({
      success: true,
      data: {
        experience_gained: totalReward,
        consecutive_days: consecutiveDays,
        redemption_code: redemptionCode,
        code_amount: codeAmount,
        level_up: result.levelUp,
        total_experience: result.user.experience,
        current_level: result.user.current_level,
      }
    })

  } catch (error) {
    console.error('Checkin error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// 获取签到状态
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id as number
    const hasCheckedIn = await RedisCache.getUserCheckinStatus(userId)

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        consecutive_checkins: true,
        max_consecutive: true,
        total_checkins: true,
        last_checkin_date: true,
      }
    })

    return NextResponse.json({
      has_checked_in: hasCheckedIn,
      consecutive_days: user?.consecutive_checkins || 0,
      max_consecutive: user?.max_consecutive || 0,
      total_checkins: user?.total_checkins || 0,
      last_checkin_date: user?.last_checkin_date,
    })

  } catch (error) {
    console.error('Get checkin status error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// 生成兑换码
function generateRedemptionCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = ''
  for (let i = 0; i < 12; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

// 计算兑换码金额
function calculateCodeAmount(consecutiveDays: number, userLevel: number): number {
  let baseAmount = 1.0
  
  // 连续签到奖励
  if (consecutiveDays >= 7) baseAmount += 0.5
  if (consecutiveDays >= 15) baseAmount += 1.0
  if (consecutiveDays >= 30) baseAmount += 2.0
  
  // 等级奖励
  baseAmount += userLevel * 0.1
  
  return Math.round(baseAmount * 100) / 100
}

// 检查升级
async function checkLevelUp(tx: any, userId: number, newExperience: number) {
  const levels = await tx.userLevel.findMany({
    orderBy: { level: 'asc' }
  })

  const currentUser = await tx.user.findUnique({
    where: { id: userId }
  })

  if (!currentUser) return null

  const currentLevel = currentUser.current_level
  const nextLevel = levels.find(l => l.level > currentLevel && newExperience >= l.required_exp)

  if (nextLevel) {
    // 升级
    await tx.user.update({
      where: { id: userId },
      data: { current_level: nextLevel.level }
    })

    // 记录升级历史
    await tx.userLevelHistory.create({
      data: {
        user_id: userId,
        old_level: currentLevel,
        new_level: nextLevel.level,
        experience: newExperience,
      }
    })

    return {
      old_level: currentLevel,
      new_level: nextLevel.level,
      level_name: nextLevel.name,
    }
  }

  return null
}