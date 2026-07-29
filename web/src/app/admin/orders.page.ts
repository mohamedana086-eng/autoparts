import { Component, inject, signal } from '@angular/core';
import { AdminService } from '../core/admin.service';
import { ORDER_STATUSES, type AdminOrder } from '../core/admin.models';

const STATUS_STYLE: Record<string, string> = {
  order_is_sent: 'border-ink-line text-mute',
  processing: 'border-signal text-signal',
  shipped: 'border-stock text-stock',
  paid: 'border-stock text-stock',
};

@Component({
  selector: 'app-admin-orders',
  template: `
    <h1 class="font-display text-2xl font-bold mb-1">Orders</h1>
    <p class="text-sm text-mute mb-6 max-w-2xl">
      Every order placed against the catalog, newest first, with the total resolved from
      the unit prices held at the time each order was submitted.
    </p>

    @if (error()) {
      <div class="border border-alert/40 bg-alert/10 rounded-plate p-4 text-sm text-alert">{{ error() }}</div>
    } @else if (loading()) {
      <div class="border border-ink-line rounded-plate bg-ink-panel h-32 animate-pulse"></div>
    } @else if (orders().length === 0) {
      <div class="border border-dashed border-ink-line rounded-plate p-10 text-center text-mute text-sm">
        No orders yet. Carts are held in the browser and are not submitted as orders, so
        nothing reaches this table until checkout is wired up.
      </div>
    } @else {
      <div class="border border-ink-line rounded-plate overflow-x-auto">
        <table class="w-full text-sm min-w-[640px]">
          <thead>
            <tr class="bg-ink-panel text-mute text-xs uppercase tracking-wider text-left">
              <th class="px-4 py-3 font-medium">Reference</th>
              <th class="px-4 py-3 font-medium">Client</th>
              <th class="px-4 py-3 font-medium">Placed</th>
              <th class="px-4 py-3 font-medium">Items</th>
              <th class="px-4 py-3 font-medium">Status</th>
              <th class="px-4 py-3 font-medium text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            @for (o of orders(); track o.id) {
              <tr class="border-t border-ink-line hover:bg-ink-panel/60">
                <td class="px-4 py-3 font-mono text-xs">{{ o.reference }}</td>
                <td class="px-4 py-3">{{ o.clientName }}</td>
                <td class="px-4 py-3 text-mute text-xs font-mono">{{ o.createdAt.slice(0, 10) }}</td>
                <td class="px-4 py-3 text-mute">{{ o.units }} unit{{ o.units === 1 ? '' : 's' }}</td>
                <td class="px-4 py-3">
                  <select [value]="o.status" (change)="setStatus(o, $any($event.target).value)"
                          [disabled]="busyId() === o.id"
                          [attr.aria-label]="'Status for order ' + o.reference"
                          class="bg-ink border rounded-plate px-2 py-1 text-[10px] font-mono uppercase disabled:opacity-50"
                          [class]="statusClass(o.status)">
                    @for (s of statuses; track s) {
                      <option [value]="s" [selected]="o.status === s">{{ s.split('_').join(' ') }}</option>
                    }
                  </select>
                </td>
                <td class="px-4 py-3 text-right font-mono font-semibold text-signal">€{{ o.total.toFixed(2) }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class AdminOrdersPage {
  private readonly admin = inject(AdminService);

  protected readonly orders = signal<AdminOrder[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly busyId = signal<string | null>(null);
  protected readonly statuses = ORDER_STATUSES;

  constructor() {
    this.admin
      .orders()
      .then((res) => {
        this.orders.set(res.orders);
        this.loading.set(false);
      })
      .catch(() => {
        this.error.set('Could not load orders.');
        this.loading.set(false);
      });
  }

  protected statusClass(status: string): string {
    return STATUS_STYLE[status] ?? 'border-ink-line text-mute';
  }

  protected async setStatus(order: AdminOrder, status: string): Promise<void> {
    if (status === order.status) return;
    this.busyId.set(order.id);
    this.error.set(null);
    try {
      const res = await this.admin.setOrderStatus(order.id, status);
      this.orders.update((list) =>
        list.map((o) => (o.id === order.id ? { ...o, status: res.status } : o))
      );
    } catch (err: any) {
      this.error.set(err?.error?.error ?? 'Could not change that order.');
    } finally {
      this.busyId.set(null);
    }
  }
}
