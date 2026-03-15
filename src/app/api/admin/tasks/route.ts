export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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
