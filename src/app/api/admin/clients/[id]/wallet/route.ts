export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notifications'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { type, amount, description } = await req.json()

  if (!type || !amount || Number(amount) <= 0) {
    return NextResponse.json({ error: 'Type and a positive amount are required' }, { status: 400 })
  }
  if (type !== 'credit' && type !== 'debit') {
    return NextResponse.json({ error: 'Type must be credit or debit' }, { status: 400 })
  }

  const clientId = params.id
  const parsedAmount = parseFloat(amount)

  const client = await prisma.user.findUnique({
    where: { id: clientId, role: 'client' },
    include: { wallet: true },
  })
  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  const currentBalance = client.wallet?.balance ?? 0
  if (type === 'debit' && currentBalance < parsedAmount) {
    return NextResponse.json({
      error: 'Insufficient balance',
      available: currentBalance,
    }, { status: 400 })
  }

  const updatedWallet = await prisma.$transaction(async (tx) => {
    // Ensure wallet exists
    if (!client.wallet) {
      await tx.wallet.create({ data: { userId: clientId, balance: 0 } })
    }

    const wallet = await tx.wallet.update({
      where: { userId: clientId },
      data: { balance: type === 'credit' ? { increment: parsedAmount } : { decrement: parsedAmount } },
    })

    await tx.transaction.create({
      data: {
        userId: clientId,
        type,
        amount: parsedAmount,
        description: description || (type === 'credit' ? 'Admin credit' : 'Admin debit'),
        status: 'completed',
      },
    })

    return wallet
  })

  await createNotification(
    clientId,
    type === 'credit' ? 'Funds Added to Wallet' : 'Funds Deducted from Wallet',
    `${type === 'credit' ? `₹${parsedAmount} has been added to` : `₹${parsedAmount} has been deducted from`} your wallet${description ? ` — ${description}` : '.'}`,
    'payment'
  )

  return NextResponse.json({ wallet: updatedWallet })
}
