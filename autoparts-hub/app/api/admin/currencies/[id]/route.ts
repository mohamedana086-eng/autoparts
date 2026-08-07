import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-guard';
import { readCurrencyInput, serialiseCurrency } from '@/lib/admin-currencies';

// PATCH /api/admin/currencies/<id>
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const existing = await prisma.currency.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: 'Currency not found.' }, { status: 404 });

  const input = readCurrencyInput(body);
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });

  // The base is the unit everything else is quoted against, so its rate is 1
  // by definition. Editing it would rescale the entire catalogue without
  // changing a single stored price.
  if (existing.isBase && input.value.rate !== 1) {
    return NextResponse.json(
      { error: `${existing.code} is the base currency. Its rate is always 1.` },
      { status: 409 }
    );
  }

  if (existing.isBase && !input.value.active) {
    return NextResponse.json(
      { error: `${existing.code} is the base currency and cannot be deactivated.` },
      { status: 409 }
    );
  }

  const clash = await prisma.currency.findFirst({
    where: { id: { not: params.id }, code: input.value.code },
  });
  if (clash) {
    return NextResponse.json({ error: `${input.value.code} is already on the list.` }, { status: 409 });
  }

  const currency = await prisma.currency.update({
    where: { id: params.id },
    data: input.value,
    include: { _count: { select: { clients: true } } },
  });

  return NextResponse.json({ currency: serialiseCurrency(currency) });
}

// DELETE /api/admin/currencies/<id>
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const currency = await prisma.currency.findUnique({
    where: { id: params.id },
    include: { _count: { select: { clients: true } } },
  });

  if (!currency) return NextResponse.json({ error: 'Currency not found.' }, { status: 404 });

  if (currency.isBase) {
    return NextResponse.json(
      { error: `${currency.code} is the base currency — every price is denominated in it.` },
      { status: 409 }
    );
  }

  // Accounts referencing it would silently fall back to the base and be
  // quoted different numbers than yesterday. Say so instead.
  if (currency._count.clients > 0) {
    return NextResponse.json(
      {
        error: `${currency.code} is used by ${currency._count.clients} account${
          currency._count.clients === 1 ? '' : 's'
        }. Move them to another currency first.`,
      },
      { status: 409 }
    );
  }

  // Past orders keep their own copy of the code and rate, so deleting a
  // currency no account uses cannot disturb order history.
  await prisma.currency.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
