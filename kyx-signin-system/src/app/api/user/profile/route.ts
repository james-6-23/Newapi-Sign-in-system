import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id as number

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        _count: {
          select: {
            checkins: true,
            redemptionCodes: true,
            lotteryRecords: true,
            items: true,
          }
        }
      }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // 获取当前等级信息
    const currentLevelInfo = await prisma.userLevel.findUnique({
      where: { level: user.current_level }
    })

    // 获取下一等级信息
    const nextLevelInfo = await prisma.userLevel.findFirst({
      where: { level: { gt: user.current_level } },
      orderBy: { level: 'asc' }
    })

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatar_url: user.avatar_url,
        linuxdo_level: user.linuxdo_level,
        current_level: user.current_level,
        experience: user.experience,
        total_checkins: user.total_checkins,
        consecutive_checkins: user.consecutive_checkins,
        max_consecutive: user.max_consecutive,
        created_at: user.created_at,
        status: user.status,
      },
      level_info: {
        current: currentLevelInfo,
        next: nextLevelInfo,
        progress: nextLevelInfo ? 
          Math.min(100, (user.experience / nextLevelInfo.required_exp) * 100) : 100
      },
      statistics: {
        total_checkins: user._count.checkins,
        total_codes: user._count.redemptionCodes,
        total_lottery: user._count.lotteryRecords,
        total_items: user._count.items,
      }
    })

  } catch (error) {
    console.error('Get user profile error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}