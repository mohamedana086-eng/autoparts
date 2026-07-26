import { prisma } from '@/lib/db';
import { Package, Users, SlidersHorizontal, ClipboardList } from 'lucide-react';

export default async function AdminDashboard() {
  const [products, clients, rules, orders] = await Promise.all([
    prisma.product.count(),
    prisma.client.count(),
    prisma.markupRule.count({ where: { active: true } }),
    prisma.order.count(),
  ]);

  const stats = [
    { label: 'Products', value: products, icon: Package },
    { label: 'Clients', value: clients, icon: Users },
    { label: 'Active markup rules', value: rules, icon: SlidersHorizontal },
    { label: 'Orders', value: orders, icon: ClipboardList },
  ];

  return (
    <div>
      <h1 className="font-display text-2xl font-bold mb-6">Dashboard</h1>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="border border-ink-line rounded-plate bg-ink-panel p-5">
            <s.icon size={18} className="text-signal mb-3" />
            <p className="font-mono text-2xl font-bold">{s.value}</p>
            <p className="text-xs text-mute mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-10 border border-ink-line rounded-plate bg-ink-panel p-6">
        <h2 className="font-display font-semibold mb-2">How pricing resolves</h2>
        <p className="text-sm text-mute leading-relaxed">
          Every price shown to a client is computed at request time: the engine looks for the
          most specific active <strong className="text-paper">Markup rule</strong> that matches
          the client&apos;s category, the supplier, manufacturer, vehicle system, part-number
          prefix, or purchase-price band. If nothing matches, it falls back to that client
          category&apos;s default markup percentage. See <code className="font-mono text-xs bg-ink-raised px-1.5 py-0.5 rounded">lib/pricing.ts</code>.
        </p>
      </div>
    </div>
  );
}
