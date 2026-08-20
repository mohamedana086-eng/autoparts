import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-guard';
import { readCurrencyInput } from '@/lib/admin-currencies';
import {
  currencyById, currencyIdByCode, deleteCurrency, updateCurrency,
} from '@/lib/pricing-admin';

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

  const existing = await currencyById(params.id);
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

  const clash = await currencyIdByCode(input.value.code);
  if (clash && clash !== params.id) {
    return NextResponse.json({ error: `${input.value.code} is already on the list.` }, { status: 409 });
  }

  await updateCurrency(params.id, input.value);

  return NextResponse.json({ currency: await currencyById(params.id) });
}

// DELETE /api/admin/currencies/<id>
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const currency = await currencyById(params.id);
  if (!currency) return NextResponse.json({ error: 'Currency not found.' }, { status: 404 });

  if (currency.isBase) {
    return NextResponse.json(
      { error: `${currency.code} is the base currency — every price is denominated in it.` },
      { status: 409 }
    );
  }

  // Accounts referencing it would silently fall back to the base and be
  // quoted different numbers than yesterday. Say so instead.
  if (currency.clientCount > 0) {
    return NextResponse.json(
      {
        error: `${currency.code} is used by ${currency.clientCount} account${
          currency.clientCount === 1 ? '' : 's'
        }. Move them to another currency first.`,
      },
      { status: 409 }
    );
  }

  // Past orders keep their own copy of the code and rate, so deleting a
  // currency no account uses cannot disturb order history.
  await deleteCurrency(params.id);
  return NextResponse.json({ ok: true });
}
