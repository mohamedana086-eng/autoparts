import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-guard';

// GET /api/admin/client-categories
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const categories = await prisma.clientCategory.findMany({
    include: { _count: { select: { clients: true } } },
    orderBy: { markupPercent: 'asc' },
  });

  return NextResponse.json({
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      markupPercent: c.markupPercent,
      minOrderAmount: c.minOrderAmount,
      shelfLifeDays: c.shelfLifeDays,
      clientCount: c._count.clients,
    })),
  });
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

  const category = await prisma.clientCategory.create({
    data: { name, markupPercent, minOrderAmount, shelfLifeDays },
  });

  return NextResponse.json({ category: { ...category, clientCount: 0 } }, { status: 201 });
}
