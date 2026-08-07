import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-guard';

const ROLES = ['ADMIN', 'SALES', 'B2B', 'RETAIL'];

// PATCH /api/admin/clients/<id>
// { role, categoryId, discountPercent, currencyId, salesManagerId }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const role = String(body.role ?? '');
  if (!ROLES.includes(role)) {
    return NextResponse.json({ error: 'Unknown role.' }, { status: 400 });
  }

  const categoryId = body.categoryId ? String(body.categoryId) : null;
  if (categoryId) {
    const exists = await prisma.clientCategory.findUnique({ where: { id: categoryId } });
    if (!exists) return NextResponse.json({ error: 'Unknown pricing tier.' }, { status: 400 });
  }

  const existing = await prisma.client.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: 'Client not found.' }, { status: 404 });

  // Percent off the marked-up price — see the order of operations in
  // lib/pricing.ts. Rejected outside 0–100 here rather than clamped, because
  // an admin typing 150 meant something and should be told, where the engine
  // clamps defensively against data that is already stored.
  const discountPercent = body.discountPercent === undefined ? existing.discountPercent : Number(body.discountPercent);
  if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
    return NextResponse.json(
      { error: 'Discount must be between 0 and 100 percent.' },
      { status: 400 }
    );
  }

  const currencyId = body.currencyId ? String(body.currencyId) : null;
  if (currencyId) {
    const currency = await prisma.currency.findUnique({ where: { id: currencyId } });
    if (!currency) return NextResponse.json({ error: 'Unknown currency.' }, { status: 400 });
    if (!currency.active) {
      return NextResponse.json(
        { error: `${currency.code} is not active. Activate it before quoting anyone in it.` },
        { status: 400 }
      );
    }
  }

  const salesManagerId = body.salesManagerId ? String(body.salesManagerId) : null;
  if (salesManagerId) {
    // An account cannot look after itself, and only SALES staff can own a
    // customer — otherwise a customer could be assigned as another's manager
    // and would gain their orders once SALES scoping lands.
    if (salesManagerId === params.id) {
      return NextResponse.json(
        { error: 'An account cannot be its own sales manager.' },
        { status: 400 }
      );
    }
    const manager = await prisma.client.findUnique({ where: { id: salesManagerId } });
    if (!manager) return NextResponse.json({ error: 'Unknown sales manager.' }, { status: 400 });
    if (manager.role !== 'SALES') {
      return NextResponse.json(
        { error: `${manager.name} is not a sales account.` },
        { status: 400 }
      );
    }
  }

  const client = await prisma.client.update({
    where: { id: params.id },
    data: { role, categoryId, discountPercent, currencyId, salesManagerId },
    include: { category: true, currency: true, salesManager: true },
  });

  return NextResponse.json({
    client: {
      id: client.id,
      name: client.name,
      email: client.email,
      role: client.role,
      city: client.city,
      hasLogin: !!client.passwordHash,
      categoryId: client.categoryId,
      categoryName: client.category?.name ?? null,
      discountPercent: client.discountPercent,
      currencyId: client.currencyId,
      currencyCode: client.currency?.code ?? null,
      salesManagerId: client.salesManagerId,
      salesManagerName: client.salesManager?.name ?? null,
    },
  });
}
