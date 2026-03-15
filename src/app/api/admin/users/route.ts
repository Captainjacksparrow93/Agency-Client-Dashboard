export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const users = await prisma.user.findMany({
    where: { role: 'client' },
    orderBy: { createdAt: 'desc' },
    include: {
      wallet: true,
      _count: { select: { tasks: true } },
    },
  })

  return NextResponse.json({ users })
}
