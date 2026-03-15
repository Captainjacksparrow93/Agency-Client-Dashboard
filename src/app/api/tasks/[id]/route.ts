export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createNotification, createNotificationsForRoles } from '@/lib/notifications'

// Get single task
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const task = await prisma.task.findUnique({
    where: { id: params.id },
    include: {
      items: { include: { serviceItem: true } },
      user: { select: { id: true, name: true, email: true, company: true } },
      assignedPm: { select: { id: true, name: true, email: true } },
      assignedEmployee: { select: { id: true, name: true, email: true, employeeRole: true } },
      feedbacks: { orderBy: { round: 'asc' }, include: { user: { select: { name: true } } } },
      changeRequests: { orderBy: { createdAt: 'desc' } },
      messages: {
        orderBy: { createdAt: 'asc' },
        include: { user: { select: { name: true, role: true } } },
      },
    },
  })

  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  // Allow task owner, admin, pm, or assigned employee
  const canAccess =
    task.userId === user.id ||
    user.role === 'admin' ||
    user.role === 'pm' ||
    task.assignedEmployeeId === user.id

  if (!canAccess) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json({ task })
}

// Update task (admin/pm: status, assignment, eta, progress; employee: progress only)
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const isStaff = user.role === 'admin' || user.role === 'pm'
  const isEmployee = user.role === 'employee'

  if (!isStaff && !isEmployee) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()

  const task = await prisma.task.findUnique({
    where: { id: params.id },
    include: { user: { select: { id: true, name: true } } },
  })
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  // Employee can only update progress
  if (isEmployee) {
    if (task.assignedEmployeeId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const { progressPct } = body
    const updated = await prisma.task.update({
      where: { id: params.id },
      data: { progressPct: progressPct ?? task.progressPct },
    })
    return NextResponse.json({ task: updated })
  }

  // Staff: full update
  const {
    status,
    assignedPmId,
    assignedEmployeeId,
    etaHours,
    etaExtendedBy,
    progressPct,
  } = body

  const validStatuses = ['pending', 'in_progress', 'in_review', 'completed', 'cancelled']
  if (status && !validStatuses.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const updateData: any = {}
  if (status !== undefined) updateData.status = status
  if (assignedPmId !== undefined) updateData.assignedPmId = assignedPmId
  if (assignedEmployeeId !== undefined) updateData.assignedEmployeeId = assignedEmployeeId
  if (etaHours !== undefined) updateData.etaHours = etaHours
  if (etaExtendedBy !== undefined) updateData.etaExtendedBy = etaExtendedBy
  if (progressPct !== undefined) updateData.progressPct = progressPct

  // When moving to in_progress, record start time
  if (status === 'in_progress' && task.status !== 'in_progress') {
    updateData.etaStartedAt = new Date()
  }

  const updated = await prisma.task.update({
    where: { id: params.id },
    data: updateData,
    include: {
      user: { select: { id: true, name: true } },
      assignedPm: { select: { id: true, name: true } },
      assignedEmployee: { select: { id: true, name: true } },
    },
  })

  // Send notifications based on status change
  if (status && status !== task.status) {
    if (status === 'in_progress') {
      // Notify client
      await createNotification(
        updated.userId,
        'Work Started',
        `Your task "${updated.title}" is now in progress`,
        'task_updated',
        updated.id
      )
      // Notify assigned employee if any
      if (updated.assignedEmployeeId) {
        await createNotification(
          updated.assignedEmployeeId,
          'Task Assigned',
          `You have been assigned to "${updated.title}"`,
          'task_updated',
          updated.id
        )
      }
    } else if (status === 'in_review') {
      // Notify client to review
      await createNotification(
        updated.userId,
        'Ready for Review',
        `Your task "${updated.title}" is ready for your review`,
        'task_updated',
        updated.id
      )
    } else if (status === 'completed') {
      // Notify client
      await createNotification(
        updated.userId,
        'Task Completed',
        `Your task "${updated.title}" has been completed`,
        'task_updated',
        updated.id
      )
    } else if (status === 'cancelled') {
      // Refund to wallet
      await prisma.wallet.update({
        where: { userId: updated.userId },
        data: { balance: { increment: task.totalCost } },
      })
      await prisma.transaction.create({
        data: {
          userId: updated.userId,
          type: 'credit',
          amount: task.totalCost,
          description: `Refund: ${updated.title} (Cancelled)`,
          taskId: updated.id,
          status: 'completed',
        },
      })
      await createNotification(
        updated.userId,
        'Task Cancelled',
        `Your task "${updated.title}" was cancelled. ₹${task.totalCost} refunded to wallet.`,
        'task_updated',
        updated.id
      )
    }
  }

  // Notify employee when assigned
  if (
    assignedEmployeeId &&
    assignedEmployeeId !== task.assignedEmployeeId &&
    status !== 'in_progress'
  ) {
    await createNotification(
      assignedEmployeeId,
      'Task Assigned',
      `You have been assigned to "${updated.title}"`,
      'task_updated',
      updated.id
    )
  }

  return NextResponse.json({ task: updated })
}
