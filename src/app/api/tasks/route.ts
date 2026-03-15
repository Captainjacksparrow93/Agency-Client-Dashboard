export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendTelegramMessage, formatTaskNotification } from '@/lib/telegram'
import { createNotificationsForRoles } from '@/lib/notifications'

// Get all tasks for current user
export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let where: any = {}
  if (user.role === 'admin') {
    where = {}
  } else if (user.role === 'pm') {
    where = { OR: [{ assignedPmId: user.id }, { assignedPmId: null }] }
  } else if (user.role === 'employee') {
    where = { assignedEmployeeId: user.id }
  } else {
    where = { userId: user.id }
  }

  const tasks = await prisma.task.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      items: { include: { serviceItem: true } },
      user: { select: { name: true, email: true, company: true } },
      assignedPm: { select: { id: true, name: true, email: true } },
      assignedEmployee: { select: { id: true, name: true, email: true, employeeRole: true } },
      feedbacks: { orderBy: { round: 'asc' } },
      changeRequests: { orderBy: { createdAt: 'desc' } },
      _count: { select: { messages: true } },
    },
  })

  return NextResponse.json({ tasks })
}

// Create a new task
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { title, description, priority, items, dueDate } = await req.json()

  if (!title || !items || items.length === 0) {
    return NextResponse.json({ error: 'Title and at least one service item are required' }, { status: 400 })
  }

  // Calculate total cost
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

  // Check wallet balance
  const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } })
  if (!wallet || wallet.balance < totalCost) {
    return NextResponse.json({
      error: 'Insufficient wallet balance',
      required: totalCost,
      available: wallet?.balance || 0,
    }, { status: 400 })
  }

  // Create task and deduct balance in a transaction
  const task = await prisma.$transaction(async (tx) => {
    // Deduct from wallet
    await tx.wallet.update({
      where: { userId: user.id },
      data: { balance: { decrement: totalCost } },
    })

    // Create task
    const newTask = await tx.task.create({
      data: {
        userId: user.id,
        title,
        description: description || '',
        priority: priority || 'medium',
        totalCost,
        dueDate: dueDate ? new Date(dueDate) : null,
        items: {
          create: taskItems,
        },
      },
      include: {
        items: { include: { serviceItem: true } },
        user: { select: { name: true, email: true, company: true } },
      },
    })

    // Create debit transaction
    await tx.transaction.create({
      data: {
        userId: user.id,
        type: 'debit',
        amount: totalCost,
        description: `Task: ${title}`,
        taskId: newTask.id,
        status: 'completed',
      },
    })

    return newTask
  })

  // Notify admins and PMs
  await createNotificationsForRoles(
    ['admin', 'pm'],
    `New Task: ${title}`,
    `${user.name}${user.company ? ` (${user.company})` : ''} submitted a new task`,
    'task_created',
    task.id
  )

  // Send Telegram notification
  await sendTelegramMessage(
    formatTaskNotification({
      id: task.id,
      title: task.title,
      description: task.description,
      totalCost: task.totalCost,
      priority: task.priority,
      userName: task.user.name,
      company: task.user.company || undefined,
    })
  )

  return NextResponse.json({ task })
}
