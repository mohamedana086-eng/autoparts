import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-guard';

// GET /api/admin/clients — every account, plus the tiers they can be moved to.
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const [clients, categories, currencies] = await Promise.all([
    prisma.client.findMany({
      include: { category: true, currency: true, salesManager: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.clientCategory.findMany({ orderBy: { markupPercent: 'asc' } }),
    prisma.currency.findMany({ where: { active: true }, orderBy: [{ isBase: 'desc' }, { code: 'asc' }] }),
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
      discountPercent: c.discountPercent,
      currencyId: c.currencyId,
      currencyCode: c.currency?.code ?? null,
      salesManagerId: c.salesManagerId,
      salesManagerName: c.salesManager?.name ?? null,
    })),
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
    currencies: currencies.map((c) => ({ id: c.id, name: `${c.code} — ${c.name}` })),
    // Staff accounts that can own a customer. Drawn from the same table by
    // role, the way ADMIN already is, so there is no second place a person
    // can exist.
    salesManagers: clients
      .filter((c) => c.role === 'SALES')
      .map((c) => ({ id: c.id, name: c.name })),
  });
}
