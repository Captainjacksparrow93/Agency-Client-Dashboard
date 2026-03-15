export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const team = await prisma.user.findMany({
    where: { role: { in: ['admin', 'pm'] } },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      permissions: true,
      createdAt: true,
      _count: { select: { assignedTasks: true } },
    },
  })

  return NextResponse.json({ team })
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { name, email, role, permissions } = await req.json()
  if (!name || !email) {
    return NextResponse.json({ error: 'Name and email are required' }, { status: 400 })
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json({ error: 'Email already exists' }, { status: 400 })
  }

  const member = await prisma.user.create({
    data: {
      name,
      email,
      role: role || 'pm',
      permissions: JSON.stringify(permissions || ['task_update', 'eta_manage', 'chat', 'view_tasks']),
      wallet: { create: { balance: 0 } },
    },
  })

  return NextResponse.json({ member })
}
