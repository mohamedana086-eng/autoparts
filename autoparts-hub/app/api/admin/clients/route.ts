import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireStaff } from '@/lib/admin-guard';

// GET /api/admin/clients — every account, plus the tiers they can be moved to.
export async function GET() {
  const gate = await requireStaff();
  if (!gate.ok) return gate.response;

  // A salesperson sees their own customers and nobody else's. Scoped in the
  // query rather than filtered after loading: a filter is one forgotten
  // `return` away from serving the whole client list.
  const scope = gate.isAdmin ? {} : { salesManagerId: gate.session.userId };

  const [clients, categories, currencies, salesStaff] = await Promise.all([
    prisma.client.findMany({
      where: scope,
      include: { category: true, currency: true, salesManager: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.clientCategory.findMany({ orderBy: { markupPercent: 'asc' } }),
    prisma.currency.findMany({ where: { active: true }, orderBy: [{ isBase: 'desc' }, { code: 'asc' }] }),
    // Its own query, not derived from the list above: that one is scoped to a
    // salesperson's own customers, which would leave the dropdown listing
    // whichever staff happened to be among them — usually none.
    prisma.client.findMany({ where: { role: 'SALES' }, orderBy: { name: 'asc' } }),
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
    salesManagers: salesStaff.map((c) => ({ id: c.id, name: c.name })),
  });
}
