export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notifications'

export async function GET() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const tasks = await prisma.task.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      items: { include: { serviceItem: true } },
      user: { select: { name: true, email: true, company: true } },
      _count: { select: { messages: { where: { isRead: false, sender: 'client' } } } },
    },
  })

  return NextResponse.json({ tasks })
}

// Admin creates a task on behalf of a client
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { clientId, title, description, priority, items, dueDate } = await req.json()

  if (!clientId || !title || !items || items.length === 0) {
    return NextResponse.json({ error: 'clientId, title and at least one service item are required' }, { status: 400 })
  }

  const client = await prisma.user.findUnique({
    where: { id: clientId, role: 'client' },
    select: { id: true, name: true, company: true },
  })
  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  let totalCost = 0
  const taskItems: { serviceItemId: string; quantity: number; unitPrice: number; totalPrice: number; notes?: string }[] = []

  for (const item of items) {
    const service = await prisma.serviceItem.findUnique({ where: { id: item.serviceItemId } })
    if (!service) {
      return NextResponse.json({ error: `Service not found: ${item.serviceItemId}` }, { status: 400 })
    }
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

  const task = await prisma.task.create({
    data: {
      userId: clientId,
      title,
      description: description || '',
      priority: priority || 'medium',
      totalCost,
      dueDate: dueDate ? new Date(dueDate) : null,
      items: { create: taskItems },
    },
    include: {
      items: { include: { serviceItem: true } },
      user: { select: { name: true, email: true, company: true } },
    },
  })

  // Notify the client
  await createNotification(
    clientId,
    'New Task Added',
    `A new task "${title}" has been created for you.`,
    'task_created',
    task.id
  )

  return NextResponse.json({ task })
}
