import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-guard';
import { adminMarkupRules, createMarkupRule, markupRuleOptions } from '@/lib/pricing-admin';

const TYPES = ['PERCENT', 'AMOUNT', 'FIXED'];

// GET /api/admin/markup-rules — rules plus everything the builder's selects need.
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const [rules, options] = await Promise.all([adminMarkupRules(), markupRuleOptions()]);

  return NextResponse.json({ rules, ...options });
}

// POST /api/admin/markup-rules
export async function POST(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const label = String(body.label ?? '').trim();
  if (!label) return NextResponse.json({ error: 'Label is required.' }, { status: 400 });

  const type = String(body.type ?? 'PERCENT');
  if (!TYPES.includes(type)) {
    return NextResponse.json({ error: 'Adjustment type must be PERCENT, AMOUNT or FIXED.' }, { status: 400 });
  }

  const value = Number(body.value ?? 0);
  if (!Number.isFinite(value)) {
    return NextResponse.json({ error: 'Value must be a number.' }, { status: 400 });
  }

  const optText = (v: unknown) => {
    const s = String(v ?? '').trim();
    return s.length > 0 ? s : null;
  };
  const optNum = (v: unknown) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const from = optNum(body.purchasePriceFrom);
  const to = optNum(body.purchasePriceTo);
  if (from !== null && to !== null && from > to) {
    return NextResponse.json({ error: 'Price band starts above where it ends.' }, { status: 400 });
  }

  const rule = await createMarkupRule({
    label,
    priority: optNum(body.priority) ?? 0,
    clientCategoryId: optText(body.clientCategoryId),
    supplierId: optText(body.supplierId),
    manufacturerName: optText(body.manufacturerName),
    vehicleSystemSlug: optText(body.vehicleSystemSlug),
    partNumberPrefix: optText(body.partNumberPrefix),
    purchasePriceFrom: from,
    purchasePriceTo: to,
    type,
    value,
  });

  return NextResponse.json({ rule }, { status: 201 });
}
