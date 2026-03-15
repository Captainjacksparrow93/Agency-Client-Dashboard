export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { name, role, permissions } = await req.json()

  const member = await prisma.user.update({
    where: { id: params.id },
    data: {
      ...(name && { name }),
      ...(role && { role }),
      ...(permissions && { permissions: JSON.stringify(permissions) }),
    },
  })

  return NextResponse.json({ member })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Don't allow deleting yourself
  if (params.id === user.id) {
    return NextResponse.json({ error: 'Cannot remove yourself' }, { status: 400 })
  }

  // Unassign from tasks first
  await prisma.task.updateMany({
    where: { assignedPmId: params.id },
    data: { assignedPmId: null },
  })

  // Delete wallet then user
  await prisma.wallet.deleteMany({ where: { userId: params.id } })
  await prisma.user.delete({ where: { id: params.id } })

  return NextResponse.json({ success: true })
}
