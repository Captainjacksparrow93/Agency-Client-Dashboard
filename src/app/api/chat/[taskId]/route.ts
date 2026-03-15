export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendTelegramMessage, formatChatMessage } from '@/lib/telegram'

// Get messages for a task
export async function GET(req: NextRequest, { params }: { params: { taskId: string } }) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const task = await prisma.task.findUnique({
    where: { id: params.taskId },
    select: { userId: true, title: true },
  })

  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  if (task.userId !== user.id && user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const messages = await prisma.message.findMany({
    where: { taskId: params.taskId },
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { name: true, role: true } } },
  })

  // Mark unread messages as read
  await prisma.message.updateMany({
    where: {
      taskId: params.taskId,
      isRead: false,
      sender: user.role === 'admin' ? 'client' : 'agency',
    },
    data: { isRead: true },
  })

  return NextResponse.json({ messages, taskTitle: task.title })
}

// Send a message
export async function POST(req: NextRequest, { params }: { params: { taskId: string } }) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { content } = await req.json()
  if (!content?.trim()) {
    return NextResponse.json({ error: 'Message content is required' }, { status: 400 })
  }

  const task = await prisma.task.findUnique({
    where: { id: params.taskId },
    select: { userId: true, title: true },
  })

  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  if (task.userId !== user.id && user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const message = await prisma.message.create({
    data: {
      taskId: params.taskId,
      userId: user.id,
      content: content.trim(),
      sender: user.role === 'admin' ? 'agency' : 'client',
    },
    include: { user: { select: { name: true, role: true } } },
  })

  // Send to Telegram if message is from client
  if (user.role !== 'admin') {
    await sendTelegramMessage(
      formatChatMessage({
        userName: user.name,
        taskTitle: task.title,
        content: content.trim(),
        taskId: params.taskId,
      })
    )
  }

  return NextResponse.json({ message })
}
