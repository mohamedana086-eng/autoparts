import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CartService } from '../core/cart.service';
import { AuthService } from '../core/auth.service';
import { OrdersService, type PlacedOrder } from '../core/orders.service';

@Component({
  selector: 'app-cart',
  imports: [RouterLink],
  template: `
    <div class="max-w-4xl mx-auto px-6 py-10">
      <div class="flex items-baseline justify-between mb-8">
        <h1 class="font-display text-2xl font-bold">Your cart</h1>
        @if (cart.count() > 0) {
          <span class="text-xs text-mute font-mono">
            {{ cart.count() }} item{{ cart.count() === 1 ? '' : 's' }}
          </span>
        }
      </div>

      @if (placed(); as order) {
        <div class="border border-stock/40 bg-stock/10 rounded-plate p-6 mb-6">
          <p class="font-display font-bold text-lg text-stock">Order placed</p>
          <p class="text-sm mt-2">
            Reference <span class="font-mono text-paper">{{ order.reference }}</span> ·
            <span class="font-mono text-signal">€{{ order.total.toFixed(2) }}</span>
          </p>
          <p class="text-xs text-mute mt-2">
            We will confirm availability and come back to you.
            <a routerLink="/orders" class="link-signal">See your orders</a>.
          </p>
        </div>
      }

      @if (cart.items().length === 0) {
        @if (!placed()) {
          <div class="border border-dashed border-ink-line rounded-plate p-12 text-center">
            <p class="text-mute text-sm">Your cart is empty.</p>
            <a routerLink="/" class="inline-block mt-4 link-signal text-sm">Browse the catalog</a>
          </div>
        }
      } @else {
        <div class="grid gap-3">
          @for (item of cart.items(); track item.id) {
            <div class="panel p-4 grid grid-cols-1 sm:grid-cols-[auto_1fr_auto] gap-4 items-center">
              <a [routerLink]="['/product', item.id]" class="plate relative rounded-plate px-4 py-2 w-fit">
                <p class="text-[9px] text-mute uppercase tracking-wider">{{ item.manufacturer }}</p>
                <p class="font-mono font-semibold text-sm">{{ item.partNumber }}</p>
              </a>

              <div class="min-w-0">
                <a [routerLink]="['/product', item.id]" class="font-medium hover:text-signal transition-colors">
                  {{ item.name }}
                </a>
                <p class="text-xs text-mute mt-1">
                  {{ item.stockDays }} day{{ item.stockDays === 1 ? '' : 's' }} delivery
                </p>
                <p class="text-xs text-mute mt-1 font-mono">€{{ item.unitPrice.toFixed(2) }} each</p>
              </div>

              <div class="flex items-center gap-4 justify-between sm:justify-end">
                <div class="flex items-center border border-ink-line rounded-plate">
                  <button type="button" (click)="cart.setQty(item.id, item.qty - 1)"
                          class="px-3 py-1.5 text-mute hover:text-paper transition-colors"
                          [attr.aria-label]="'Decrease quantity of ' + item.name">−</button>
                  <span class="font-mono text-sm w-8 text-center" aria-live="polite">{{ item.qty }}</span>
                  <button type="button" (click)="cart.setQty(item.id, item.qty + 1)"
                          class="px-3 py-1.5 text-mute hover:text-paper transition-colors"
                          [attr.aria-label]="'Increase quantity of ' + item.name">+</button>
                </div>

                <p class="font-mono font-bold text-signal w-20 text-right">
                  €{{ (item.unitPrice * item.qty).toFixed(2) }}
                </p>

                <button type="button" (click)="cart.remove(item.id)"
                        class="text-mute hover:text-alert transition-colors text-xs uppercase font-mono"
                        [attr.aria-label]="'Remove ' + item.name + ' from cart'">Remove</button>
              </div>
            </div>
          }
        </div>

        <div class="panel mt-6 p-5">
          <div class="flex items-baseline justify-between">
            <span class="font-display font-semibold">Total</span>
            <span class="font-mono text-2xl font-bold text-signal">€{{ cart.total().toFixed(2) }}</span>
          </div>
          <p class="text-[11px] text-mute mt-2">
            Prices are the ones quoted for your tier when each part was added, and are
            confirmed against the catalogue when the order is placed.
          </p>

          @if (error()) {
            <p class="text-sm text-alert bg-alert/10 border border-alert/30 rounded-plate px-3 py-2 mt-4">
              {{ error() }}
            </p>
          }

          @if (auth.isLoggedIn()) {
            <button type="button" (click)="placeOrder()" [disabled]="placing()"
                    class="w-full mt-4 btn-primary py-3">
              {{ placing() ? 'Placing order…' : 'Place order' }}
            </button>
          } @else {
            <p class="text-sm text-mute mt-4">
              <a routerLink="/login" class="link-signal">Sign in</a>
              to place this order — your cart is kept.
            </p>
          }
        </div>

        <div class="flex items-center justify-between mt-6">
          <a routerLink="/" class="text-sm link-signal">Continue shopping</a>
          <button type="button" (click)="cart.clear()"
                  class="text-xs text-mute hover:text-alert transition-colors">Clear cart</button>
        </div>
      }
    </div>
  `,
})
export class CartPage {
  protected readonly cart = inject(CartService);
  protected readonly auth = inject(AuthService);
  private readonly orders = inject(OrdersService);

  protected readonly placing = signal(false);
  protected readonly placed = signal<PlacedOrder | null>(null);
  protected readonly error = signal<string | null>(null);

  protected async placeOrder(): Promise<void> {
    if (this.placing()) return;

    this.placing.set(true);
    this.error.set(null);
    try {
      const res = await this.orders.place(
        this.cart.items().map((i) => ({ productId: i.id, quantity: i.qty }))
      );
      this.placed.set(res.order);
      // Only cleared once the order is safely recorded, so a failure leaves
      // the customer's cart intact.
      this.cart.clear();
    } catch (err: any) {
      this.error.set(err?.error?.error ?? 'Could not place that order. Please try again.');
    } finally {
      this.placing.set(false);
    }
  }
}
