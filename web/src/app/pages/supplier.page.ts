import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SuppliersService, type SupplierDetail } from '../core/suppliers.service';
import { CatalogService } from '../core/catalog.service';
import type { ProductSummary, SearchResponse } from '../core/api.models';

const RELIABILITY_STYLE: Record<string, string> = {
  official: 'border-stock text-stock',
  reliable: 'border-signal text-signal',
  standard: 'border-ink-line text-mute',
};

@Component({
  selector: 'app-supplier',
  imports: [RouterLink],
  template: `
    @if (error()) {
      <div class="max-w-5xl mx-auto px-6 py-16 text-center">
        <p class="text-mute text-sm">{{ error() }}</p>
        <a routerLink="/suppliers" class="inline-block mt-4 text-signal hover:underline text-sm">All suppliers</a>
      </div>
    } @else if (loading() || !supplier()) {
      <div class="max-w-5xl mx-auto px-6 py-10">
        <div class="h-32 border border-ink-line rounded-plate bg-ink-panel animate-pulse"></div>
      </div>
    } @else {
      <div class="max-w-5xl mx-auto px-6 py-10">
        <a routerLink="/suppliers" class="text-xs text-mute hover:text-paper transition-colors">← All suppliers</a>

        <div class="flex flex-wrap items-baseline gap-3 mt-3 mb-2">
          <h1 class="font-display text-2xl font-bold">{{ supplier()!.name }}</h1>
          <span class="font-mono text-[10px] uppercase px-2 py-0.5 rounded-plate border"
                [class]="badge(supplier()!.reliability)">{{ supplier()!.reliability }}</span>
          <span class="font-mono text-xs text-mute">{{ supplier()!.code }}</span>
        </div>

        @if (supplier()!.description) {
          <p class="text-sm text-mute max-w-2xl mb-6">{{ supplier()!.description }}</p>
        }

        <div class="grid sm:grid-cols-3 gap-3 mb-8">
          <div class="border border-ink-line rounded-plate bg-ink-panel p-4">
            <p class="font-mono text-2xl font-bold">{{ supplier()!.productCount }}</p>
            <p class="text-xs text-mute mt-1">Parts listed</p>
          </div>
          <div class="border border-ink-line rounded-plate bg-ink-panel p-4">
            <p class="font-mono text-2xl font-bold">{{ supplier()!.brands.length }}</p>
            <p class="text-xs text-mute mt-1">Brands carried</p>
          </div>
          <div class="border border-ink-line rounded-plate bg-ink-panel p-4">
            <p class="font-mono text-2xl font-bold">
              {{ supplier()!.fastestDelivery === null ? '—' : supplier()!.fastestDelivery + 'd' }}
            </p>
            <p class="text-xs text-mute mt-1">Fastest delivery</p>
          </div>
        </div>

        @if (supplier()!.brands.length) {
          <div class="mb-8">
            <h2 class="font-display font-semibold text-sm mb-3">Brands</h2>
            <div class="flex flex-wrap gap-2">
              @for (b of supplier()!.brands; track b.name) {
                <span class="text-xs px-2.5 py-1 rounded-plate border border-ink-line text-mute">
                  {{ b.name }} <span class="font-mono text-[10px] opacity-70">{{ b.count }}</span>
                </span>
              }
            </div>
          </div>
        }

        <div class="flex items-baseline justify-between mb-4">
          <h2 class="font-display font-semibold text-sm">Their full range</h2>
          <a [routerLink]="['/search']" [queryParams]="{ supplier: supplier()!.slug }"
             class="text-xs text-signal hover:underline">Search within this supplier</a>
        </div>

        @if (products().length === 0) {
          <div class="border border-dashed border-ink-line rounded-plate p-10 text-center text-mute text-sm">
            Nothing listed from this supplier yet.
          </div>
        } @else {
          <p class="text-xs text-mute mb-3">
            @if (results()?.isLoggedIn) {
              Priced at your <span class="text-paper">{{ results()!.tierName }}</span> tier.
            } @else {
              Retail prices —
              <a routerLink="/login" class="text-signal hover:underline">sign in</a>
              for your account's.
            }
          </p>

          <div class="grid gap-3">
            @for (p of products(); track p.id) {
              <a [routerLink]="['/product', p.id]"
                 class="border border-ink-line rounded-plate bg-ink-panel hover:border-signal/50 transition-colors p-4 grid grid-cols-1 md:grid-cols-[auto_1fr_auto] gap-4 items-center">
                <div class="plate relative rounded-plate px-4 py-2 w-fit">
                  <p class="text-[9px] text-mute uppercase tracking-wider">{{ p.manufacturer }}</p>
                  <p class="font-mono font-semibold text-sm">{{ p.partNumber }}</p>
                </div>
                <div>
                  <p class="font-medium">{{ p.name }}</p>
                  <p class="text-xs text-mute mt-1">{{ p.system }}</p>
                  <p class="text-xs text-mute mt-2">
                    {{ p.stockDays }} day{{ p.stockDays === 1 ? '' : 's' }} delivery
                  </p>
                </div>
                <div class="text-right">
                  <p class="font-mono text-lg font-bold text-signal">€{{ p.price.toFixed(2) }}</p>
                  @if (p.appliedRule) {
                    <p class="text-[10px] text-mute mt-0.5">{{ p.appliedRule }}</p>
                  }
                </div>
              </a>
            }
          </div>
        }
      </div>
    }
  `,
})
export class SupplierPage {
  private readonly suppliers = inject(SuppliersService);
  private readonly catalog = inject(CatalogService);
  private readonly route = inject(ActivatedRoute);

  protected readonly supplier = signal<SupplierDetail | null>(null);
  protected readonly results = signal<SearchResponse | null>(null);
  protected readonly products = signal<ProductSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.route.paramMap.subscribe((params) => {
      const slug = params.get('slug');
      if (!slug) return;

      this.loading.set(true);
      this.error.set(null);

      // The profile and the range come from different places on purpose: the
      // range goes through the catalogue search so it is priced by tier and
      // stays consistent with every other listing.
      Promise.all([this.suppliers.one(slug), this.catalog.searchOnce({ supplier: slug })])
        .then(([detail, listing]) => {
          this.supplier.set(detail.supplier);
          this.results.set(listing);
          this.products.set(listing.products);
          this.loading.set(false);
        })
        .catch((err) => {
          this.error.set(
            err?.status === 404 ? 'We have no supplier by that name.' : 'Could not load that supplier.'
          );
          this.loading.set(false);
        });
    });
  }

  protected badge(reliability: string): string {
    return RELIABILITY_STYLE[reliability] ?? RELIABILITY_STYLE['standard'];
  }
}
