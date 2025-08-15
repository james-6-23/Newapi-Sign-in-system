import NextAuth from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: number
      name?: string | null
      email?: string | null
      image?: string | null
      level: number
      experience: number
    }
  }

  interface User {
    id: string
    name?: string | null
    email?: string | null
    image?: string | null
    linuxdo_level?: number
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: number
    level?: number
    experience?: number
  }
}