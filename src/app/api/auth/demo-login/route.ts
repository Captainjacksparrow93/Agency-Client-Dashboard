export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { signToken } from '@/lib/auth'
import { cookies } from 'next/headers'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    // Demo credentials check
    const demoAccounts: Record<string, { password: string }> = {
      'demo@client.com': { password: 'demo1234' },
      'admin@adflow.agency': { password: 'admin1234' },
      'pm@adflow.agency': { password: 'pm1234' },
      'employee@adflow.agency': { password: 'emp1234' },
    }

    const account = demoAccounts[email]
    if (!account || account.password !== password) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    // Find the user
    const user = await prisma.user.findUnique({
      where: { email },
      include: { wallet: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found. Please run the database seed first.' }, { status: 404 })
    }

    // Generate JWT
    const token = signToken({
      userId: user.id,
      email: user.email || undefined,
      phone: user.phone || undefined,
      role: user.role,
    })

    // Set cookie
    const cookieStore = cookies()
    cookieStore.set('auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    })

    return NextResponse.json({ success: true, user })
  } catch (error) {
    console.error('Demo login error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
