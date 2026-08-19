import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-guard';
import { readStockRows, serialiseStockLevel } from '@/lib/admin-inventory';
import { adminProductById, knownWarehouseIds, replaceStock, stockFor } from '@/lib/admin-catalogue';

// GET /api/admin/products/<id>/stock — what every warehouse holds of this part.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const product = await adminProductById(params.id);
  if (!product) return NextResponse.json({ error: 'Product not found.' }, { status: 404 });

  const levels = await stockFor(params.id);
  return NextResponse.json({ levels: levels.map(serialiseStockLevel) });
}

/**
 * PUT /api/admin/products/<id>/stock — replaces this part's counts.
 *
 * The editor shows every warehouse at once, so the whole table is submitted
 * together: one request either takes all the counts or none of them, and a
 * part cannot be left half-recounted.
 *
 * A warehouse left out of the list is a warehouse that holds none — its row is
 * removed rather than kept at zero, so "not held here" and "counted, none
 * here" do not turn into two rows that read the same.
 */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const product = await adminProductById(params.id);
  if (!product) return NextResponse.json({ error: 'Product not found.' }, { status: 404 });

  const parsed = readStockRows(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const ids = parsed.value.map((row) => row.warehouseId);
  const known = await knownWarehouseIds(ids);
  if (known.length !== ids.length) {
    return NextResponse.json({ error: 'One of those warehouses no longer exists.' }, { status: 400 });
  }

  const levels = await replaceStock(params.id, parsed.value);
  return NextResponse.json({ levels: levels.map(serialiseStockLevel) });
}
