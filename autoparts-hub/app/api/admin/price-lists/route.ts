import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-guard';
import { readListDetails, readPriceRows, type ConversionRate } from '@/lib/price-lists';
import { normalisePartNumber } from '@/lib/part-number';

/**
 * Purchase price lists. ADMIN only, deliberately — not `requireStaff`.
 *
 * These set what every part costs to buy, which is the number the whole markup
 * engine multiplies up. A salesperson seeing their own customers is one thing;
 * changing the cost basis of the catalogue is another.
 */

// GET /api/admin/price-lists — every list, newest first.
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const lists = await prisma.priceList.findMany({
    include: { _count: { select: { items: true } } },
    orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
  });

  return NextResponse.json({
    lists: lists.map((l) => ({
      id: l.id,
      name: l.name,
      description: l.description,
      active: l.active,
      sourceName: l.sourceName,
      itemCount: l._count.items,
      createdAt: l.createdAt.toISOString(),
      updatedAt: l.updatedAt.toISOString(),
    })),
  });
}

/**
 * POST /api/admin/price-lists — upload one.
 *
 * It arrives inactive whatever it says. Uploading and switching the catalogue
 * onto a new cost basis are two decisions, and running them together means a
 * mistyped column changes every price before anyone has looked at the result.
 * The response reports what matched and what did not; activating is a second,
 * deliberate request.
 */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const details = readListDetails(body);
  if (!details.ok) return NextResponse.json({ error: details.error }, { status: 400 });

  // Match on the normalised form, the way search and the bulk lookup do, so a
  // supplier's spacing does not decide whether their price lands.
  const [products, currencies] = await Promise.all([
    prisma.product.findMany({ select: { id: true, partNumber: true } }),
    prisma.currency.findMany({ select: { code: true, rate: true } }),
  ]);

  const productIdByPartNumber = new Map<string, string>();
  for (const p of products) productIdByPartNumber.set(normalisePartNumber(p.partNumber), p.id);

  const ratesByCode = new Map<string, ConversionRate>();
  for (const c of currencies) ratesByCode.set(c.code.toUpperCase(), { code: c.code, rate: c.rate });

  const parsed = readPriceRows(body.rows, productIdByPartNumber, ratesByCode);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const list = await prisma.$transaction(async (tx) => {
    const created = await tx.priceList.create({
      data: {
        name: details.value.name,
        description: details.value.description,
        sourceName: details.value.sourceName,
        active: false,
      },
    });

    await tx.priceListItem.createMany({
      data: parsed.value.rows.map((r) => ({
        priceListId: created.id,
        productId: r.productId,
        price: r.price,
        sourcePrice: r.sourcePrice,
        sourceCurrency: r.sourceCurrency,
      })),
    });

    return created;
  });

  return NextResponse.json(
    {
      list: {
        id: list.id,
        name: list.name,
        description: list.description,
        active: list.active,
        sourceName: list.sourceName,
        itemCount: parsed.value.rows.length,
        createdAt: list.createdAt.toISOString(),
        updatedAt: list.updatedAt.toISOString(),
      },
      accepted: parsed.value.rows.length,
      // Capped in the response only; every rejection is counted, and the first
      // few are named so the admin can see the shape of what went wrong
      // without the payload carrying a whole failed file back.
      rejectedCount: parsed.value.rejected.length,
      rejected: parsed.value.rejected.slice(0, 50),
    },
    { status: 201 }
  );
}
