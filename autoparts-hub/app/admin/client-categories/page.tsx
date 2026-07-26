import { prisma } from '@/lib/db';
import { createClientCategory, deleteClientCategory } from '@/app/admin/actions';
import { Trash2 } from 'lucide-react';

export default async function ClientCategoriesPage() {
  const categories = await prisma.clientCategory.findMany({
    include: { _count: { select: { clients: true } } },
    orderBy: { markupPercent: 'asc' },
  });

  return (
    <div>
      <h1 className="font-display text-2xl font-bold mb-1">Client categories</h1>
      <p className="text-sm text-mute mb-6">
        Each client belongs to one category, which sets the default markup applied when no
        more specific markup rule matches.
      </p>

      <div className="border border-ink-line rounded-plate overflow-x-auto mb-8">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="bg-ink-panel text-mute text-xs uppercase tracking-wider text-left">
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Markup %</th>
              <th className="px-4 py-3 font-medium">Min. order</th>
              <th className="px-4 py-3 font-medium">Shelf life (days)</th>
              <th className="px-4 py-3 font-medium">Clients</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id} className="border-t border-ink-line hover:bg-ink-panel/60">
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3 font-mono text-signal">{c.markupPercent}%</td>
                <td className="px-4 py-3 font-mono">€{c.minOrderAmount.toFixed(2)}</td>
                <td className="px-4 py-3 font-mono">{c.shelfLifeDays}</td>
                <td className="px-4 py-3 font-mono">{c._count.clients}</td>
                <td className="px-4 py-3 text-right">
                  <form action={deleteClientCategory.bind(null, c.id)}>
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

      <div className="border border-ink-line rounded-plate bg-ink-panel p-6 max-w-xl">
        <h2 className="font-display font-semibold mb-4">Add category</h2>
        <form action={createClientCategory} className="grid grid-cols-2 gap-4">
          <label className="grid gap-1 text-xs text-mute col-span-2">
            Name
            <input name="name" required className="bg-ink border border-ink-line rounded-plate px-3 py-2 text-sm text-paper" placeholder="e.g. Price 11" />
          </label>
          <label className="grid gap-1 text-xs text-mute">
            Markup %
            <input name="markupPercent" type="number" step="0.01" required className="bg-ink border border-ink-line rounded-plate px-3 py-2 text-sm text-paper" />
          </label>
          <label className="grid gap-1 text-xs text-mute">
            Min. order (€)
            <input name="minOrderAmount" type="number" step="0.01" defaultValue={0} className="bg-ink border border-ink-line rounded-plate px-3 py-2 text-sm text-paper" />
          </label>
          <label className="grid gap-1 text-xs text-mute">
            Shelf life (days)
            <input name="shelfLifeDays" type="number" defaultValue={1} className="bg-ink border border-ink-line rounded-plate px-3 py-2 text-sm text-paper" />
          </label>
          <button className="col-span-2 mt-2 bg-signal hover:bg-signal-dim text-ink font-display font-bold py-2.5 rounded-plate transition-colors">
            Add category
          </button>
        </form>
      </div>
    </div>
  );
}
