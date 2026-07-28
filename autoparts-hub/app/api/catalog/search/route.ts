import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  idsMatchingNormalisedPartNumber, loadPricingContext, normalisePartNumber, priceFor,
} from '@/lib/catalog';

type Sort = 'relevance' | 'price-asc' | 'price-desc' | 'delivery';
const SORTS: Sort[] = ['relevance', 'price-asc', 'price-desc', 'delivery'];

/** Why a row came back, so the UI can explain non-obvious hits. */
type MatchedOn = 'part-number' | 'name' | 'manufacturer' | 'interchange' | 'description';

const MAX_RESULTS = 200;

// GET /api/catalog/search?q=&system=&manufacturer=&sort=&limit=
// Prices come from the caller's own session tier — see loadPricingContext.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim() ?? '';
  const system = searchParams.get('system')?.trim() || undefined;
  const manufacturer = searchParams.get('manufacturer')?.trim() || undefined;

  const requestedSort = searchParams.get('sort') as Sort | null;
  const sort: Sort = requestedSort && SORTS.includes(requestedSort) ? requestedSort : 'relevance';

  const requestedLimit = Number(searchParams.get('limit'));
  const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, MAX_RESULTS)
    : MAX_RESULTS;

  // Every word has to land somewhere, but not all in the same field — that is
  // what lets "bosch brake pad" work, where the brand is on one column and the
  // rest of the words are on another.
  const tokens = q.split(/\s+/).filter(Boolean);
  const tokenClauses = tokens.map((t) => ({
    OR: [
      { partNumber: { contains: t, mode: 'insensitive' as const } },
      { name: { contains: t, mode: 'insensitive' as const } },
      { description: { contains: t, mode: 'insensitive' as const } },
      { manufacturer: { name: { contains: t, mode: 'insensitive' as const } } },
      { interchanges: { some: { targetPartNo: { contains: t, mode: 'insensitive' as const } } } },
    ],
  }));

  // Separated part numbers and cross-references need a scan, so resolve them
  // to ids first. Kept as its own branch so `0 986 424 815` still lands on the
  // part directly rather than depending on each fragment matching.
  const normalisedIds = q ? await idsMatchingNormalisedPartNumber(q) : [];

  // Filtered by the query only. System and brand are applied below so their
  // facet counts can be taken before each one narrows the list.
  const [matches, systemRecord, ctx] = await Promise.all([
    prisma.product.findMany({
      where: q
        ? {
            OR: [
              ...(normalisedIds.length ? [{ id: { in: normalisedIds } }] : []),
              ...(tokenClauses.length ? [{ AND: tokenClauses }] : []),
            ],
          }
        : {},
      include: { manufacturer: true, vehicleSystem: true, interchanges: true },
      take: MAX_RESULTS,
    }),
    system ? prisma.vehicleSystem.findUnique({ where: { slug: system } }) : Promise.resolve(null),
    loadPricingContext(),
  ]);

  const systemCounts = new Map<string, { slug: string; name: string; count: number }>();
  for (const p of matches) {
    const entry = systemCounts.get(p.vehicleSystem.slug);
    if (entry) entry.count++;
    else systemCounts.set(p.vehicleSystem.slug, {
      slug: p.vehicleSystem.slug,
      name: p.vehicleSystem.name,
      count: 1,
    });
  }

  const inSystem = system ? matches.filter((p) => p.vehicleSystem.slug === system) : matches;

  const brandCounts = new Map<string, number>();
  for (const p of inSystem) {
    brandCounts.set(p.manufacturer.name, (brandCounts.get(p.manufacturer.name) ?? 0) + 1);
  }

  const needle = normalisePartNumber(q);
  const lower = q.toLowerCase();
  const lowerTokens = tokens.map((t) => t.toLowerCase());
  const containsEvery = (haystack: string) => lowerTokens.every((t) => haystack.includes(t));

  const scored = inSystem
    .filter((p) => !manufacturer || p.manufacturer.name.toLowerCase() === manufacturer.toLowerCase())
    .map((p) => {
      const normalisedPart = normalisePartNumber(p.partNumber);
      const name = p.name.toLowerCase();
      const brand = p.manufacturer.name.toLowerCase();
      const description = (p.description ?? '').toLowerCase();

      let rank = 7;
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
      } else if (containsEvery(name)) {
        rank = 3;
        matchedOn = 'name';
      } else if (containsEvery(`${brand} ${name}`)) {
        rank = 4;
        matchedOn = name.includes(lower) ? 'name' : 'manufacturer';
      } else if (containsEvery(`${brand} ${name} ${description}`)) {
        rank = 5;
        matchedOn = 'description';
      } else {
        const cross = p.interchanges.find(
          (i) =>
            i.targetPartNo.toLowerCase().includes(lower) ||
            (!!needle && normalisePartNumber(i.targetPartNo).includes(needle))
        );
        if (cross) {
          rank = 6;
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
    system: system ?? null,
    manufacturer: manufacturer ?? null,
    sort,
    tierName: ctx.tierName,
    isLoggedIn: ctx.isLoggedIn,
    count: scored.length,
    facets: {
      systems: [...systemCounts.values()].sort(
        (a, b) => b.count - a.count || a.name.localeCompare(b.name)
      ),
      manufacturers: [...brandCounts.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    },
    products: scored.slice(0, limit).map((s) => s.product),
  });
}
