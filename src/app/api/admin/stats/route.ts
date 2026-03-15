export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const user = await getCurrentUser()
  if (!user || (user.role !== 'admin' && user.role !== 'pm')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [
    totalUsers,
    totalTasks,
    pendingTasks,
    inProgressTasks,
    completedTasks,
    reviewTasks,
    cancelledTasks,
    totalRevenue,
    totalSpent,
    teamMembers,
    activeServices,
    recentTransactions,
    avgTaskCost,
    retainerTasks,
  ] = await Promise.all([
    prisma.user.count({ where: { role: 'client' } }),
    prisma.task.count(),
    prisma.task.count({ where: { status: 'pending' } }),
    prisma.task.count({ where: { status: 'in_progress' } }),
    prisma.task.count({ where: { status: 'completed' } }),
    prisma.task.count({ where: { status: 'review' } }),
    prisma.task.count({ where: { status: 'cancelled' } }),
    prisma.transaction.aggregate({
      where: { type: 'credit', status: 'completed' },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { type: 'debit', status: 'completed' },
      _sum: { amount: true },
    }),
    prisma.user.count({ where: { role: { in: ['admin', 'pm'] } } }),
    prisma.serviceItem.count({ where: { isActive: true } }),
    prisma.transaction.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { user: { select: { name: true, email: true } } },
    }),
    prisma.task.aggregate({ _avg: { totalCost: true } }),
    prisma.task.count({ where: { isRetainer: true } }),
  ])

  // Category breakdown
  const tasksByCategory = await prisma.taskItem.groupBy({
    by: ['serviceItemId'],
    _sum: { totalPrice: true },
    _count: true,
  })

  return NextResponse.json({
    totalUsers,
    totalTasks,
    pendingTasks,
    inProgressTasks,
    completedTasks,
    reviewTasks,
    cancelledTasks,
    totalRevenue: totalRevenue._sum.amount || 0,
    totalSpent: totalSpent._sum.amount || 0,
    teamMembers,
    activeServices,
    recentTransactions,
    avgTaskCost: Math.round(avgTaskCost._avg.totalCost || 0),
    retainerTasks,
    completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
  })
}
