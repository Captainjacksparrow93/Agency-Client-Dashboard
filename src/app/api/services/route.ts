export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const services = await prisma.serviceItem.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  })

  // Group by category
  const grouped = services.reduce((acc: Record<string, typeof services>, item) => {
    if (!acc[item.category]) acc[item.category] = []
    acc[item.category].push(item)
    return acc
  }, {})

  return NextResponse.json({ services, grouped })
}
