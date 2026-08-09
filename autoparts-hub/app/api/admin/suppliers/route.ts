import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-guard';
import { readSupplierInput, serialiseSupplier } from '@/lib/admin-suppliers';

// GET /api/admin/suppliers — everyone we buy from, with how much each sources.
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const [suppliers, currencies] = await Promise.all([
    prisma.supplier.findMany({
      include: { _count: { select: { products: true } }, purchaseCurrency: true },
      orderBy: { name: 'asc' },
    }),
    prisma.currency.findMany({
      where: { active: true },
      orderBy: [{ isBase: 'desc' }, { code: 'asc' }],
    }),
  ]);

  return NextResponse.json({
    suppliers: suppliers.map(serialiseSupplier),
    // For the editor's currency select. Reference only on a supplier, but it
    // still has to be picked from the currencies that exist.
    currencies: currencies.map((c) => ({ id: c.id, name: `${c.code} — ${c.name}` })),
  });
}

// POST /api/admin/suppliers
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const input = readSupplierInput(body);
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });

  // Both are unique. Checked here so the admin gets told which one clashed,
  // rather than a P2002 naming a constraint.
  const clash = await prisma.supplier.findFirst({
    where: { OR: [{ code: input.value.code }, { slug: input.value.slug }] },
  });
  if (clash) {
    return NextResponse.json(
      {
        error:
          clash.code === input.value.code
            ? `Code ${input.value.code} is already used by ${clash.name}.`
            : `The url /supplier/${input.value.slug} is already used by ${clash.name}.`,
      },
      { status: 409 }
    );
  }

  // The relation has to be loaded, or the response names no currency and the
  // editor shows the field blank on a supplier that in fact has one.
  const supplier = await prisma.supplier.create({
    data: input.value,
    include: { purchaseCurrency: true },
  });

  return NextResponse.json({ supplier: serialiseSupplier(supplier) }, { status: 201 });
}
