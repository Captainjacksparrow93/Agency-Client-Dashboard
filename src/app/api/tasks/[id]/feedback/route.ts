export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createNotification, createNotificationsForRoles } from '@/lib/notifications'

// POST /api/tasks/[id]/feedback — client submits feedback (max 2 rounds)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'client') return NextResponse.json({ error: 'Only clients can submit feedback' }, { status: 403 })

  const task = await prisma.task.findUnique({
    where: { id: params.id },
    include: { feedbacks: true },
  })
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  if (task.userId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (task.status !== 'in_review') {
    return NextResponse.json({ error: 'Task must be in review to submit feedback' }, { status: 400 })
  }
  if (task.feedbackCount >= 2) {
    return NextResponse.json({
      error: 'Maximum 2 feedback rounds reached. Please use Change Request for additional changes.',
    }, { status: 400 })
  }

  const { content } = await req.json()
  if (!content?.trim()) {
    return NextResponse.json({ error: 'Feedback content is required' }, { status: 400 })
  }

  const round = task.feedbackCount + 1

  await prisma.$transaction(async (tx) => {
    await tx.taskFeedback.create({
      data: { taskId: task.id, userId: user.id, round, content: content.trim() },
    })
    await tx.task.update({
      where: { id: task.id },
      data: { status: 'in_progress', feedbackCount: round },
    })
  })

  // Notify PM, admin, and assigned employee
  await createNotificationsForRoles(
    ['admin', 'pm'],
    `Feedback Round ${round}: ${task.title}`,
    `Client submitted feedback (round ${round} of 2). Task moved back to in progress.`,
    'feedback',
    task.id
  )
  if (task.assignedEmployeeId) {
    await createNotification(
      task.assignedEmployeeId,
      `Feedback Round ${round}: ${task.title}`,
      `Client has submitted feedback. Please review and update the task.`,
      'feedback',
      task.id
    )
  }

  return NextResponse.json({ ok: true, round, feedbackCount: round })
}

// GET /api/tasks/[id]/feedback — get feedback history
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

  const feedbacks = await prisma.taskFeedback.findMany({
    where: { taskId: params.id },
    orderBy: { round: 'asc' },
    include: { user: { select: { name: true } } },
  })

  return NextResponse.json({ feedbacks })
}
