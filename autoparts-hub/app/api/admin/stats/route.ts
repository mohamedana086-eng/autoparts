import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-guard';

// GET /api/admin/stats — dashboard counters.
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const [products, clients, activeRules, orders] = await Promise.all([
    prisma.product.count(),
    prisma.client.count(),
    prisma.markupRule.count({ where: { active: true } }),
    prisma.order.count(),
  ]);

  return NextResponse.json({ products, clients, activeRules, orders });
}
