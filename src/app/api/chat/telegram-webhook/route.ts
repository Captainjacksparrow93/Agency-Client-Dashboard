export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Telegram webhook to receive messages from agency team
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const message = body?.message

    if (!message?.text) {
      return NextResponse.json({ ok: true })
    }

    const text = message.text
    const telegramId = message.message_id?.toString()

    // Expected format: /reply TASK_ID message content
    if (text.startsWith('/reply ')) {
      const parts = text.substring(7).split(' ')
      const taskId = parts[0]
      const content = parts.slice(1).join(' ')

      if (!taskId || !content) {
        return NextResponse.json({ ok: true })
      }

      const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: { id: true, userId: true },
      })

      if (!task) {
        return NextResponse.json({ ok: true })
      }

      // Find admin user to attribute the message
      const admin = await prisma.user.findFirst({ where: { role: 'admin' } })
      if (!admin) {
        return NextResponse.json({ ok: true })
      }

      await prisma.message.create({
        data: {
          taskId: task.id,
          userId: admin.id,
          content,
          sender: 'agency',
          telegramId,
        },
      })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Telegram webhook error:', error)
    return NextResponse.json({ ok: true })
  }
}
