'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function DashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [checkinStatus, setCheckinStatus] = useState({
    hasCheckedIn: false,
    consecutiveDays: 0,
    totalCheckins: 0,
    maxConsecutive: 0
  })
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [rewardData, setRewardData] = useState(null)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    }
  }, [status, router])

  useEffect(() => {
    if (session) {
      fetchCheckinStatus()
    }
  }, [session])

  const fetchCheckinStatus = async () => {
    try {
      const response = await fetch('/api/checkin')
      if (response.ok) {
        const data = await response.json()
        setCheckinStatus({
          hasCheckedIn: data.has_checked_in,
          consecutiveDays: data.consecutive_days,
          totalCheckins: data.total_checkins,
          maxConsecutive: data.max_consecutive
        })
      }
    } catch (error) {
      console.error('获取签到状态失败:', error)
    }
  }

  const handleCheckin = async () => {
    if (checkinStatus.hasCheckedIn || loading) return

    setLoading(true)
    try {
      const response = await fetch('/api/checkin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        const data = await response.json()
        setRewardData(data.data)
        setShowModal(true)
        setCheckinStatus(prev => ({
          ...prev,
          hasCheckedIn: true,
          consecutiveDays: data.data.consecutive_days,
          totalCheckins: prev.totalCheckins + 1
        }))
      } else {
        const error = await response.json()
        alert(error.error || '签到失败')
      }
    } catch (error) {
      console.error('签到失败:', error)
      alert('签到失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  const copyCode = async (code) => {
    try {
      await navigator.clipboard.writeText(code)
      alert('兑换码已复制到剪贴板')
    } catch (error) {
      console.error('复制失败:', error)
      alert('复制失败，请手动复制')
    }
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
      </div>
    )
  }

  if (!session) {
    return null
  }

  return (
    <>
      {/* 背景装饰层 */}
      <div className="fixed inset-0 bg-gradient-to-br from-blue-500/10 via-transparent to-green-500/10 pointer-events-none" />
      <div className="fixed inset-0 bg-grid-pattern opacity-[0.035] pointer-events-none animate-grid-move" />
      <div className="fixed inset-0 bg-noise-pattern opacity-[0.07] mix-blend-soft-light pointer-events-none" />

      <div className="min-h-screen bg-black/35 backdrop-blur-sm backdrop-saturate-120 relative z-10">
        {/* 导航栏 */}
        <nav className="bg-gray-900/55 border-b border-white/12 backdrop-blur-xl shadow-2xl sticky top-0 z-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center space-x-2">
                <div className="text-2xl">📅</div>
                <span className="text-white font-semibold text-lg">KYX 签到系统</span>
              </div>
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <img 
                    src={session.user.image || '/default-avatar.png'} 
                    alt="头像" 
                    className="w-8 h-8 rounded-full"
                  />
                  <div className="text-white">
                    <div className="text-sm font-medium">{session.user.name}</div>
                    <div className="text-xs text-gray-400">等级: {session.user.level || 1}</div>
                  </div>
                </div>
                <button
                  onClick={() => router.push('/api/auth/signout')}
                  className="bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 text-white px-3 py-1 rounded-lg text-sm transition-colors"
                >
                  退出
                </button>
              </div>
            </div>
          </div>
        </nav>

        {/* 主内容 */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* 签到卡片 */}
          <div className="bg-white/8 backdrop-blur-lg backdrop-saturate-140 border border-white/16 rounded-2xl p-8 mb-8 text-center shadow-2xl relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-white/18 via-transparent to-white/8 pointer-events-none rounded-2xl" />
            
            <div className="relative z-10">
              <h1 className="text-4xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent mb-4">
                每日签到
              </h1>
              <p className="text-gray-400 mb-8">
                {checkinStatus.hasCheckedIn ? '今日签到已完成，明天再来吧！' : '今日还未签到，点击下方按钮完成签到'}
              </p>
              <button
                onClick={handleCheckin}
                disabled={checkinStatus.hasCheckedIn || loading}
                className={`px-8 py-4 rounded-xl font-bold text-lg transition-all duration-200 ${
                  checkinStatus.hasCheckedIn 
                    ? 'bg-gray-600/20 border border-gray-500/40 text-gray-400 cursor-not-allowed'
                    : 'bg-green-600/20 hover:bg-green-600/30 border border-green-500/40 hover:border-green-400/60 text-white hover:scale-105 shadow-lg hover:shadow-green-500/25'
                }`}
              >
                {loading ? (
                  <div className="flex items-center space-x-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/30 border-t-white" />
                    <span>签到中...</span>
                  </div>
                ) : checkinStatus.hasCheckedIn ? (
                  '今日已签到'
                ) : (
                  '立即签到'
                )}
              </button>
            </div>
          </div>

          {/* 统计信息 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white/6 backdrop-blur-lg border border-white/14 rounded-xl p-6 text-center hover:scale-105 transition-transform">
              <div className="text-gray-400 text-sm mb-2">总签到天数</div>
              <div className="text-3xl font-bold text-white">{checkinStatus.totalCheckins}</div>
            </div>
            <div className="bg-white/6 backdrop-blur-lg border border-white/14 rounded-xl p-6 text-center hover:scale-105 transition-transform">
              <div className="text-gray-400 text-sm mb-2">连续签到天数</div>
              <div className="text-3xl font-bold text-white">{checkinStatus.consecutiveDays}</div>
            </div>
            <div className="bg-white/6 backdrop-blur-lg border border-white/14 rounded-xl p-6 text-center hover:scale-105 transition-transform">
              <div className="text-gray-400 text-sm mb-2">最大连续天数</div>
              <div className="text-3xl font-bold text-white">{checkinStatus.maxConsecutive}</div>
            </div>
          </div>

          {/* 功能导航 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <button className="bg-white/6 backdrop-blur-lg border border-white/14 rounded-xl p-6 text-center hover:scale-105 transition-transform">
              <div className="text-2xl mb-2">🎯</div>
              <div className="text-white font-medium">等级系统</div>
            </button>
            <button className="bg-white/6 backdrop-blur-lg border border-white/14 rounded-xl p-6 text-center hover:scale-105 transition-transform">
              <div className="text-2xl mb-2">🎰</div>
              <div className="text-white font-medium">转盘抽奖</div>
            </button>
            <button className="bg-white/6 backdrop-blur-lg border border-white/14 rounded-xl p-6 text-center hover:scale-105 transition-transform">
              <div className="text-2xl mb-2">💰</div>
              <div className="text-white font-medium">我的兑换码</div>
            </button>
            <button className="bg-white/6 backdrop-blur-lg border border-white/14 rounded-xl p-6 text-center hover:scale-105 transition-transform">
              <div className="text-2xl mb-2">🎒</div>
              <div className="text-white font-medium">我的物品</div>
            </button>
          </div>
        </main>
      </div>

      {/* 签到成功弹窗 */}
      {showModal && rewardData && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl p-8 max-w-md w-full text-center shadow-2xl">
            <h3 className="text-2xl font-bold text-white mb-4">🎉 签到成功！</h3>
            <div className="space-y-3 mb-6">
              <p className="text-gray-300">获得经验: <span className="text-green-400 font-bold">+{rewardData.experience_gained}</span></p>
              <p className="text-gray-300">连续签到: <span className="text-blue-400 font-bold">{rewardData.consecutive_days} 天</span></p>
              {rewardData.redemption_code && (
                <div className="bg-black/20 border border-white/20 rounded-lg p-4">
                  <p className="text-gray-300 mb-2">获得兑换码:</p>
                  <div className="font-mono text-white bg-black/30 rounded px-3 py-2 mb-2">
                    {rewardData.redemption_code}
                  </div>
                  <p className="text-sm text-gray-400">金额: ¥{rewardData.code_amount}</p>
                </div>
              )}
            </div>
            <div className="flex space-x-3">
              {rewardData.redemption_code && (
                <button
                  onClick={() => copyCode(rewardData.redemption_code)}
                  className="flex-1 bg-green-600/20 hover:bg-green-600/30 border border-green-500/40 text-white py-2 px-4 rounded-lg transition-colors"
                >
                  复制兑换码
                </button>
              )}
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 bg-gray-600/20 hover:bg-gray-600/30 border border-gray-500/40 text-white py-2 px-4 rounded-lg transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .bg-grid-pattern {
          background-image: 
            repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.035) 0 1px, transparent 1px 50px),
            repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.035) 0 1px, transparent 1px 50px);
          background-size: 50px 50px;
        }
        
        .animate-grid-move {
          animation: gridMove 30s linear infinite;
        }
        
        @keyframes gridMove {
          0% {
            background-position: 0 0, 0 0;
            filter: hue-rotate(0deg);
          }
          100% {
            background-position: 200px 200px, 200px 200px;
            filter: hue-rotate(15deg);
          }
        }
        
        .bg-noise-pattern {
          background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.8'/></svg>");
          background-size: cover;
        }
        
        @media (prefers-reduced-motion: reduce) {
          .animate-grid-move {
            animation: none !important;
          }
        }
      `}</style>
    </>
  )
}