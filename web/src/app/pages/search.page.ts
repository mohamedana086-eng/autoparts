import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CatalogService } from '../core/catalog.service';
import type { SearchResponse } from '../core/api.models';

@Component({
  selector: 'app-search',
  imports: [RouterLink],
  template: `
    <div class="max-w-7xl mx-auto px-6 py-10">
      <div class="flex items-baseline justify-between mb-1">
        <h1 class="font-display text-2xl font-bold">
          @if (query()) {
            Results for <span class="font-mono text-signal">{{ query() }}</span>
          } @else {
            {{ data()?.systemName ?? 'All parts' }}
          }
        </h1>
        @if (data()) {
          <span class="text-xs text-mute font-mono">{{ data()!.count }} found</span>
        }
      </div>

      <p class="text-xs text-mute mb-8">
        @if (data()?.isLoggedIn) {
          Prices shown at your <span class="text-paper">{{ data()!.tierName }}</span> tier.
        } @else {
          Prices shown at Retail tier ·
          <a routerLink="/login" class="text-signal hover:underline">sign in</a> to see your account's price.
        }
      </p>

      @if (error()) {
        <div class="border border-alert/40 bg-alert/10 rounded-plate p-4 text-sm text-alert">{{ error() }}</div>
      } @else if (loading()) {
        <div class="grid gap-3">
          @for (n of skeletons; track n) {
            <div class="border border-ink-line rounded-plate bg-ink-panel h-[104px] animate-pulse"></div>
          }
        </div>
      } @else {
        <div class="grid gap-3">
          @for (p of data()!.products; track p.id) {
            <a [routerLink]="['/product', p.id]"
               class="border border-ink-line rounded-plate bg-ink-panel hover:border-signal/50 transition-colors p-4 grid grid-cols-1 md:grid-cols-[auto_1fr_auto] gap-4 items-center">
              <div class="plate relative rounded-plate px-4 py-2 w-fit">
                <p class="text-[9px] text-mute uppercase tracking-wider">{{ p.manufacturer }}</p>
                <p class="font-mono font-semibold text-sm">{{ p.partNumber }}</p>
              </div>

              <div>
                <p class="font-medium">{{ p.name }}</p>
                <p class="text-xs text-mute mt-1">{{ p.system }}</p>
                <div class="flex items-center gap-3 mt-2 text-xs text-mute">
                  <span>{{ p.stockDays }} day{{ p.stockDays === 1 ? '' : 's' }} delivery</span>
                  <span class="text-stock">In stock</span>
                </div>
              </div>

              <div class="text-right">
                <p class="font-mono text-lg font-bold text-signal">€{{ p.price.toFixed(2) }}</p>
                @if (p.appliedRule) {
                  <p class="text-[10px] text-mute mt-0.5">{{ p.appliedRule }}</p>
                }
              </div>
            </a>
          }

          @if (data()!.products.length === 0) {
            <div class="border border-dashed border-ink-line rounded-plate p-10 text-center text-mute text-sm">
              @if (query()) {
                No parts match "{{ query() }}". Try a different part number or browse by system.
              } @else if (data()!.systemName) {
                Nothing in {{ data()!.systemName }} yet.
                <a routerLink="/" class="text-signal hover:underline">Browse another system</a>
                or search by part number.
              } @else {
                The catalog is empty.
              }
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class SearchPage {
  private readonly catalog = inject(CatalogService);
  private readonly route = inject(ActivatedRoute);

  protected readonly data = signal<SearchResponse | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly query = signal('');
  protected readonly skeletons = Array.from({ length: 3 }, (_, i) => i);

  constructor() {
    // Re-runs whenever q or system changes, so header searches update in place.
    this.route.queryParamMap.subscribe((params) => {
      const q = params.get('q') ?? '';
      const system = params.get('system');
      this.query.set(q);
      this.loading.set(true);
      this.error.set(null);

      this.catalog.search(q, system).subscribe({
        next: (res) => {
          this.data.set(res);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Could not reach the catalog API.');
          this.loading.set(false);
        },
      });
    });
  }
}
