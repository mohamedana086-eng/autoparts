import { Component, inject, signal } from '@angular/core';
import { AdminService } from '../core/admin.service';
import type { AdminCart } from '../core/admin.models';

@Component({
  selector: 'app-admin-carts',
  template: `
    <h1 class="font-display text-2xl font-bold mb-1">Open baskets</h1>
    <p class="text-sm text-mute mb-6 max-w-2xl">
      Baskets that were filled and never ordered, oldest first — the one sitting untouched
      longest is the one worth a phone call. Values are the purchase cost of the lines, not
      what the customer would be quoted.
    </p>

    @if (error()) {
      <div class="note note-alert p-3 mb-4">{{ error() }}</div>
    }

    @if (loading()) {
      <div class="panel h-40 animate-pulse"></div>
    } @else {
      <div class="table-wrap">
        <table class="w-full text-sm min-w-[760px]">
          <thead>
            <tr class="table-head">
              <th class="px-4 py-3 font-medium">Customer</th>
              <th class="px-4 py-3 font-medium">Last touched</th>
              <th class="px-4 py-3 font-medium text-right">Lines</th>
              <th class="px-4 py-3 font-medium text-right">Units</th>
              <th class="px-4 py-3 font-medium text-right">Cost</th>
              <th class="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            @for (c of carts(); track c.id) {
              <tr class="table-row">
                <td class="px-4 py-3">
                  {{ c.clientName }}
                  <span class="block text-xs text-mute font-mono">{{ c.clientEmail }}</span>
                </td>
                <td class="px-4 py-3 text-mute text-xs font-mono">{{ c.updatedAt.slice(0, 10) }}</td>
                <td class="px-4 py-3 text-right font-mono text-xs">{{ c.items.length }}</td>
                <td class="px-4 py-3 text-right font-mono">{{ c.units }}</td>
                <td class="px-4 py-3 text-right font-mono">€{{ c.cost.toFixed(2) }}</td>
                <td class="px-4 py-3 text-right">
                  <button type="button" (click)="toggle(c.id)"
                          class="text-xs font-mono uppercase link-signal"
                          [attr.aria-expanded]="expandedId() === c.id"
                          [attr.aria-label]="'Show what ' + c.clientName + ' has in their basket'">
                    {{ expandedId() === c.id ? 'Hide' : 'Lines' }}
                  </button>
                </td>
              </tr>
              @if (expandedId() === c.id) {
                <tr class="table-row">
                  <td colspan="6" class="px-4 py-4 bg-ink-panel/50">
                    <ul class="grid gap-1.5">
                      @for (item of c.items; track item.productId) {
                        <li class="flex items-baseline gap-3 text-xs">
                          <span class="font-mono text-paper w-40 shrink-0">{{ item.partNumber }}</span>
                          <span class="text-mute flex-1 min-w-0 truncate">{{ item.name }}</span>
                          <span class="font-mono">× {{ item.quantity }}</span>
                        </li>
                      }
                    </ul>
                  </td>
                </tr>
              }
            }
            @if (carts().length === 0) {
              <tr>
                <td colspan="6" class="px-4 py-8 text-center text-mute text-sm">
                  No basket is sitting unordered.
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <p class="text-xs text-mute mt-3 font-mono">{{ carts().length }} shown</p>
    }
  `,
})
export class AdminCartsPage {
  private readonly admin = inject(AdminService);

  protected readonly carts = signal<AdminCart[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  /** Only one basket's lines are open at a time — the table stays skimmable. */
  protected readonly expandedId = signal<string | null>(null);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.admin
      .carts()
      .then((res) => {
        this.carts.set(res.carts);
        this.loading.set(false);
      })
      .catch(() => {
        this.error.set('Could not load open baskets.');
        this.loading.set(false);
      });
  }

  protected toggle(id: string): void {
    this.expandedId.update((current) => (current === id ? null : id));
  }
}
