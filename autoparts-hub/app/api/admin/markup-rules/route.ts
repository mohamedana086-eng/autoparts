import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-guard';

const TYPES = ['PERCENT', 'AMOUNT', 'FIXED'];

function serialise(rule: {
  id: string; label: string; priority: number;
  clientCategoryId: string | null; supplierId: string | null;
  manufacturerName: string | null; vehicleSystemSlug: string | null;
  partNumberPrefix: string | null; purchasePriceFrom: number | null;
  purchasePriceTo: number | null; type: string; value: number; active: boolean;
  clientCategory?: { name: string } | null; supplier?: { name: string } | null;
}) {
  return {
    id: rule.id,
    label: rule.label,
    priority: rule.priority,
    clientCategoryId: rule.clientCategoryId,
    clientCategoryName: rule.clientCategory?.name ?? null,
    supplierId: rule.supplierId,
    supplierName: rule.supplier?.name ?? null,
    manufacturerName: rule.manufacturerName,
    vehicleSystemSlug: rule.vehicleSystemSlug,
    partNumberPrefix: rule.partNumberPrefix,
    purchasePriceFrom: rule.purchasePriceFrom,
    purchasePriceTo: rule.purchasePriceTo,
    type: rule.type,
    value: rule.value,
    active: rule.active,
  };
}

// GET /api/admin/markup-rules — rules plus everything the builder's selects need.
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const [rules, categories, suppliers, systems] = await Promise.all([
    prisma.markupRule.findMany({
      include: { clientCategory: true, supplier: true },
      orderBy: { priority: 'desc' },
    }),
    prisma.clientCategory.findMany({ orderBy: { markupPercent: 'asc' } }),
    prisma.supplier.findMany(),
    prisma.vehicleSystem.findMany({ orderBy: { order: 'asc' } }),
  ]);

  return NextResponse.json({
    rules: rules.map(serialise),
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
    suppliers: suppliers.map((s) => ({ id: s.id, name: s.name })),
    systems: systems.map((s) => ({ slug: s.slug, name: s.name })),
  });
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

  const rule = await prisma.markupRule.create({
    data: {
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
    },
    include: { clientCategory: true, supplier: true },
  });

  return NextResponse.json({ rule: serialise(rule) }, { status: 201 });
}
