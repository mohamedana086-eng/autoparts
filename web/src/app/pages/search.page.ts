import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CatalogService } from '../core/catalog.service';
import type { SearchResponse, SearchSort } from '../core/api.models';

const SORT_LABELS: Array<{ value: SearchSort; label: string }> = [
  { value: 'relevance', label: 'Best match' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'delivery', label: 'Fastest delivery' },
];

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

      <p class="text-xs text-mute mb-6">
        @if (data()?.isLoggedIn) {
          Prices shown at your <span class="text-paper">{{ data()!.tierName }}</span> tier.
        } @else {
          Prices shown at Retail tier ·
          <a routerLink="/login" class="text-signal hover:underline">sign in</a> to see your account's price.
        }
      </p>

      @if (data() && (data()!.facets.manufacturers.length > 1 || data()!.manufacturer)) {
        <div class="flex flex-wrap items-center gap-2 mb-6">
          <span class="text-[11px] uppercase tracking-wider text-mute mr-1">Brand</span>

          <button type="button" (click)="setBrand(null)"
                  class="text-xs px-2.5 py-1 rounded-plate border transition-colors"
                  [class]="!data()!.manufacturer ? activeChip : idleChip">
            All
          </button>

          @for (b of data()!.facets.manufacturers; track b.name) {
            <button type="button" (click)="setBrand(b.name)"
                    class="text-xs px-2.5 py-1 rounded-plate border transition-colors"
                    [class]="data()!.manufacturer === b.name ? activeChip : idleChip">
              {{ b.name }} <span class="font-mono text-[10px] opacity-70">{{ b.count }}</span>
            </button>
          }

          <label class="ml-auto flex items-center gap-2 text-[11px] uppercase tracking-wider text-mute">
            Sort
            <select [value]="data()!.sort" (change)="setSort($any($event.target).value)"
                    class="bg-ink-panel border border-ink-line rounded-plate px-2 py-1 text-xs text-paper normal-case tracking-normal">
              @for (s of sorts; track s.value) {
                <option [value]="s.value">{{ s.label }}</option>
              }
            </select>
          </label>
        </div>
      }

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

                @if (p.matchedOn === 'interchange' && p.matchedVia) {
                  <p class="text-[11px] text-signal mt-1.5">
                    Replaces <span class="font-mono">{{ p.matchedVia }}</span>
                  </p>
                }

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
              @if (data()!.manufacturer) {
                Nothing from {{ data()!.manufacturer }} here.
                <button type="button" (click)="setBrand(null)" class="text-signal hover:underline">Show all brands</button>
              } @else if (query()) {
                No parts match "{{ query() }}". Part numbers can be typed with or without
                spaces and dots, and you can search by brand or by a number the part replaces.
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
  private readonly router = inject(Router);

  protected readonly data = signal<SearchResponse | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly query = signal('');
  protected readonly skeletons = Array.from({ length: 3 }, (_, i) => i);
  protected readonly sorts = SORT_LABELS;

  protected readonly activeChip = 'border-signal bg-signal/10 text-paper';
  protected readonly idleChip = 'border-ink-line text-mute hover:text-paper';

  constructor() {
    // Re-runs whenever any of the query parameters change, so filtering and
    // sorting stay in the URL and survive a reload or a shared link.
    this.route.queryParamMap.subscribe((params) => {
      const q = params.get('q') ?? '';
      this.query.set(q);
      this.loading.set(true);
      this.error.set(null);

      this.catalog
        .search({
          q,
          system: params.get('system'),
          manufacturer: params.get('manufacturer'),
          sort: params.get('sort'),
        })
        .subscribe({
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

  private merge(changes: Record<string, string | null>): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: changes,
      queryParamsHandling: 'merge',
    });
  }

  protected setBrand(name: string | null): void {
    this.merge({ manufacturer: name });
  }

  protected setSort(sort: string): void {
    this.merge({ sort: sort === 'relevance' ? null : sort });
  }
}
