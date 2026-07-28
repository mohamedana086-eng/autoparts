import Link from 'next/link';
import { prisma } from '@/lib/db';

const statusStyle: Record<string, string> = {
  order_is_sent: 'border-ink-line text-mute',
  processing: 'border-signal text-signal',
  shipped: 'border-stock text-stock',
  paid: 'border-stock text-stock',
};

function formatStatus(status: string) {
  return status.replace(/_/g, ' ');
}

export default async function AdminOrdersPage() {
  const orders = await prisma.order.findMany({
    include: { client: true, items: true },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div>
      <h1 className="font-display text-2xl font-bold mb-1">Orders</h1>
      <p className="text-sm text-mute mb-6 max-w-2xl">
        Every order placed against the catalog, newest first, with the total resolved from
        the unit prices held at the time each order was submitted.
      </p>

      {orders.length === 0 ? (
        <div className="border border-dashed border-ink-line rounded-plate p-10 text-center text-mute text-sm">
          No orders yet. Carts are held in the browser and are not submitted as orders, so
          nothing reaches this table until checkout is wired up.
        </div>
      ) : (
        <div className="border border-ink-line rounded-plate overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="bg-ink-panel text-mute text-xs uppercase tracking-wider text-left">
                <th className="px-4 py-3 font-medium">Reference</th>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Placed</th>
                <th className="px-4 py-3 font-medium">Items</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const units = order.items.reduce((n, i) => n + i.quantity, 0);
                const total = order.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

                return (
                  <tr key={order.id} className="border-t border-ink-line hover:bg-ink-panel/60">
                    <td className="px-4 py-3 font-mono text-xs">{order.reference}</td>
                    <td className="px-4 py-3">
                      <Link href="/admin/clients" className="hover:text-signal transition-colors">
                        {order.client.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-mute text-xs font-mono">
                      {order.createdAt.toISOString().slice(0, 10)}
                    </td>
                    <td className="px-4 py-3 text-mute">
                      {units} unit{units === 1 ? '' : 's'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-[10px] font-mono uppercase px-2 py-1 rounded-plate border ${
                          statusStyle[order.status] ?? 'border-ink-line text-mute'
                        }`}
                      >
                        {formatStatus(order.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-signal">
                      €{total.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
