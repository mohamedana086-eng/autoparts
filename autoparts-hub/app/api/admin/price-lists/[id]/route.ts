import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-guard';
import {
  deletePriceList, priceListById, priceListItems, updatePriceList, type PriceListRow,
} from '@/lib/pricing-admin';

/** How many lines to send back with one list. Enough to check a file landed
 *  the way it was meant to; not the whole thing, which can be tens of
 *  thousands of rows. */
const ITEM_PAGE = 200;

function serialise(l: PriceListRow) {
  return {
    id: l.id,
    name: l.name,
    description: l.description,
    active: l.active,
    sourceName: l.sourceName,
    itemCount: l.itemCount,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  };
}

// GET /api/admin/price-lists/<id> — the list, with a sample of what is in it.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const list = await priceListById(params.id);
  if (!list) return NextResponse.json({ error: 'Price list not found.' }, { status: 404 });

  const items = await priceListItems(params.id, ITEM_PAGE);

  return NextResponse.json({ list: serialise(list), shown: items.length, items });
}

/**
 * PATCH /api/admin/price-lists/<id> — rename it, or switch it on and off.
 *
 * Activating is the interesting half. At most one list may be active and the
 * database enforces that with a partial unique index, so the previous one has
 * to be stood down in the same transaction — otherwise the write fails, which
 * is the constraint doing its job but not an error anyone should have to see.
 * Switching a list on therefore switches the other off, which is exactly what
 * "activate this one instead" means.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const existing = await priceListById(params.id);
  if (!existing) return NextResponse.json({ error: 'Price list not found.' }, { status: 404 });

  const fields: { name?: string; description?: string | null; active?: boolean } = {};

  if (body.name !== undefined) {
    const name = String(body.name ?? '').trim();
    if (!name) return NextResponse.json({ error: 'Give the list a name.' }, { status: 400 });
    if (name.length > 120) {
      return NextResponse.json({ error: 'Keep the name under 120 characters.' }, { status: 400 });
    }
    fields.name = name;
  }

  if (body.description !== undefined) {
    const description = String(body.description ?? '').trim();
    fields.description = description || null;
  }

  if (body.active !== undefined) fields.active = body.active === true;

  await updatePriceList(params.id, fields);

  return NextResponse.json({ list: serialise((await priceListById(params.id))!) });
}

/**
 * DELETE /api/admin/price-lists/<id>
 *
 * The active list cannot be deleted while it is active. Deleting it would
 * reprice the whole catalogue back to `basePrice` as a side effect of what
 * reads like housekeeping — so standing it down has to be its own deliberate
 * act first, and then the consequence is already on screen.
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const existing = await priceListById(params.id);
  if (!existing) return NextResponse.json({ error: 'Price list not found.' }, { status: 404 });

  if (existing.active) {
    return NextResponse.json(
      {
        error:
          'That list is the one setting prices right now. Switch it off first — every part it covers goes back to its own price.',
      },
      { status: 409 }
    );
  }

  await deletePriceList(params.id);

  return NextResponse.json({ ok: true });
}
