export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const services = await prisma.serviceItem.findMany({ orderBy: { sortOrder: 'asc' } })
  return NextResponse.json({ services })
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { name, description, category, price, unit, sortOrder } = await req.json()
  if (!name || !category || !price) {
    return NextResponse.json({ error: 'Name, category, and price are required' }, { status: 400 })
  }

  const service = await prisma.serviceItem.create({
    data: {
      name,
      description: description || '',
      category,
      price: parseFloat(price),
      unit: unit || 'per piece',
      sortOrder: sortOrder || 0,
    },
  })

  return NextResponse.json({ service })
}
