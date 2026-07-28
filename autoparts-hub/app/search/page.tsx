import Link from 'next/link';
import { prisma } from '@/lib/db';
import { resolvePrice, MarkupRule } from '@/lib/pricing';
import { getSession } from '@/lib/auth';
import { Clock, PackageCheck } from 'lucide-react';

async function getResults(q: string, system?: string) {
  const products = await prisma.product.findMany({
    where: {
      AND: [
        // `mode: 'insensitive'` matters on Postgres, where `contains` is a
        // case-sensitive LIKE — without it, searching "thermostat" misses
        // the part actually named "Thermostat".
        q
          ? {
              OR: [
                { partNumber: { contains: q, mode: 'insensitive' } },
                { name: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {},
        system ? { vehicleSystem: { slug: system } } : {},
      ],
    },
    include: { manufacturer: true, vehicleSystem: true },
  });

  const systemRecord = system
    ? await prisma.vehicleSystem.findUnique({ where: { slug: system } })
    : null;

  const session = await getSession();
  const category = session?.categoryId
    ? await prisma.clientCategory.findUnique({ where: { id: session.categoryId } })
    : await prisma.clientCategory.findFirst({ where: { name: 'Retail' } });
  const rules = (await prisma.markupRule.findMany({ where: { active: true } })) as unknown as MarkupRule[];
  const defaultSupplierId = (await prisma.supplier.findFirst())?.id ?? '';

  return {
    tierName: category?.name ?? 'Retail',
    isLoggedIn: !!session,
    systemName: systemRecord?.name ?? null,
    products: products.map((p) => ({
      ...p,
      pricing: category
        ? resolvePrice(
            {
              basePrice: p.basePrice,
              supplierId: defaultSupplierId,
              manufacturerName: p.manufacturer.name,
              vehicleSystemSlug: p.vehicleSystem.slug,
              partNumber: p.partNumber,
              clientCategoryId: category.id,
              clientCategoryMarkupPercent: category.markupPercent,
            },
            rules
          )
        : null,
    })),
  };
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string; system?: string };
}) {
  const q = searchParams.q ?? '';
  const system = searchParams.system;
  const { tierName, isLoggedIn, systemName, products: results } = await getResults(q, system);

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <div className="flex items-baseline justify-between mb-1">
        <h1 className="font-display text-2xl font-bold">
          {q
            ? <>Results for <span className="font-mono text-signal">{q}</span></>
            : systemName ?? 'All parts'}
        </h1>
        <span className="text-xs text-mute font-mono">{results.length} found</span>
      </div>
      <p className="text-xs text-mute mb-8">
        {isLoggedIn
          ? <>Prices shown at your <span className="text-paper">{tierName}</span> tier.</>
          : <>Prices shown at Retail tier · <Link href="/login" className="text-signal hover:underline">sign in</Link> to see your account&apos;s price.</>}
      </p>

      <div className="grid gap-3">
        {results.map((p) => (
          <Link
            href={`/product/${p.id}`}
            key={p.id}
            className="border border-ink-line rounded-plate bg-ink-panel hover:border-signal/50 transition-colors p-4 grid grid-cols-1 md:grid-cols-[auto_1fr_auto] gap-4 items-center"
          >
            <div className="plate relative rounded-plate px-4 py-2 w-fit">
              <p className="text-[9px] text-mute uppercase tracking-wider">{p.manufacturer.name}</p>
              <p className="font-mono font-semibold text-sm">{p.partNumber}</p>
            </div>

            <div>
              <p className="font-medium">{p.name}</p>
              <p className="text-xs text-mute mt-1">{p.vehicleSystem.name}</p>
              <div className="flex items-center gap-3 mt-2 text-xs text-mute">
                <span className="flex items-center gap-1">
                  <Clock size={12} /> {p.stockDays} day{p.stockDays === 1 ? '' : 's'} delivery
                </span>
                <span className="flex items-center gap-1 text-stock"><PackageCheck size={12} /> In stock</span>
              </div>
            </div>

            <div className="text-right">
              <p className="font-mono text-lg font-bold text-signal">
                €{p.pricing?.finalPrice.toFixed(2) ?? p.basePrice.toFixed(2)}
              </p>
              {p.pricing && (
                <p className="text-[10px] text-mute mt-0.5">{p.pricing.appliedRule}</p>
              )}
            </div>
          </Link>
        ))}

        {results.length === 0 && (
          <div className="border border-dashed border-ink-line rounded-plate p-10 text-center text-mute text-sm">
            {q ? (
              <>No parts match &quot;{q}&quot;. Try a different part number or browse by system.</>
            ) : systemName ? (
              <>Nothing in {systemName} yet. <Link href="/" className="text-signal hover:underline">Browse another system</Link> or search by part number.</>
            ) : (
              <>The catalog is empty.</>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
