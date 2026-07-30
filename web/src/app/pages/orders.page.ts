import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { OrdersService, type MyOrder } from '../core/orders.service';
import { AuthService } from '../core/auth.service';

const STATUS_STYLE: Record<string, string> = {
  order_is_sent: 'border-ink-line text-mute',
  processing: 'border-signal text-signal',
  shipped: 'border-stock text-stock',
  paid: 'border-stock text-stock',
};

@Component({
  selector: 'app-orders',
  imports: [RouterLink],
  template: `
    <div class="max-w-4xl mx-auto px-6 py-10">
      <h1 class="font-display text-2xl font-bold mb-1">Your orders</h1>
      <p class="text-sm text-mute mb-8">
        Every order on this account, newest first, at the prices held when it was placed.
      </p>

      @if (!auth.isLoggedIn() && auth.loaded()) {
        <div class="border border-dashed border-ink-line rounded-plate p-12 text-center">
          <p class="text-mute text-sm">
            <a routerLink="/login" class="text-signal hover:underline">Sign in</a> to see your orders.
          </p>
        </div>
      } @else if (error()) {
        <div class="border border-alert/40 bg-alert/10 rounded-plate p-4 text-sm text-alert">{{ error() }}</div>
      } @else if (loading()) {
        <div class="grid gap-3">
          @for (n of [0, 1]; track n) {
            <div class="border border-ink-line rounded-plate bg-ink-panel h-28 animate-pulse"></div>
          }
        </div>
      } @else if (orders().length === 0) {
        <div class="border border-dashed border-ink-line rounded-plate p-12 text-center">
          <p class="text-mute text-sm">No orders yet.</p>
          <a routerLink="/" class="inline-block mt-4 text-signal hover:underline text-sm">Browse the catalog</a>
        </div>
      } @else {
        <div class="grid gap-4">
          @for (o of orders(); track o.id) {
            <div class="border border-ink-line rounded-plate bg-ink-panel p-5">
              <div class="flex flex-wrap items-baseline justify-between gap-2 mb-3">
                <div>
                  <p class="font-mono font-semibold">{{ o.reference }}</p>
                  <p class="text-xs text-mute mt-0.5">
                    {{ o.createdAt.slice(0, 10) }} · {{ o.units }} unit{{ o.units === 1 ? '' : 's' }}
                  </p>
                </div>
                <div class="flex items-center gap-3">
                  <span class="text-[10px] font-mono uppercase px-2 py-1 rounded-plate border"
                        [class]="statusClass(o.status)">
                    {{ o.status.split('_').join(' ') }}
                  </span>
                  <span class="font-mono font-bold text-signal">€{{ o.total.toFixed(2) }}</span>
                </div>
              </div>

              <div class="border-t border-ink-line pt-3 grid gap-1">
                @for (line of o.lines; track $index) {
                  <div class="flex items-baseline justify-between text-xs">
                    <span class="text-mute">
                      <span class="font-mono text-paper">{{ line.partNumber }}</span> · {{ line.name }}
                    </span>
                    <span class="font-mono text-mute shrink-0 ml-3">
                      {{ line.quantity }} × €{{ line.unitPrice.toFixed(2) }}
                    </span>
                  </div>
                }
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class OrdersPage {
  private readonly ordersApi = inject(OrdersService);
  protected readonly auth = inject(AuthService);

  protected readonly orders = signal<MyOrder[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.ordersApi
      .mine()
      .then((res) => {
        this.orders.set(res.orders);
        this.loading.set(false);
      })
      .catch((err) => {
        // 401 is handled by the signed-out branch above, not an error banner.
        if (err?.status !== 401) this.error.set('Could not load your orders.');
        this.loading.set(false);
      });
  }

  protected statusClass(status: string): string {
    return STATUS_STYLE[status] ?? 'border-ink-line text-mute';
  }
}
