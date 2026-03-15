export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Set or update ETA on a task
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser()
  if (!user || (user.role !== 'admin' && user.role !== 'pm')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { etaHours, extendBy, progressPct, assignedPmId } = await req.json()

  const task = await prisma.task.findUnique({ where: { id: params.id } })
  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  const updateData: any = {}

  // Set initial ETA
  if (etaHours !== undefined) {
    updateData.etaHours = parseFloat(etaHours)
    if (!task.etaStartedAt) {
      updateData.etaStartedAt = new Date()
    }
  }

  // Extend ETA
  if (extendBy !== undefined && extendBy > 0) {
    updateData.etaExtendedBy = (task.etaExtendedBy || 0) + parseFloat(extendBy)
  }

  // Update progress
  if (progressPct !== undefined) {
    updateData.progressPct = Math.min(100, Math.max(0, parseInt(progressPct)))
  }

  // Assign PM
  if (assignedPmId !== undefined) {
    updateData.assignedPmId = assignedPmId || null
  }

  const updated = await prisma.task.update({
    where: { id: params.id },
    data: updateData,
    include: {
      assignedPm: { select: { name: true, email: true } },
    },
  })

  return NextResponse.json({ task: updated })
}
