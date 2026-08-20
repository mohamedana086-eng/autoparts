import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-guard';
import { readSupplierInput } from '@/lib/admin-suppliers';
import {
  adminSupplierById, adminSuppliers, createSupplier, currencyOptions, supplierClash,
} from '@/lib/suppliers';

// GET /api/admin/suppliers — everyone we buy from, with how much each sources.
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const [suppliers, currencies] = await Promise.all([adminSuppliers(), currencyOptions()]);

  // The currencies are for the editor's select. Reference only on a supplier,
  // but it still has to be picked from the currencies that exist.
  return NextResponse.json({ suppliers, currencies });
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

  // Code and slug are both unique. Checked here so the admin gets told which
  // one clashed and who holds it, rather than a violation naming an index.
  const clash = await supplierClash(input.value.code, input.value.slug);
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

  const id = await createSupplier(input.value);

  return NextResponse.json({ supplier: await adminSupplierById(id) }, { status: 201 });
}
