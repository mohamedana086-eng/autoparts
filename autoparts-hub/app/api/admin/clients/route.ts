import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-guard';

// GET /api/admin/clients — every account, plus the tiers they can be moved to.
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const [clients, categories] = await Promise.all([
    prisma.client.findMany({ include: { category: true }, orderBy: { createdAt: 'desc' } }),
    prisma.clientCategory.findMany({ orderBy: { markupPercent: 'asc' } }),
  ]);

  return NextResponse.json({
    clients: clients.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      role: c.role,
      city: c.city,
      hasLogin: !!c.passwordHash,
      categoryId: c.categoryId,
      categoryName: c.category?.name ?? null,
    })),
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
  });
}
