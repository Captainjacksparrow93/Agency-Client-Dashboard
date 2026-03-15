export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

// GET /api/employees — list all employees
export async function GET() {
  const user = await getCurrentUser()
  if (!user || (user.role !== 'admin' && user.role !== 'pm')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const employees = await prisma.user.findMany({
    where: { role: 'employee' },
    select: {
      id: true, name: true, email: true, employeeRole: true, createdAt: true,
      _count: {
        select: {
          employeeTasks: { where: { status: { not: 'completed' } } },
        },
      },
    },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json({ employees })
}

// POST /api/employees — create a new employee (admin only)
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { name, email, password, employeeRole } = await req.json()
  if (!name?.trim() || !email?.trim() || !password?.trim()) {
    return NextResponse.json({ error: 'Name, email, and password are required' }, { status: 400 })
  }

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } })
  if (existing) {
    return NextResponse.json({ error: 'Email already in use' }, { status: 400 })
  }

  const hashed = await bcrypt.hash(password, 10)
  const employee = await prisma.user.create({
    data: {
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashed,
      role: 'employee',
      employeeRole: employeeRole || null,
    },
    select: { id: true, name: true, email: true, employeeRole: true, createdAt: true },
  })

  return NextResponse.json({ employee }, { status: 201 })
}
