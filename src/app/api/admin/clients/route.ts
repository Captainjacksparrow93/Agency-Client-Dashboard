export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { name, email, phone, company, walletBalance, retainerItems, retainerMonth } = await req.json()
  if (!name || (!email && !phone)) {
    return NextResponse.json({ error: 'Name and email or phone are required' }, { status: 400 })
  }

  // Check for existing
  if (email) {
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) return NextResponse.json({ error: 'Email already in use' }, { status: 400 })
  }
  if (phone) {
    const existing = await prisma.user.findUnique({ where: { phone } })
    if (existing) return NextResponse.json({ error: 'Phone already in use' }, { status: 400 })
  }

  const client = await prisma.user.create({
    data: {
      name,
      email: email || null,
      phone: phone || null,
      company: company || null,
      role: 'client',
      wallet: { create: { balance: walletBalance || 0 } },
    },
    include: { wallet: true },
  })

  // If retainer items provided, create a retainer task
  if (retainerItems && retainerItems.length > 0) {
    let totalCost = 0
    const taskItems: any[] = []

    for (const item of retainerItems) {
      const service = await prisma.serviceItem.findUnique({ where: { id: item.serviceItemId } })
      if (service) {
        const itemTotal = service.price * (item.quantity || 1)
        totalCost += itemTotal
        taskItems.push({
          serviceItemId: item.serviceItemId,
          quantity: item.quantity || 1,
          unitPrice: service.price,
          totalPrice: itemTotal,
          notes: item.notes,
        })
      }
    }

    await prisma.task.create({
      data: {
        userId: client.id,
        title: `Monthly Retainer - ${retainerMonth || new Date().toISOString().slice(0, 7)}`,
        description: `Monthly deliverables package for ${name}`,
        status: 'in_progress',
        priority: 'medium',
        totalCost,
        isRetainer: true,
        retainerMonth: retainerMonth || new Date().toISOString().slice(0, 7),
        items: { create: taskItems },
      },
    })
  }

  return NextResponse.json({ client })
}
