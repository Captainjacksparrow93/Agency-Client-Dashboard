export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createNotificationsForRoles } from '@/lib/notifications'

// POST /api/tasks/[id]/change-request — client submits paid change request
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'client') {
    return NextResponse.json({ error: 'Only clients can submit change requests' }, { status: 403 })
  }

  const task = await prisma.task.findUnique({ where: { id: params.id } })
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  if (task.userId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { title, description, cost } = await req.json()
  if (!title?.trim() || !description?.trim() || !cost || cost <= 0) {
    return NextResponse.json({ error: 'Title, description, and cost are required' }, { status: 400 })
  }

  // Check wallet balance
  const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } })
  if (!wallet || wallet.balance < cost) {
    return NextResponse.json({
      error: 'Insufficient wallet balance',
      required: cost,
      available: wallet?.balance || 0,
    }, { status: 400 })
  }

  // Deduct from wallet and create change request
  const changeRequest = await prisma.$transaction(async (tx) => {
    await tx.wallet.update({
      where: { userId: user.id },
      data: { balance: { decrement: cost } },
    })
    await tx.transaction.create({
      data: {
        userId: user.id,
        type: 'debit',
        amount: cost,
        description: `Change Request: ${title}`,
        taskId: task.id,
        status: 'completed',
      },
    })
    const cr = await tx.changeRequest.create({
      data: {
        taskId: task.id,
        userId: user.id,
        title: title.trim(),
        description: description.trim(),
        cost,
        status: 'paid',
      },
    })
    return cr
  })

  // Notify admins and PMs
  await createNotificationsForRoles(
    ['admin', 'pm'],
    `Change Request: ${task.title}`,
    `${user.name} submitted a paid change request: "${title}"`,
    'change_request',
    task.id
  )

  return NextResponse.json({ changeRequest })
}

// GET /api/tasks/[id]/change-request — list change requests for a task
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const task = await prisma.task.findUnique({ where: { id: params.id } })
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  const canAccess =
    task.userId === user.id ||
    user.role === 'admin' ||
    user.role === 'pm' ||
    task.assignedEmployeeId === user.id

  if (!canAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const changeRequests = await prisma.changeRequest.findMany({
    where: { taskId: params.id },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ changeRequests })
}

// PATCH /api/tasks/[id]/change-request — admin/pm update change request status
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser()
  if (!user || (user.role !== 'admin' && user.role !== 'pm')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { changeRequestId, status } = await req.json()
  const validStatuses = ['pending', 'paid', 'in_progress', 'completed']
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const updated = await prisma.changeRequest.update({
    where: { id: changeRequestId },
    data: { status },
  })

  return NextResponse.json({ changeRequest: updated })
}
