import Link from 'next/link';
import { prisma } from '@/lib/db';
import {
  Disc, Cog, Navigation, CircleDot, Filter, Thermometer, Zap, Fuel,
  Wind, Cable, Lightbulb, Car, Truck, ShieldCheck, BadgeEuro,
} from 'lucide-react';

const iconMap: Record<string, any> = {
  Disc, Cog, Navigation, CircleDot, Filter, Thermometer, Zap, Fuel, Wind, Cable, Lightbulb, Car,
};

export default async function HomePage() {
  const systems = await prisma.vehicleSystem.findMany({ orderBy: { order: 'asc' } });

  return (
    <div>
      {/* Hero */}
      <section className="hatch border-b border-ink-line">
        <div className="max-w-7xl mx-auto px-6 py-16 grid md:grid-cols-[1.2fr_1fr] gap-10 items-center">
          <div>
            <span className="font-mono text-xs text-signal tracking-widest uppercase">Part search · 40M+ references</span>
            <h1 className="font-display text-4xl md:text-5xl font-bold leading-[1.05] mt-3">
              Find the exact part.<br />Priced for your account.
            </h1>
            <p className="text-mute mt-4 max-w-md">
              Search any OE or aftermarket part number and see live stock, delivery time,
              and a price resolved automatically for your client tier.
            </p>
            <form action="/search" className="mt-6 flex max-w-md">
              <input
                name="q"
                placeholder="e.g. 17138616418"
                className="flex-1 bg-ink-panel border border-ink-line rounded-l-plate px-4 py-3 font-mono text-sm placeholder:font-body placeholder:text-mute focus:outline-none focus:ring-1 focus:ring-signal"
              />
              <button className="bg-signal hover:bg-signal-dim text-ink font-display font-bold px-6 rounded-r-plate transition-colors">
                Search
              </button>
            </form>
          </div>

          <div className="relative border border-ink-line rounded-plate bg-ink-panel p-5">
            <p className="text-xs font-mono text-mute mb-3 uppercase tracking-widest">Sample lookup</p>
            <div className="plate relative rounded-plate px-4 py-3 mb-3">
              <p className="text-[10px] text-mute uppercase tracking-wider">Part number</p>
              <p className="font-mono text-lg font-semibold">17138616418</p>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="border border-ink-line rounded-plate py-3">
                <p className="text-[10px] text-mute uppercase">Your price</p>
                <p className="font-mono font-semibold text-signal">€70.81</p>
              </div>
              <div className="border border-ink-line rounded-plate py-3">
                <p className="text-[10px] text-mute uppercase">Delivery</p>
                <p className="font-mono font-semibold">8 days</p>
              </div>
              <div className="border border-ink-line rounded-plate py-3">
                <p className="text-[10px] text-mute uppercase">Stock</p>
                <p className="font-mono font-semibold text-stock">In stock</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Vehicle systems grid */}
      <section className="max-w-7xl mx-auto px-6 py-14">
        <div className="flex items-baseline justify-between mb-6">
          <h2 className="font-display text-xl font-bold">Browse by system</h2>
          <span className="text-xs text-mute font-mono">{systems.length} categories</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {systems.map((s) => {
            const Icon = iconMap[s.icon] ?? Cog;
            return (
              <Link
                key={s.id}
                href={`/search?system=${s.slug}`}
                className="group border border-ink-line rounded-plate bg-ink-panel hover:border-signal/60 hover:bg-ink-raised transition-colors p-4 flex flex-col items-center text-center gap-2"
              >
                <Icon size={22} className="text-mute group-hover:text-signal transition-colors" />
                <span className="text-xs font-medium leading-tight">{s.name}</span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Trust strip */}
      <section className="border-t border-ink-line bg-ink-panel/40">
        <div className="max-w-7xl mx-auto px-6 py-10 grid sm:grid-cols-3 gap-8">
          <div className="flex gap-3">
            <Truck size={20} className="text-signal shrink-0 mt-0.5" />
            <div>
              <p className="font-display font-semibold text-sm">Fast delivery</p>
              <p className="text-xs text-mute mt-1">Live lead times from every supplier, per part.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <ShieldCheck size={20} className="text-signal shrink-0 mt-0.5" />
            <div>
              <p className="font-display font-semibold text-sm">Verified fitment</p>
              <p className="text-xs text-mute mt-1">Interchange data cross-checked against OE numbers.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <BadgeEuro size={20} className="text-signal shrink-0 mt-0.5" />
            <div>
              <p className="font-display font-semibold text-sm">Tier pricing</p>
              <p className="text-xs text-mute mt-1">Every account sees its own negotiated markup automatically.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
