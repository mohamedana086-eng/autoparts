import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { resolvePrice, MarkupRule } from '@/lib/pricing';
import { getSession } from '@/lib/auth';
import { Clock, PackageCheck, ShieldCheck, ArrowLeftRight } from 'lucide-react';

async function getProduct(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: { manufacturer: true, vehicleSystem: true, interchanges: true },
  });
  if (!product) return null;

  const session = await getSession();
  const category = session?.categoryId
    ? await prisma.clientCategory.findUnique({ where: { id: session.categoryId } })
    : await prisma.clientCategory.findFirst({ where: { name: 'Retail' } });
  const rules = (await prisma.markupRule.findMany({ where: { active: true } })) as unknown as MarkupRule[];
  const defaultSupplierId = (await prisma.supplier.findFirst())?.id ?? '';

  const pricing = category
    ? resolvePrice(
        {
          basePrice: product.basePrice,
          supplierId: defaultSupplierId,
          manufacturerName: product.manufacturer.name,
          vehicleSystemSlug: product.vehicleSystem.slug,
          partNumber: product.partNumber,
          clientCategoryId: category.id,
          clientCategoryMarkupPercent: category.markupPercent,
        },
        rules
      )
    : null;

  return { product, pricing, tierName: category?.name ?? 'Retail', isLoggedIn: !!session };
}

export default async function ProductPage({ params }: { params: { id: string } }) {
  const data = await getProduct(params.id);
  if (!data) notFound();
  const { product, pricing, tierName, isLoggedIn } = data;

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 grid md:grid-cols-[1.3fr_1fr] gap-10">
      <div>
        <div className="plate relative rounded-plate px-5 py-4 w-fit mb-6">
          <p className="text-[10px] text-mute uppercase tracking-wider">{product.manufacturer.name}</p>
          <p className="font-mono text-2xl font-bold">{product.partNumber}</p>
        </div>

        <h1 className="font-display text-2xl font-bold">{product.name}</h1>
        <p className="text-mute text-sm mt-1">{product.vehicleSystem.name}</p>
        {product.description && <p className="mt-4 text-sm text-paper/90">{product.description}</p>}

        <div className="mt-8">
          <h2 className="font-display font-semibold text-sm mb-3 flex items-center gap-2">
            <ArrowLeftRight size={16} className="text-signal" /> Interchangeable parts
          </h2>
          {product.interchanges.length > 0 ? (
            <div className="grid gap-2">
              {product.interchanges.map((i) => (
                <div key={i.id} className="flex items-center justify-between border border-ink-line rounded-plate px-4 py-2 text-sm">
                  <span className="font-mono">{i.targetPartNo}</span>
                  <span className="text-mute">{i.targetManufacturer}</span>
                  {i.exactMatch && <span className="text-[10px] text-stock uppercase font-mono">exact match</span>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-mute">No cross-references on file for this part.</p>
          )}
        </div>
      </div>

      <aside className="border border-ink-line rounded-plate bg-ink-panel p-6 h-fit sticky top-24">
        <p className="text-xs text-mute uppercase tracking-widest mb-1">
          {isLoggedIn ? `Your price (${tierName})` : 'Price (Retail)'}
        </p>
        <p className="font-mono text-3xl font-bold text-signal">
          €{(pricing?.finalPrice ?? product.basePrice).toFixed(2)}
        </p>
        {pricing && <p className="text-[11px] text-mute mt-1">via {pricing.appliedRule}</p>}
        {!isLoggedIn && (
          <p className="text-[11px] text-mute mt-1">
            <Link href="/login" className="text-signal hover:underline">Sign in</Link> to see your account&apos;s price.
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 mt-6 text-center">
          <div className="border border-ink-line rounded-plate py-3">
            <Clock size={16} className="mx-auto mb-1 text-mute" />
            <p className="text-xs font-mono">{product.stockDays} days</p>
          </div>
          <div className="border border-ink-line rounded-plate py-3">
            <PackageCheck size={16} className="mx-auto mb-1 text-stock" />
            <p className="text-xs font-mono text-stock">In stock</p>
          </div>
        </div>

        <button className="w-full mt-6 bg-signal hover:bg-signal-dim text-ink font-display font-bold py-3 rounded-plate transition-colors">
          Add to cart
        </button>

        <p className="flex items-center gap-1.5 text-[11px] text-mute mt-4">
          <ShieldCheck size={13} /> Fitment verified against OE reference
        </p>
      </aside>
    </div>
  );
}
