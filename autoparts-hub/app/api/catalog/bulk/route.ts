import { NextRequest, NextResponse } from 'next/server';
import {
  loadPricingContext, normalisePartNumber, priceForRow, rowPurchasePrice, roundMoney, sellableQuantity,
} from '@/lib/catalog';
import { matchByInterchange, matchByNormalisedPartNumber, productsForBulk } from '@/lib/products';

/** Guards the request against someone pasting a whole catalogue in. */
const MAX_ROWS = 1000;

type Matched = 'part-number' | 'interchange';

// POST /api/catalog/bulk { partNumbers: string[] }
//
// Takes a list of numbers off a customer's spreadsheet and answers, in the
// same order, which ones we carry and at the caller's tier price. Comparison
// ignores separators, and a number we do not stock still resolves if one of
// our parts lists it as a replacement.
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  if (!Array.isArray(body.partNumbers)) {
    return NextResponse.json({ error: 'partNumbers must be an array.' }, { status: 400 });
  }

  const inputs = body.partNumbers
    .map((v) => String(v ?? '').trim())
    .filter((v) => v.length > 0)
    .slice(0, MAX_ROWS);

  if (inputs.length === 0) {
    return NextResponse.json({ error: 'No part numbers found in that file.' }, { status: 400 });
  }

  // De-duplicate the lookup while keeping every input row in the answer, so a
  // sheet that lists the same number twice still lines up row for row.
  const needles = [...new Set(inputs.map(normalisePartNumber).filter((n) => n.length > 0))];
  if (needles.length === 0) {
    return NextResponse.json({ error: 'No usable part numbers in that file.' }, { status: 400 });
  }

  const [direct, viaInterchange, ctx] = await Promise.all([
    matchByNormalisedPartNumber(needles),
    matchByInterchange(needles),
    loadPricingContext(),
  ]);

  const ids = [...new Set([...direct.map((r) => r.id), ...viaInterchange.map((r) => r.id)])];
  const products = await productsForBulk(ids);
  const byId = new Map(products.map((p) => [p.id, p]));

  // A direct hit beats a cross-reference for the same input.
  const resolved = new Map<string, { id: string; matchedOn: Matched; matchedVia: string | null }>();
  for (const row of viaInterchange) {
    if (!resolved.has(row.norm)) {
      resolved.set(row.norm, { id: row.id, matchedOn: 'interchange', matchedVia: row.target });
    }
  }
  for (const row of direct) {
    resolved.set(row.norm, { id: row.id, matchedOn: 'part-number', matchedVia: null });
  }

  const rows = inputs.map((input) => {
    const hit = resolved.get(normalisePartNumber(input));
    const product = hit ? byId.get(hit.id) : undefined;

    if (!hit || !product) {
      return { input, found: false as const, product: null };
    }

    const pricing = priceForRow(product, ctx);

    return {
      input,
      found: true as const,
      matchedOn: hit.matchedOn,
      matchedVia: hit.matchedVia,
      product: {
        id: product.id,
        partNumber: product.partNumber,
        name: product.name,
        manufacturer: product.manufacturerName,
        system: product.systemName,
        stockDays: product.stockDays,
        price: pricing?.finalPrice ?? rowPurchasePrice(product),
        appliedRule: pricing?.appliedRule ?? null,
        // A spreadsheet of fifty numbers is exactly where adding more than
        // exists would go unnoticed, so the figure travels with the row.
        // Null means nobody counted the part, which sells nothing.
        available: sellableQuantity(product.available),
      },
    };
  });

  const found = rows.filter((r) => r.found);

  return NextResponse.json({
    tierName: ctx.tierName,
    isLoggedIn: ctx.isLoggedIn,
    submitted: inputs.length,
    truncated: body.partNumbers.length > MAX_ROWS,
    maxRows: MAX_ROWS,
    foundCount: found.length,
    missingCount: rows.length - found.length,
    total: roundMoney(found.reduce((sum, r) => sum + (r.product?.price ?? 0), 0)),
    rows,
  });
}
