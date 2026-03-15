export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateOTP } from '@/lib/auth'
import { sendOTPEmail } from '@/lib/email'
import { sendOTPSMS, sendOTPWhatsApp } from '@/lib/sms'

export async function POST(req: NextRequest) {
  try {
    const { target, method, name } = await req.json()

    if (!target || !method) {
      return NextResponse.json({ error: 'Target and method are required' }, { status: 400 })
    }

    if (!['email', 'sms', 'whatsapp'].includes(method)) {
      return NextResponse.json({ error: 'Invalid method' }, { status: 400 })
    }

    // Find or prepare user
    let user = null
    if (method === 'email') {
      user = await prisma.user.findUnique({ where: { email: target } })
    } else {
      user = await prisma.user.findUnique({ where: { phone: target } })
    }

    // Generate OTP
    const otp = generateOTP()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

    // Store OTP
    await prisma.otpCode.create({
      data: {
        userId: user?.id,
        target,
        code: otp,
        method,
        expiresAt,
      },
    })

    // Send OTP
    let sent = false
    switch (method) {
      case 'email':
        sent = await sendOTPEmail(target, otp)
        break
      case 'sms':
        sent = await sendOTPSMS(target, otp)
        break
      case 'whatsapp':
        sent = await sendOTPWhatsApp(target, otp)
        break
    }

    if (!sent) {
      return NextResponse.json({ error: 'Failed to send OTP' }, { status: 500 })
    }

    // In development, include OTP in response for testing
    const isDev = process.env.NODE_ENV !== 'production'
    return NextResponse.json({
      success: true,
      message: `OTP sent via ${method}`,
      isNewUser: !user,
      ...(isDev ? { otp } : {}),
    })
  } catch (error) {
    console.error('Send OTP error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
