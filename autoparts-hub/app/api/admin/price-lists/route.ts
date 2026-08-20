import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-guard';
import { readListDetails, readPriceRows, type ConversionRate } from '@/lib/price-lists';
import { normalisePartNumber } from '@/lib/part-number';
import { adminPriceLists, createPriceList, priceListReferences } from '@/lib/pricing-admin';

/**
 * Purchase price lists. ADMIN only, deliberately — not `requireStaff`.
 *
 * These set what every part costs to buy, which is the number the whole markup
 * engine multiplies up. A salesperson seeing their own customers is one thing;
 * changing the cost basis of the catalogue is another.
 */

function serialise(l: Awaited<ReturnType<typeof adminPriceLists>>[number]) {
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

// GET /api/admin/price-lists — every list, newest first.
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const lists = await adminPriceLists();

  return NextResponse.json({ lists: lists.map(serialise) });
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
  const { products, currencies } = await priceListReferences();

  const productIdByPartNumber = new Map<string, string>();
  for (const p of products) productIdByPartNumber.set(normalisePartNumber(p.partNumber), p.id);

  const ratesByCode = new Map<string, ConversionRate>();
  for (const c of currencies) ratesByCode.set(c.code.toUpperCase(), { code: c.code, rate: c.rate });

  const parsed = readPriceRows(body.rows, productIdByPartNumber, ratesByCode);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const list = await createPriceList(details.value, parsed.value.rows);

  return NextResponse.json(
    {
      list: serialise(list),
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
