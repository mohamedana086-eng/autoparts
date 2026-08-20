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
      <div class="note note-alert p-4">{{ error() }}</div>
    } @else if (loading()) {
      <div class="panel h-32 animate-pulse"></div>
    } @else if (orders().length === 0) {
      <div class="border border-dashed border-ink-line rounded-plate p-10 text-center text-mute text-sm">
        No orders yet. They appear here as soon as a signed-in customer places one.
      </div>
    } @else {
      <div class="table-wrap">
        <table class="w-full text-sm sm:min-w-[640px]">
          <thead>
            <tr class="table-head">
              <th class="px-4 py-3 font-medium">Reference</th>
              <th class="px-4 py-3 font-medium">Client</th>
              <th class="col-wide px-4 py-3 font-medium">Placed</th>
              <th class="col-wide px-4 py-3 font-medium">Ordered</th>
              <th class="px-4 py-3 font-medium">Status</th>
              <th class="px-4 py-3 font-medium text-right">Total</th>
              <th class="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            @for (o of orders(); track o.id) {
              <tr class="table-row">
                <td class="px-4 py-3 font-mono text-xs">{{ o.reference }}</td>
                <td class="px-4 py-3">{{ o.clientName }}</td>
                <td class="col-wide px-4 py-3 text-mute text-xs font-mono">{{ o.createdAt.slice(0, 10) }}</td>
                <td class="col-wide px-4 py-3">
                  <!-- The parts, not a bare unit count: four of one and one
                       each of four used to render the same here. -->
                  <span class="text-paper">{{ summary(o) }}</span>
                  <span class="block text-xs text-mute truncate max-w-[22rem]">{{ partsPreview(o) }}</span>
                </td>
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
                <td class="px-4 py-3 text-right">
                  <button type="button" (click)="toggle(o.id)"
                          class="text-xs font-mono uppercase link-signal"
                          [attr.aria-expanded]="expandedId() === o.id"
                          [attr.aria-label]="'Show what was ordered on ' + o.reference">
                    {{ expandedId() === o.id ? 'Hide' : 'Lines' }}
                  </button>
                </td>
              </tr>

              @if (expandedId() === o.id) {
                <tr class="table-row">
                  <td colspan="7" class="px-4 py-4 bg-ink-panel/50">
                    <table class="w-full text-xs">
                      <thead>
                        <tr class="text-mute uppercase tracking-wider text-left">
                          <th class="pb-2 pr-3 font-medium">Part</th>
                          <th class="pb-2 pr-3 font-medium">Kind</th>
                          <th class="pb-2 pr-3 font-medium text-right">Qty</th>
                          <th class="pb-2 pr-3 font-medium text-right">Unit</th>
                          <th class="pb-2 font-medium text-right">Line</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (line of o.lines; track line.productId) {
                          <tr class="border-t border-ink-line">
                            <td class="py-2 pr-3">
                              <span class="font-mono text-paper">{{ line.partNumber }}</span>
                              <span class="block text-mute truncate max-w-[24rem]">
                                {{ line.manufacturer }} · {{ line.name }}
                              </span>
                            </td>
                            <td class="py-2 pr-3 text-mute">{{ line.system }}</td>
                            <td class="py-2 pr-3 text-right font-mono">{{ line.quantity }}</td>
                            <td class="py-2 pr-3 text-right font-mono text-mute">€{{ line.unitPrice.toFixed(2) }}</td>
                            <td class="py-2 text-right font-mono">€{{ line.lineTotal.toFixed(2) }}</td>
                          </tr>
                        }
                      </tbody>
                    </table>
                    <p class="text-[10px] text-mute mt-3 font-mono">
                      Prices held at the time the order was placed, in the base currency.
                    </p>
                  </td>
                </tr>
              }
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
  /** One order's lines open at a time — the table stays skimmable, the same
   *  way the open-baskets list behaves. */
  protected readonly expandedId = signal<string | null>(null);

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

  protected toggle(id: string): void {
    this.expandedId.update((current) => (current === id ? null : id));
  }

  /** "3 parts · 7 units". Both numbers, because either alone is ambiguous. */
  protected summary(order: AdminOrder): string {
    const parts = `${order.lineCount} part${order.lineCount === 1 ? '' : 's'}`;
    const units = `${order.units} unit${order.units === 1 ? '' : 's'}`;

    // One part ordered once makes the two halves say the same thing twice.
    return order.lineCount === order.units ? parts : `${parts} · ${units}`;
  }

  /**
   * What is actually in it, at a glance.
   *
   * Names rather than part numbers: this is the line that answers "what kind
   * of order is this" while scrolling, and "Brake pad set" does that where
   * "34116794300" does not. The numbers are a click away.
   */
  protected partsPreview(order: AdminOrder): string {
    const names = order.lines.map((l) => l.name);
    if (names.length <= 2) return names.join(', ');

    return `${names.slice(0, 2).join(', ')} +${names.length - 2} more`;
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
