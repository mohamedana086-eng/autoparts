import { prisma } from '@/lib/db';
import { createMarkupRule, deleteMarkupRule, toggleMarkupRule } from '@/app/admin/actions';
import { Trash2 } from 'lucide-react';

export default async function MarkupRulesPage() {
  const [rules, categories, suppliers, systems] = await Promise.all([
    prisma.markupRule.findMany({
      include: { clientCategory: true, supplier: true },
      orderBy: { priority: 'desc' },
    }),
    prisma.clientCategory.findMany(),
    prisma.supplier.findMany(),
    prisma.vehicleSystem.findMany(),
  ]);

  return (
    <div>
      <h1 className="font-display text-2xl font-bold mb-1">Markup rules</h1>
      <p className="text-sm text-mute mb-6 max-w-2xl">
        A rule matches when every filter you set applies (blank filters mean &quot;any&quot;).
        When several rules match the same product, the most specific one wins — see the
        priority column to break ties. This is the same logic as the source system&apos;s
        &quot;Complex markup&quot; screen.
      </p>

      <div className="border border-ink-line rounded-plate overflow-x-auto mb-8">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="bg-ink-panel text-mute text-xs uppercase tracking-wider text-left">
              <th className="px-4 py-3 font-medium">Label</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Supplier</th>
              <th className="px-4 py-3 font-medium">Manufacturer</th>
              <th className="px-4 py-3 font-medium">System</th>
              <th className="px-4 py-3 font-medium">Price band</th>
              <th className="px-4 py-3 font-medium">Adjustment</th>
              <th className="px-4 py-3 font-medium">Active</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id} className="border-t border-ink-line hover:bg-ink-panel/60">
                <td className="px-4 py-3 font-medium">{r.label}</td>
                <td className="px-4 py-3 text-mute">{r.clientCategory?.name ?? 'any'}</td>
                <td className="px-4 py-3 text-mute">{r.supplier?.name ?? 'any'}</td>
                <td className="px-4 py-3 text-mute">{r.manufacturerName ?? 'any'}</td>
                <td className="px-4 py-3 text-mute">{r.vehicleSystemSlug ?? 'any'}</td>
                <td className="px-4 py-3 font-mono text-xs text-mute">
                  {r.purchasePriceFrom != null || r.purchasePriceTo != null
                    ? `€${r.purchasePriceFrom ?? 0}–${r.purchasePriceTo ?? '∞'}`
                    : 'any'}
                </td>
                <td className="px-4 py-3 font-mono text-signal">
                  {r.type === 'PERCENT' && `+${r.value}%`}
                  {r.type === 'AMOUNT' && `+€${r.value}`}
                  {r.type === 'FIXED' && `= €${r.value}`}
                </td>
                <td className="px-4 py-3">
                  <form action={toggleMarkupRule.bind(null, r.id, !r.active)}>
                    <button
                      className={`text-[10px] font-mono uppercase px-2 py-1 rounded-plate border ${
                        r.active ? 'border-stock text-stock' : 'border-ink-line text-mute'
                      }`}
                    >
                      {r.active ? 'active' : 'off'}
                    </button>
                  </form>
                </td>
                <td className="px-4 py-3 text-right">
                  <form action={deleteMarkupRule.bind(null, r.id)}>
                    <button className="text-mute hover:text-alert transition-colors" title="Delete">
                      <Trash2 size={15} />
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border border-ink-line rounded-plate bg-ink-panel p-6">
        <h2 className="font-display font-semibold mb-4">New markup rule</h2>
        <form action={createMarkupRule} className="grid md:grid-cols-3 gap-4">
          <label className="grid gap-1 text-xs text-mute md:col-span-2">
            Label
            <input name="label" required placeholder="e.g. BMW cooling parts — Price 9 club"
              className="bg-ink border border-ink-line rounded-plate px-3 py-2 text-sm text-paper" />
          </label>
          <label className="grid gap-1 text-xs text-mute">
            Priority (higher wins ties)
            <input name="priority" type="number" defaultValue={0}
              className="bg-ink border border-ink-line rounded-plate px-3 py-2 text-sm text-paper" />
          </label>

          <label className="grid gap-1 text-xs text-mute">
            Client category
            <select name="clientCategoryId" className="bg-ink border border-ink-line rounded-plate px-3 py-2 text-sm text-paper">
              <option value="">— any —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-mute">
            Supplier
            <select name="supplierId" className="bg-ink border border-ink-line rounded-plate px-3 py-2 text-sm text-paper">
              <option value="">— any —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-mute">
            Vehicle system
            <select name="vehicleSystemSlug" className="bg-ink border border-ink-line rounded-plate px-3 py-2 text-sm text-paper">
              <option value="">— any —</option>
              {systems.map((s) => <option key={s.id} value={s.slug}>{s.name}</option>)}
            </select>
          </label>

          <label className="grid gap-1 text-xs text-mute">
            Manufacturer name
            <input name="manufacturerName" placeholder="e.g. BMW"
              className="bg-ink border border-ink-line rounded-plate px-3 py-2 text-sm text-paper" />
          </label>
          <label className="grid gap-1 text-xs text-mute">
            Part number prefix
            <input name="partNumberPrefix" placeholder="e.g. 1713"
              className="bg-ink border border-ink-line rounded-plate px-3 py-2 text-sm text-paper" />
          </label>
          <div />

          <label className="grid gap-1 text-xs text-mute">
            Purchase price from (€)
            <input name="purchasePriceFrom" type="number" step="0.01"
              className="bg-ink border border-ink-line rounded-plate px-3 py-2 text-sm text-paper" />
          </label>
          <label className="grid gap-1 text-xs text-mute">
            Purchase price to (€)
            <input name="purchasePriceTo" type="number" step="0.01"
              className="bg-ink border border-ink-line rounded-plate px-3 py-2 text-sm text-paper" />
          </label>
          <div />

          <label className="grid gap-1 text-xs text-mute">
            Adjustment type
            <select name="type" className="bg-ink border border-ink-line rounded-plate px-3 py-2 text-sm text-paper">
              <option value="PERCENT">Percent (+%)</option>
              <option value="AMOUNT">Flat amount (+€)</option>
              <option value="FIXED">Fixed price (=€)</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs text-mute">
            Value
            <input name="value" type="number" step="0.01" required
              className="bg-ink border border-ink-line rounded-plate px-3 py-2 text-sm text-paper" />
          </label>

          <button className="md:col-span-3 mt-2 bg-signal hover:bg-signal-dim text-ink font-display font-bold py-2.5 rounded-plate transition-colors">
            Create rule
          </button>
        </form>
      </div>
    </div>
  );
}
