import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CatalogService } from '../core/catalog.service';
import { CartService } from '../core/cart.service';
import type { ProductResponse } from '../core/api.models';

@Component({
  selector: 'app-product',
  imports: [RouterLink],
  template: `
    @if (error()) {
      <div class="max-w-5xl mx-auto px-6 py-16 text-center">
        <p class="text-mute text-sm">{{ error() }}</p>
        <a routerLink="/" class="inline-block mt-4 text-signal hover:underline text-sm">Back to the catalog</a>
      </div>
    } @else if (loading() || !data()) {
      <div class="max-w-5xl mx-auto px-6 py-10 grid md:grid-cols-[1.3fr_1fr] gap-10">
        <div class="h-64 border border-ink-line rounded-plate bg-ink-panel animate-pulse"></div>
        <div class="h-64 border border-ink-line rounded-plate bg-ink-panel animate-pulse"></div>
      </div>
    } @else {
      <div class="max-w-5xl mx-auto px-6 py-10 grid md:grid-cols-[1.3fr_1fr] gap-10">
        <div>
          <div class="plate relative rounded-plate px-5 py-4 w-fit mb-6">
            <p class="text-[10px] text-mute uppercase tracking-wider">{{ product().manufacturer }}</p>
            <p class="font-mono text-2xl font-bold">{{ product().partNumber }}</p>
          </div>

          <h1 class="font-display text-2xl font-bold">{{ product().name }}</h1>
          <p class="text-mute text-sm mt-1">{{ product().system }}</p>
          @if (product().description) {
            <p class="mt-4 text-sm text-paper/90">{{ product().description }}</p>
          }

          <div class="mt-8">
            <h2 class="font-display font-semibold text-sm mb-3">Interchangeable parts</h2>
            @if (product().interchanges.length) {
              <div class="grid gap-2">
                @for (i of product().interchanges; track i.id) {
                  <div class="flex items-center justify-between border border-ink-line rounded-plate px-4 py-2 text-sm">
                    <span class="font-mono">{{ i.partNumber }}</span>
                    <span class="text-mute">{{ i.manufacturer }}</span>
                    @if (i.exactMatch) {
                      <span class="text-[10px] text-stock uppercase font-mono">exact match</span>
                    }
                  </div>
                }
              </div>
            } @else {
              <p class="text-xs text-mute">No cross-references on file for this part.</p>
            }
          </div>
        </div>

        <aside class="border border-ink-line rounded-plate bg-ink-panel p-6 h-fit sticky top-24">
          <p class="text-xs text-mute uppercase tracking-widest mb-1">
            {{ data()!.isLoggedIn ? 'Your price (' + data()!.tierName + ')' : 'Price (Retail)' }}
          </p>
          <p class="font-mono text-3xl font-bold text-signal">€{{ product().price.toFixed(2) }}</p>
          @if (product().appliedRule) {
            <p class="text-[11px] text-mute mt-1">via {{ product().appliedRule }}</p>
          }
          @if (!data()!.isLoggedIn) {
            <p class="text-[11px] text-mute mt-1">
              <a routerLink="/login" class="text-signal hover:underline">Sign in</a> to see your account's price.
            </p>
          }

          <div class="grid grid-cols-2 gap-3 mt-6 text-center">
            <div class="border border-ink-line rounded-plate py-3">
              <p class="text-xs font-mono">{{ product().stockDays }} day{{ product().stockDays === 1 ? '' : 's' }}</p>
            </div>
            <div class="border border-ink-line rounded-plate py-3">
              <p class="text-xs font-mono text-stock">In stock</p>
            </div>
          </div>

          <button type="button" (click)="addToCart()"
                  class="w-full mt-6 bg-signal hover:bg-signal-dim text-ink font-display font-bold py-3 rounded-plate transition-colors">
            {{ added() ? 'Added to cart' : 'Add to cart' }}
          </button>

          <p class="text-[11px] text-mute mt-4">Fitment verified against OE reference</p>
        </aside>
      </div>
    }
  `,
})
export class ProductPage {
  private readonly catalog = inject(CatalogService);
  private readonly cart = inject(CartService);
  private readonly route = inject(ActivatedRoute);

  protected readonly data = signal<ProductResponse | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly added = signal(false);

  private resetTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      if (!id) return;
      this.loading.set(true);
      this.error.set(null);

      this.catalog.product(id).subscribe({
        next: (res) => {
          this.data.set(res);
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(err?.status === 404 ? 'That part is not in the catalog.' : 'Could not load this part.');
          this.loading.set(false);
        },
      });
    });
  }

  /** Only called from the template once `data()` is non-null. */
  protected product() {
    return this.data()!.product;
  }

  protected addToCart(): void {
    const p = this.product();
    this.cart.add({
      id: p.id,
      partNumber: p.partNumber,
      name: p.name,
      manufacturer: p.manufacturer,
      unitPrice: p.price,
      stockDays: p.stockDays,
    });
    this.added.set(true);
    clearTimeout(this.resetTimer);
    this.resetTimer = setTimeout(() => this.added.set(false), 1600);
  }
}
