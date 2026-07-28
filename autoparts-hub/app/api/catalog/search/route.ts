import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  idsMatchingNormalisedPartNumber, loadPricingContext, normalisePartNumber, priceFor,
} from '@/lib/catalog';

type Sort = 'relevance' | 'price-asc' | 'price-desc' | 'delivery';
const SORTS: Sort[] = ['relevance', 'price-asc', 'price-desc', 'delivery'];

/** Why a row came back, so the UI can say so. */
type MatchedOn = 'part-number' | 'name' | 'manufacturer' | 'interchange' | 'description';

// GET /api/catalog/search?q=&system=&manufacturer=&sort=
// Prices come from the caller's own session tier — see loadPricingContext.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim() ?? '';
  const system = searchParams.get('system')?.trim() || undefined;
  const manufacturer = searchParams.get('manufacturer')?.trim() || undefined;

  const requestedSort = searchParams.get('sort') as Sort | null;
  const sort: Sort = requestedSort && SORTS.includes(requestedSort) ? requestedSort : 'relevance';

  // Separator-insensitive part numbers, and cross-references, both need a
  // scan, so resolve them to ids first and fold those into the main query.
  const normalisedIds = q ? await idsMatchingNormalisedPartNumber(q) : [];

  const [matches, systemRecord, ctx] = await Promise.all([
    prisma.product.findMany({
      where: {
        AND: [
          q
            ? {
                OR: [
                  { partNumber: { contains: q, mode: 'insensitive' } },
                  { name: { contains: q, mode: 'insensitive' } },
                  { description: { contains: q, mode: 'insensitive' } },
                  { manufacturer: { name: { contains: q, mode: 'insensitive' } } },
                  { interchanges: { some: { targetPartNo: { contains: q, mode: 'insensitive' } } } },
                  ...(normalisedIds.length ? [{ id: { in: normalisedIds } }] : []),
                ],
              }
            : {},
          system ? { vehicleSystem: { slug: system } } : {},
        ],
      },
      include: { manufacturer: true, vehicleSystem: true, interchanges: true },
      // Enough to return a whole system, or the unfiltered catalogue, without
      // silently cutting results off. Needs real paging well before this.
      take: 200,
    }),
    system ? prisma.vehicleSystem.findUnique({ where: { slug: system } }) : Promise.resolve(null),
    loadPricingContext(),
  ]);

  // Facets are counted before the brand filter is applied, so the list stays
  // usable for switching between brands rather than collapsing to the one
  // already chosen.
  const brandCounts = new Map<string, number>();
  for (const p of matches) {
    brandCounts.set(p.manufacturer.name, (brandCounts.get(p.manufacturer.name) ?? 0) + 1);
  }

  const needle = normalisePartNumber(q);
  const lower = q.toLowerCase();

  const scored = matches
    .filter((p) => !manufacturer || p.manufacturer.name.toLowerCase() === manufacturer.toLowerCase())
    .map((p) => {
      const normalisedPart = normalisePartNumber(p.partNumber);

      let rank = 6;
      let matchedOn: MatchedOn = 'description';
      let matchedVia: string | null = null;

      if (!q) {
        rank = 0;
      } else if (needle && normalisedPart === needle) {
        rank = 0;
        matchedOn = 'part-number';
      } else if (needle && normalisedPart.startsWith(needle)) {
        rank = 1;
        matchedOn = 'part-number';
      } else if (needle && normalisedPart.includes(needle)) {
        rank = 2;
        matchedOn = 'part-number';
      } else if (p.name.toLowerCase().includes(lower)) {
        rank = 3;
        matchedOn = 'name';
      } else if (p.manufacturer.name.toLowerCase().includes(lower)) {
        rank = 4;
        matchedOn = 'manufacturer';
      } else {
        const cross = p.interchanges.find(
          (i) =>
            i.targetPartNo.toLowerCase().includes(lower) ||
            (!!needle && normalisePartNumber(i.targetPartNo).includes(needle))
        );
        if (cross) {
          rank = 5;
          matchedOn = 'interchange';
          matchedVia = cross.targetPartNo;
        }
      }

      const pricing = priceFor(p, ctx);

      return {
        rank,
        product: {
          id: p.id,
          partNumber: p.partNumber,
          name: p.name,
          manufacturer: p.manufacturer.name,
          system: p.vehicleSystem.name,
          systemSlug: p.vehicleSystem.slug,
          stockDays: p.stockDays,
          price: pricing?.finalPrice ?? p.basePrice,
          appliedRule: pricing?.appliedRule ?? null,
          matchedOn,
          matchedVia,
        },
      };
    });

  scored.sort((a, b) => {
    switch (sort) {
      case 'price-asc':
        return a.product.price - b.product.price;
      case 'price-desc':
        return b.product.price - a.product.price;
      case 'delivery':
        return a.product.stockDays - b.product.stockDays || a.product.price - b.product.price;
      default:
        return a.rank - b.rank || a.product.name.localeCompare(b.product.name);
    }
  });

  return NextResponse.json({
    query: q,
    systemName: systemRecord?.name ?? null,
    manufacturer: manufacturer ?? null,
    sort,
    tierName: ctx.tierName,
    isLoggedIn: ctx.isLoggedIn,
    count: scored.length,
    facets: {
      manufacturers: [...brandCounts.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    },
    products: scored.map((s) => s.product),
  });
}
