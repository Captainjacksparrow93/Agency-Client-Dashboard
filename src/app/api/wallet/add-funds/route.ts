export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Razorpay from 'razorpay'
import crypto from 'crypto'

const razorpay = process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
  ? new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    })
  : null

// Create Razorpay order
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { amount } = await req.json()
  if (!amount || amount < 100) {
    return NextResponse.json({ error: 'Minimum amount is ₹100' }, { status: 400 })
  }

  // If Razorpay is not configured, simulate payment (dev mode)
  if (!razorpay) {
    // Direct wallet credit for development
    await prisma.wallet.update({
      where: { userId: user.id },
      data: { balance: { increment: amount } },
    })

    await prisma.transaction.create({
      data: {
        userId: user.id,
        type: 'credit',
        amount,
        description: `Wallet top-up (Dev Mode)`,
        status: 'completed',
      },
    })

    const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } })
    return NextResponse.json({
      success: true,
      devMode: true,
      balance: wallet?.balance,
      message: 'Funds added (dev mode - no payment gateway)',
    })
  }

  try {
    const order = await razorpay.orders.create({
      amount: amount * 100, // Razorpay expects paise
      currency: 'INR',
      receipt: `wallet_${user.id}_${Date.now()}`,
      notes: { userId: user.id, type: 'wallet_topup' },
    })

    return NextResponse.json({ orderId: order.id, amount, currency: 'INR' })
  } catch (error) {
    console.error('Razorpay order error:', error)
    return NextResponse.json({ error: 'Failed to create payment order' }, { status: 500 })
  }
}

// Verify Razorpay payment
export async function PUT(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = await req.json()

  // Verify signature
  const body = razorpay_order_id + '|' + razorpay_payment_id
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
    .update(body)
    .digest('hex')

  if (expectedSignature !== razorpay_signature) {
    return NextResponse.json({ error: 'Payment verification failed' }, { status: 400 })
  }

  // Credit wallet
  await prisma.wallet.update({
    where: { userId: user.id },
    data: { balance: { increment: amount } },
  })

  await prisma.transaction.create({
    data: {
      userId: user.id,
      type: 'credit',
      amount,
      description: `Wallet top-up via Razorpay`,
      razorpayId: razorpay_payment_id,
      status: 'completed',
    },
  })

  const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } })
  return NextResponse.json({ success: true, balance: wallet?.balance })
}
