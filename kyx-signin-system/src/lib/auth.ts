import { NextAuthOptions } from 'next-auth'
import { PrismaAdapter } from '@next-auth/prisma-adapter'
import { prisma } from './prisma'
import jwt from 'jsonwebtoken'

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    {
      id: 'linuxdo',
      name: 'Linux Do',
      type: 'oauth',
      authorization: {
        url: 'https://connect.linux.do/oauth2/authorize',
        params: {
          scope: 'read',
          response_type: 'code',
        },
      },
      token: 'https://connect.linux.do/oauth2/token',
      userinfo: 'https://connect.linux.do/api/user',
      clientId: process.env.LINUX_DO_CLIENT_ID,
      clientSecret: process.env.LINUX_DO_CLIENT_SECRET,
      profile(profile) {
        return {
          id: profile.id.toString(),
          name: profile.username,
          email: profile.email,
          image: profile.avatar_url,
          linuxdo_level: profile.trust_level || 0,
        }
      },
    },
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === 'linuxdo') {
        try {
          // 查找或创建用户
          const existingUser = await prisma.user.findUnique({
            where: { linuxdo_id: user.id },
          })

          if (existingUser) {
            // 更新用户信息
            await prisma.user.update({
              where: { id: existingUser.id },
              data: {
                username: user.name || existingUser.username,
                email: user.email || existingUser.email,
                avatar_url: user.image || existingUser.avatar_url,
                linuxdo_level: (profile as any)?.trust_level || existingUser.linuxdo_level,
                updated_at: new Date(),
              },
            })
          } else {
            // 创建新用户
            await prisma.user.create({
              data: {
                linuxdo_id: user.id,
                username: user.name || 'Unknown',
                email: user.email,
                avatar_url: user.image,
                linuxdo_level: (profile as any)?.trust_level || 0,
                current_level: 1,
                experience: 0,
              },
            })
          }
          return true
        } catch (error) {
          console.error('Error in signIn callback:', error)
          return false
        }
      }
      return true
    },
    async jwt({ token, user, account }) {
      if (account && user) {
        const dbUser = await prisma.user.findUnique({
          where: { linuxdo_id: user.id },
        })
        if (dbUser) {
          token.userId = dbUser.id
          token.level = dbUser.current_level
          token.experience = dbUser.experience
        }
      }
      return token
    },
    async session({ session, token }) {
      if (token.userId && session.user) {
        session.user.id = token.userId as number
        session.user.level = token.level as number
        session.user.experience = token.experience as number
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
    error: '/auth/error',
  },
  session: {
    strategy: 'jwt',
  },
}

// JWT工具函数
export const generateJWT = (payload: any) => {
  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '7d' })
}

export const verifyJWT = (token: string) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET!)
  } catch (error) {
    return null
  }
}