import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-guard';
import { readCurrencyInput, serialiseCurrency } from '@/lib/admin-currencies';

// GET /api/admin/currencies — every currency, with how many accounts use it.
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const currencies = await prisma.currency.findMany({
    include: { _count: { select: { clients: true } } },
    // Base first, then alphabetical: the base is the one everything else is
    // measured against, so it belongs at the top rather than under E.
    orderBy: [{ isBase: 'desc' }, { code: 'asc' }],
  });

  return NextResponse.json({ currencies: currencies.map(serialiseCurrency) });
}

// POST /api/admin/currencies
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const input = readCurrencyInput(body);
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });

  const clash = await prisma.currency.findUnique({ where: { code: input.value.code } });
  if (clash) {
    return NextResponse.json(
      { error: `${input.value.code} is already on the list.` },
      { status: 409 }
    );
  }

  // Never created as base — see readCurrencyInput.
  const currency = await prisma.currency.create({ data: { ...input.value, isBase: false } });

  return NextResponse.json({ currency: serialiseCurrency({ ...currency }) }, { status: 201 });
}
