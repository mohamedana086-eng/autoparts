import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-guard';
import { adminCategories, createCategory } from '@/lib/pricing-admin';

// GET /api/admin/client-categories
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  return NextResponse.json({ categories: await adminCategories() });
}

// POST /api/admin/client-categories { name, markupPercent, minOrderAmount, shelfLifeDays }
export async function POST(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const name = String(body.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'Name is required.' }, { status: 400 });

  const markupPercent = Number(body.markupPercent ?? 0);
  const minOrderAmount = Number(body.minOrderAmount ?? 0);
  const shelfLifeDays = Number(body.shelfLifeDays ?? 1);

  if (![markupPercent, minOrderAmount, shelfLifeDays].every(Number.isFinite)) {
    return NextResponse.json({ error: 'Markup, minimum order and shelf life must be numbers.' }, { status: 400 });
  }

  const category = await createCategory({ name, markupPercent, minOrderAmount, shelfLifeDays });

  return NextResponse.json({ category }, { status: 201 });
}
