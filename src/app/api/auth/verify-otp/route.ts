export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { signToken } from '@/lib/auth'
import { cookies } from 'next/headers'

export async function POST(req: NextRequest) {
  try {
    const { target, code, method, name, company } = await req.json()

    if (!target || !code || !method) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Find valid OTP
    const otpRecord = await prisma.otpCode.findFirst({
      where: {
        target,
        code,
        method,
        used: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    })

    if (!otpRecord) {
      return NextResponse.json({ error: 'Invalid or expired OTP' }, { status: 400 })
    }

    // Mark OTP as used
    await prisma.otpCode.update({
      where: { id: otpRecord.id },
      data: { used: true },
    })

    // Find or create user
    let user
    if (method === 'email') {
      user = await prisma.user.findUnique({ where: { email: target } })
      if (!user) {
        user = await prisma.user.create({
          data: {
            name: name || target.split('@')[0],
            email: target,
            company: company || null,
            wallet: { create: { balance: 0 } },
          },
        })
      }
    } else {
      user = await prisma.user.findUnique({ where: { phone: target } })
      if (!user) {
        user = await prisma.user.create({
          data: {
            name: name || 'User',
            phone: target,
            company: company || null,
            wallet: { create: { balance: 0 } },
          },
        })
      }
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
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: '/',
    })

    // Get user with wallet
    const fullUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: { wallet: true },
    })

    return NextResponse.json({ success: true, user: fullUser })
  } catch (error) {
    console.error('Verify OTP error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
