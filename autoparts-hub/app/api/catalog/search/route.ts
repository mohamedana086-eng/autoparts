import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  idsByFuzzyMatch, idsMatchingNormalisedPartNumber, loadPricingContext, normalisePartNumber, priceFor,
} from '@/lib/catalog';

type Sort = 'relevance' | 'price-asc' | 'price-desc' | 'delivery';
const SORTS: Sort[] = ['relevance', 'price-asc', 'price-desc', 'delivery'];

/** Mirrors Supplier.reliability. Kept here rather than imported from
 *  lib/admin-suppliers, which is server-only for the admin routes. */
const RELIABILITIES = ['official', 'reliable', 'standard'];

/** Why a row came back, so the UI can explain non-obvious hits. */
type MatchedOn =
  | 'part-number'
  | 'name'
  | 'manufacturer'
  | 'interchange-oem'
  | 'interchange-aftermarket'
  | 'description';

/**
 * Which kind of number a result was found by. A customer holding a number
 * off a dealer invoice and one holding a competitor's catalogue are asking
 * different questions, and until now the answer to both was the same list.
 */
type MatchIn = 'part-number' | 'oem' | 'aftermarket';
const MATCH_INS: MatchIn[] = ['part-number', 'oem', 'aftermarket'];

const MAX_RESULTS = 200;

// GET /api/catalog/search?q=&system=&manufacturer=&sort=&limit=
// Prices come from the caller's own session tier — see loadPricingContext.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim() ?? '';
  const system = searchParams.get('system')?.trim() || undefined;
  const manufacturer = searchParams.get('manufacturer')?.trim() || undefined;
  const variant = searchParams.get('variant')?.trim() || undefined;
  const supplier = searchParams.get('supplier')?.trim() || undefined;

  // Minimum supplier rating, 1–5. A part whose supplier is unrated, or which
  // has no supplier at all, falls outside every minimum on purpose: "at least
  // four stars" is a claim about known performance, and theirs is not known.
  const requestedMinRating = Number(searchParams.get('minRating'));
  const minRating =
    Number.isInteger(requestedMinRating) && requestedMinRating >= 1 && requestedMinRating <= 5
      ? requestedMinRating
      : null;

  // Supplier classification. `reliability` is what the trading relationship
  // is; `returns` is whether they take stock back. Independent of each other
  // and of the rating, so all three compose.
  const requestedReliability = searchParams.get('reliability')?.trim() || undefined;
  const reliability =
    requestedReliability && RELIABILITIES.includes(requestedReliability)
      ? requestedReliability
      : undefined;

  // Only an explicit yes matches. A supplier whose return terms have not been
  // recorded is not evidence that they accept them.
  const returnsOnly = searchParams.get('returns') === 'true';

  /**
   * Which kinds of number to look in, as a comma-separated list — any one,
   * any two, or all three.
   *
   * Empty means look everywhere, including names and brands. Note that this
   * is not the same as selecting all three: all three still restricts results
   * to those reachable by *some* number, dropping the ones that only matched
   * on a name.
   *
   * Only meaningful alongside a query — with nothing typed, nothing was found
   * by a number, and the filter would empty the page for no stated reason.
   * Ordered by MATCH_INS rather than by however the caller listed them, so the
   * same selection always echoes back the same way.
   */
  const requestedMatchIn = (searchParams.get('matchIn') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const matchIn: MatchIn[] = q ? MATCH_INS.filter((kind) => requestedMatchIn.includes(kind)) : [];

  const requestedSort = searchParams.get('sort') as Sort | null;
  const sort: Sort = requestedSort && SORTS.includes(requestedSort) ? requestedSort : 'relevance';

  const requestedLimit = Number(searchParams.get('limit'));
  const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, MAX_RESULTS)
    : MAX_RESULTS;

  const priceBound = (key: string) => {
    const raw = searchParams.get(key);
    if (raw === null || raw === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const minPrice = priceBound('minPrice');
  const maxPrice = priceBound('maxPrice');

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
  const include = {
    manufacturer: true,
    vehicleSystem: true,
    interchanges: true,
    supplier: true,
  } as const;

  // A vehicle narrows the catalogue to what actually fits it, and composes
  // with everything else rather than replacing it.
  const fitsVehicle = variant ? { fitments: { some: { variantId: variant } } } : {};
  // Matched by slug so a supplier's page URL is the same value the filter uses.
  const fromSupplier = supplier ? { supplier: { slug: supplier } } : {};

  let [matches, systemRecord, variantRecord, supplierRecord, ctx] = await Promise.all([
    prisma.product.findMany({
      where: {
        AND: [
          q
            ? {
                OR: [
                  ...(normalisedIds.length ? [{ id: { in: normalisedIds } }] : []),
                  ...(tokenClauses.length ? [{ AND: tokenClauses }] : []),
                ],
              }
            : {},
          fitsVehicle,
          fromSupplier,
        ],
      },
      include,
      take: MAX_RESULTS,
    }),
    system ? prisma.vehicleSystem.findUnique({ where: { slug: system } }) : Promise.resolve(null),
    variant
      ? prisma.vehicleVariant.findUnique({
          where: { id: variant },
          include: { model: { include: { make: true } } },
        })
      : Promise.resolve(null),
    supplier ? prisma.supplier.findUnique({ where: { slug: supplier } }) : Promise.resolve(null),
    loadPricingContext(),
  ]);

  // Nothing matched as typed — try again allowing for a misspelling, and say
  // so in the response so the UI does not present guesses as exact hits.
  let fuzzy = false;
  if (q && matches.length === 0) {
    const closeIds = await idsByFuzzyMatch(q);
    if (closeIds.length) {
      const close = await prisma.product.findMany({
        where: { AND: [{ id: { in: closeIds } }, fitsVehicle, fromSupplier] },
        include,
      });
      // Keep the order the similarity scoring produced.
      const rank = new Map(closeIds.map((id, i) => [id, i]));
      close.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
      matches = close;
      fuzzy = true;
    }
  }

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

  // Counted per exact rating rather than per threshold, so the UI can build
  // whichever thresholds it wants to offer by summing downwards. Key 0 stands
  // for unrated — parts whose supplier has no rating, or which have no
  // supplier — kept visible so the gap is obvious rather than silently
  // dropped. Like the brand facet, this describes the current system and is
  // not narrowed by the rating filter itself.
  const ratingCounts = new Map<number, number>();
  for (const p of inSystem) {
    const key = p.supplier?.rating ?? 0;
    ratingCounts.set(key, (ratingCounts.get(key) ?? 0) + 1);
  }

  // Counted on the same set as the brand and rating facets, so each filter
  // describes what is in this system rather than what the other filters have
  // already removed.
  const reliabilityCounts = new Map<string, number>();
  let returnsCount = 0;
  for (const p of inSystem) {
    if (p.supplier) {
      reliabilityCounts.set(
        p.supplier.reliability,
        (reliabilityCounts.get(p.supplier.reliability) ?? 0) + 1
      );
      if (p.supplier.acceptsReturns === true) returnsCount++;
    }
  }

  const needle = normalisePartNumber(q);
  const lower = q.toLowerCase();
  const lowerTokens = tokens.map((t) => t.toLowerCase());
  const containsEvery = (haystack: string) => lowerTokens.every((t) => haystack.includes(t));

  /** Whether a number contains the query, ignoring separators either way. */
  const numberHit = (value: string) =>
    value.toLowerCase().includes(lower) || (!!needle && normalisePartNumber(value).includes(needle));

  /**
   * Which kinds of number this product could be found by.
   *
   * Independent of each other and of `matchedOn`: a part can be reachable by
   * its own number and by an OE reference at once, and both are true. This is
   * what the search options act on — the question is "where should the search
   * look", not "which single field won the ranking", and answering it with the
   * ranking is what made the options disappear on any query that landed on a
   * name instead of a number.
   */
  const hitsFor = (p: (typeof inSystem)[number]): Record<MatchIn, boolean> => ({
    'part-number': !!q && numberHit(p.partNumber),
    oem: !!q && p.interchanges.some((i) => i.isOEM && numberHit(i.targetPartNo)),
    aftermarket: !!q && p.interchanges.some((i) => !i.isOEM && numberHit(i.targetPartNo)),
  });

  const scored = inSystem
    .filter((p) => !manufacturer || p.manufacturer.name.toLowerCase() === manufacturer.toLowerCase())
    .filter((p) => minRating === null || (p.supplier?.rating ?? 0) >= minRating)
    .filter((p) => !reliability || p.supplier?.reliability === reliability)
    .filter((p) => !returnsOnly || p.supplier?.acceptsReturns === true)
    .map((p, index) => {
      const normalisedPart = normalisePartNumber(p.partNumber);
      const name = p.name.toLowerCase();
      const brand = p.manufacturer.name.toLowerCase();
      const description = (p.description ?? '').toLowerCase();

      let rank = 8;
      let matchedOn: MatchedOn = 'description';
      let matchedVia: string | null = null;
      let matchedViaManufacturer: string | null = null;

      if (fuzzy) {
        // Nothing matched literally, so the only meaningful order is how
        // close the database scored each row. Keep it.
        rank = index;
        matchedOn = 'name';
      } else if (!q) {
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
        const crosses = p.interchanges.filter(
          (i) =>
            i.targetPartNo.toLowerCase().includes(lower) ||
            (!!needle && normalisePartNumber(i.targetPartNo).includes(needle))
        );
        // The maker's own number wins when both kinds match. Someone typing a
        // number that is both an OE reference and a competitor's is holding a
        // dealer invoice far more often than a rival catalogue.
        const cross = crosses.find((i) => i.isOEM) ?? crosses[0];
        if (cross) {
          rank = cross.isOEM ? 6 : 7;
          matchedOn = cross.isOEM ? 'interchange-oem' : 'interchange-aftermarket';
          matchedVia = cross.targetPartNo;
          matchedViaManufacturer = cross.targetManufacturer;
        }
      }

      const pricing = priceFor(p, ctx);

      return {
        rank,
        hits: hitsFor(p),
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
          // Carried on the row so a result can show who it comes from and how
          // they rate, which is what makes the rating filter legible.
          supplier: p.supplier
            ? {
                slug: p.supplier.slug,
                name: p.supplier.name,
                rating: p.supplier.rating,
                reliability: p.supplier.reliability,
                acceptsReturns: p.supplier.acceptsReturns,
              }
            : null,
          matchedOn,
          matchedVia,
          matchedViaManufacturer,
        },
      };
    });

  // Counted before the option narrows anything, so each one shows what it
  // would leave. A result counts under every kind that can reach it, not just
  // one: a part found by its own number that also carries a matching OE
  // reference is genuinely findable both ways, and reporting it under only the
  // higher-ranked one understates the other.
  const matchCounts: Record<MatchIn, number> = { 'part-number': 0, oem: 0, aftermarket: 0 };
  for (const s of scored) {
    for (const kind of MATCH_INS) if (s.hits[kind]) matchCounts[kind]++;
  }

  // Any of the selected kinds is enough — the options are alternatives a
  // customer is willing to accept, not conditions a part has to satisfy all
  // of at once.
  const byMatch = matchIn.length
    ? scored.filter((s) => matchIn.some((kind) => s.hits[kind]))
    : scored;

  // Bounds describe what is available before the price filter narrows it, so
  // the UI can show the range the slider or inputs sit in.
  const prices = byMatch.map((s) => s.product.price);
  const priceRange = prices.length
    ? { min: Math.floor(Math.min(...prices)), max: Math.ceil(Math.max(...prices)) }
    : null;

  const withinPrice = byMatch.filter(
    (s) =>
      (minPrice === null || s.product.price >= minPrice) &&
      (maxPrice === null || s.product.price <= maxPrice)
  );

  withinPrice.sort((a, b) => {
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
    variant: variant ?? null,
    variantLabel: variantRecord
      ? `${variantRecord.model.make.name} ${variantRecord.model.name} ${variantRecord.name}`
      : null,
    supplier: supplier ?? null,
    supplierName: supplierRecord?.name ?? null,
    minRating,
    reliability: reliability ?? null,
    returns: returnsOnly,
    matchIn,
    minPrice,
    maxPrice,
    sort,
    /** True when nothing matched as typed and these are close matches. */
    fuzzy,
    tierName: ctx.tierName,
    isLoggedIn: ctx.isLoggedIn,
    count: withinPrice.length,
    priceRange,
    facets: {
      systems: [...systemCounts.values()].sort(
        (a, b) => b.count - a.count || a.name.localeCompare(b.name)
      ),
      manufacturers: [...brandCounts.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
      /** Per exact supplier rating, best first; `rating: null` is unrated. */
      supplierRatings: [...ratingCounts.entries()]
        .map(([rating, count]) => ({ rating: rating === 0 ? null : rating, count }))
        .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)),
      /** Ordered official → reliable → standard, not by count: it is a
       *  ranking, and shuffling it by popularity would read as noise. */
      reliabilities: RELIABILITIES.map((name) => ({
        name,
        count: reliabilityCounts.get(name) ?? 0,
      })).filter((r) => r.count > 0),
      /** How many results come from a supplier known to take stock back. */
      returns: returnsCount,
      /**
       * Where a search can look, and how many results each place holds.
       *
       * All three are always listed alongside a query, zeros included: they
       * are options a customer picks, not facets that appear when convenient,
       * and "OEM number 0" is the answer to "is this an OE number?" rather
       * than an empty space. Absent without a query, since there is nothing
       * to look for.
       */
      matchIn: q ? MATCH_INS.map((name) => ({ name, count: matchCounts[name] })) : [],
    },
    products: withinPrice.slice(0, limit).map((s) => s.product),
  });
}
