import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-guard';
import { readCurrencyInput } from '@/lib/admin-currencies';
import { adminCurrencies, createCurrency, currencyById, currencyIdByCode } from '@/lib/pricing-admin';

// GET /api/admin/currencies — every currency, with how many accounts use it.
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  return NextResponse.json({ currencies: await adminCurrencies() });
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

  const clash = await currencyIdByCode(input.value.code);
  if (clash) {
    return NextResponse.json(
      { error: `${input.value.code} is already on the list.` },
      { status: 409 }
    );
  }

  const id = await createCurrency(input.value);

  return NextResponse.json({ currency: await currencyById(id) }, { status: 201 });
}
