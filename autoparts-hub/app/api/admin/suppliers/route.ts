import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-guard';
import { readSupplierInput, serialiseSupplier } from '@/lib/admin-suppliers';

// GET /api/admin/suppliers — everyone we buy from, with how much each sources.
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const suppliers = await prisma.supplier.findMany({
    include: { _count: { select: { products: true } } },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json({ suppliers: suppliers.map(serialiseSupplier) });
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

  const supplier = await prisma.supplier.create({ data: input.value });

  return NextResponse.json({ supplier: serialiseSupplier({ ...supplier }) }, { status: 201 });
}
