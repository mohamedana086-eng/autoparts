import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-guard';

// GET /api/admin/orders
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const orders = await prisma.order.findMany({
    include: { client: true, items: true },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({
    orders: orders.map((o) => ({
      id: o.id,
      reference: o.reference,
      clientName: o.client.name,
      status: o.status,
      createdAt: o.createdAt.toISOString(),
      units: o.items.reduce((n, i) => n + i.quantity, 0),
      total: o.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0),
    })),
  });
}
