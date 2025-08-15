'use client'

import { signIn, getSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  useEffect(() => {
    // 检查是否已登录
    getSession().then((session) => {
      if (session) {
        router.push('/dashboard')
      }
    })
  }, [router])

  const handleLinuxDoLogin = async () => {
    setLoading(true)
    try {
      await signIn('linuxdo', { callbackUrl: '/dashboard' })
    } catch (error) {
      console.error('Login error:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* 背景装饰层 */}
      <div className="fixed inset-0 bg-gradient-to-br from-blue-500/10 via-transparent to-green-500/10 pointer-events-none" />
      <div className="fixed inset-0 bg-grid-pattern opacity-[0.035] pointer-events-none animate-grid-move" />
      <div className="fixed inset-0 bg-noise-pattern opacity-[0.07] mix-blend-soft-light pointer-events-none" />

      <div className="min-h-screen bg-black/35 backdrop-blur-sm backdrop-saturate-120 flex items-center justify-center p-4 relative z-10">
        <div className="w-full max-w-md">
          {/* 登录卡片 */}
          <div className="bg-white/8 backdrop-blur-lg backdrop-saturate-140 border border-white/16 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
            {/* 卡片光效 */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/18 via-transparent to-white/8 pointer-events-none rounded-2xl" />
            
            <div className="relative z-10">
              {/* 标题区域 */}
              <div className="text-center mb-8">
                <div className="text-4xl mb-4">📅</div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent mb-2">
                  KYX 签到系统
                </h1>
                <p className="text-gray-400 text-sm">
                  使用 Linux Do 账号登录开始您的修仙之旅
                </p>
              </div>

              {/* 登录按钮 */}
              <div className="space-y-4">
                <button
                  onClick={handleLinuxDoLogin}
                  disabled={loading}
                  className="w-full bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 hover:border-blue-400/60 text-white font-medium py-4 px-6 rounded-xl transition-all duration-200 flex items-center justify-center space-x-3 backdrop-blur-sm disabled:opacity-50 disabled:cursor-not-allowed group"
                >
                  {loading ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/30 border-t-white" />
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 2C5.58 2 2 5.58 2 10s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6z" clipRule="evenodd" />
                      </svg>
                      <span>使用 Linux Do 登录</span>
                      <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </>
                  )}
                </button>

                {/* 功能预览 */}
                <div className="mt-8 space-y-3">
                  <div className="text-center text-sm text-gray-400 mb-4">系统功能</div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="bg-white/5 border border-white/10 rounded-lg p-3 text-center">
                      <div className="text-lg mb-1">✅</div>
                      <div className="text-gray-300">每日签到</div>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-lg p-3 text-center">
                      <div className="text-lg mb-1">🎯</div>
                      <div className="text-gray-300">等级系统</div>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-lg p-3 text-center">
                      <div className="text-lg mb-1">🎰</div>
                      <div className="text-gray-300">转盘抽奖</div>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-lg p-3 text-center">
                      <div className="text-lg mb-1">💰</div>
                      <div className="text-gray-300">兑换码</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 底部信息 */}
              <div className="mt-8 text-center text-xs text-gray-500">
                <p>登录即表示您同意我们的服务条款和隐私政策</p>
                <p className="mt-2">© 2024 KYX 签到系统</p>
              </div>
            </div>
          </div>
        </div>
      </div>

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