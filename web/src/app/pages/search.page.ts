import { Component, computed, inject, signal } from '@angular/core';
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

      @if (data()?.variantLabel; as vehicle) {
        <div class="flex flex-wrap items-center gap-3 border border-signal/30 bg-signal/10 rounded-plate px-3 py-2 mb-3">
          <span class="text-sm">
            Showing only parts that fit
            <span class="font-medium text-paper">{{ vehicle }}</span>
          </span>
          <button type="button" (click)="clearVehicle()"
                  class="text-xs text-signal hover:underline ml-auto">Show all vehicles</button>
        </div>
      }

      @if (data()?.supplierName; as supplierName) {
        <div class="flex flex-wrap items-center gap-3 border border-ink-line rounded-plate px-3 py-2 mb-3">
          <span class="text-sm">
            Only parts from
            <a [routerLink]="['/supplier', data()!.supplier]" class="text-signal hover:underline">{{ supplierName }}</a>
          </span>
          <button type="button" (click)="clearSupplier()"
                  class="text-xs text-signal hover:underline ml-auto">Show all suppliers</button>
        </div>
      }

      <p class="text-xs text-mute mb-3">
        Got a whole list?
        <a routerLink="/bulk" class="text-signal hover:underline">Check a spreadsheet of part numbers</a>.
      </p>

      @if (data()?.fuzzy) {
        <p class="text-sm border border-signal/30 bg-signal/10 rounded-plate px-3 py-2 mb-4">
          Nothing matches <span class="font-mono">{{ query() }}</span> exactly — these are the
          closest parts we carry.
        </p>
      }

      <p class="text-xs text-mute mb-6">
        @if (data()?.isLoggedIn) {
          Prices shown at your <span class="text-paper">{{ data()!.tierName }}</span> tier.
        } @else {
          Prices shown at Retail tier ·
          <a routerLink="/login" class="text-signal hover:underline">sign in</a> to see your account's price.
        }
      </p>

      @if (data() && (data()!.facets.systems.length > 1 || data()!.system)) {
        <div class="flex flex-wrap items-center gap-2 mb-3">
          <span class="text-[11px] uppercase tracking-wider text-mute mr-1">System</span>

          <button type="button" (click)="setSystem(null)"
                  class="text-xs px-2.5 py-1 rounded-plate border transition-colors"
                  [class]="!data()!.system ? activeChip : idleChip">
            All
          </button>

          @for (s of data()!.facets.systems; track s.slug) {
            <button type="button" (click)="setSystem(s.slug)"
                    class="text-xs px-2.5 py-1 rounded-plate border transition-colors"
                    [class]="data()!.system === s.slug ? activeChip : idleChip">
              {{ s.name }} <span class="font-mono text-[10px] opacity-70">{{ s.count }}</span>
            </button>
          }
        </div>
      }

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

      @if (ratingThresholds().length > 0) {
        <div class="flex flex-wrap items-center gap-2 mb-6">
          <span class="text-[11px] uppercase tracking-wider text-mute mr-1">Supplier rating</span>

          <button type="button" (click)="setMinRating(null)"
                  class="text-xs px-2.5 py-1 rounded-plate border transition-colors"
                  [class]="!data()!.minRating ? activeChip : idleChip">
            Any
          </button>

          @for (t of ratingThresholds(); track t.min) {
            <button type="button" (click)="setMinRating(t.min)"
                    class="text-xs px-2.5 py-1 rounded-plate border transition-colors"
                    [class]="data()!.minRating === t.min ? activeChip : idleChip">
              {{ t.min }}★{{ t.min < 5 ? '+' : '' }}
              <span class="font-mono text-[10px] opacity-70">{{ t.count }}</span>
            </button>
          }

          @if (unratedCount() > 0) {
            <span class="text-[11px] text-mute">
              {{ unratedCount() }} from suppliers we have not rated
            </span>
          }
        </div>
      }

      @if (data()?.priceRange; as range) {
        <div class="flex flex-wrap items-center gap-2 mb-6 text-[11px] uppercase tracking-wider text-mute">
          <span class="mr-1">Price</span>
          <input type="number" inputmode="decimal" min="0" [value]="minPrice()"
                 (input)="minPrice.set($any($event.target).value)" (change)="applyPrice()"
                 [attr.placeholder]="'€' + range.min" aria-label="Minimum price"
                 class="w-20 bg-ink-panel border border-ink-line rounded-plate px-2 py-1 text-xs text-paper font-mono normal-case" />
          <span class="normal-case">to</span>
          <input type="number" inputmode="decimal" min="0" [value]="maxPrice()"
                 (input)="maxPrice.set($any($event.target).value)" (change)="applyPrice()"
                 [attr.placeholder]="'€' + range.max" aria-label="Maximum price"
                 class="w-20 bg-ink-panel border border-ink-line rounded-plate px-2 py-1 text-xs text-paper font-mono normal-case" />
          @if (data()!.minPrice !== null || data()!.maxPrice !== null) {
            <button type="button" (click)="clearPrice()"
                    class="text-signal hover:underline normal-case tracking-normal">Clear</button>
          }
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

                <div class="flex flex-wrap items-center gap-3 mt-2 text-xs text-mute">
                  <span>{{ p.stockDays }} day{{ p.stockDays === 1 ? '' : 's' }} delivery</span>
                  <span class="text-stock">In stock</span>
                  @if (p.supplier?.rating; as rating) {
                    <span class="flex items-center gap-1"
                          [attr.title]="p.supplier!.name + ' rated ' + rating + ' out of 5'">
                      <span class="text-signal" aria-hidden="true">{{ filledStars(rating) }}</span>
                      <span class="sr-only">{{ p.supplier!.name }} rated {{ rating }} out of 5</span>
                    </span>
                  }
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
  protected readonly minPrice = signal('');
  protected readonly maxPrice = signal('');

  protected readonly activeChip = 'border-signal bg-signal/10 text-paper';
  protected readonly idleChip = 'border-ink-line text-mute hover:text-paper';

  /**
   * "4★+", "5★" and what each would leave. The API counts per exact rating,
   * so a threshold is the sum of everything at or above it.
   *
   * Only thresholds that actually narrow the page are offered. With every
   * supplier rated 3 or better, "1★+" through "4★+" each select the whole
   * page, and four chips that do nothing are worse than none — so a
   * threshold is dropped when it matches nothing, when it selects everything
   * already shown, or when it selects exactly what the stricter threshold
   * above it did. Of several thresholds selecting the same set, the highest
   * is kept: it is the strongest claim that is true of it.
   */
  protected readonly ratingThresholds = computed(() => {
    const facets = this.data()?.facets.supplierRatings ?? [];
    const total = facets.reduce((sum, f) => sum + f.count, 0);

    const out: Array<{ min: number; count: number }> = [];
    let kept = -1;

    for (let min = 5; min >= 1; min--) {
      const count = facets
        .filter((f) => f.rating !== null && f.rating >= min)
        .reduce((sum, f) => sum + f.count, 0);

      if (count === 0 || count === total || count === kept) continue;

      out.push({ min, count });
      kept = count;
    }

    // Ascending reads better on the row: 4★+ 5★.
    return out.reverse();
  });

  protected readonly unratedCount = computed(
    () => this.data()?.facets.supplierRatings.find((f) => f.rating === null)?.count ?? 0
  );

  constructor() {
    // Re-runs whenever any of the query parameters change, so filtering and
    // sorting stay in the URL and survive a reload or a shared link.
    this.route.queryParamMap.subscribe((params) => {
      const q = params.get('q') ?? '';
      this.query.set(q);
      // Mirror the URL so the inputs survive a reload or a shared link.
      this.minPrice.set(params.get('minPrice') ?? '');
      this.maxPrice.set(params.get('maxPrice') ?? '');
      this.loading.set(true);
      this.error.set(null);

      this.catalog
        .search({
          q,
          system: params.get('system'),
          manufacturer: params.get('manufacturer'),
          variant: params.get('variant'),
          supplier: params.get('supplier'),
          minRating: params.get('minRating'),
          sort: params.get('sort'),
          minPrice: params.get('minPrice'),
          maxPrice: params.get('maxPrice'),
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

  /** Changing system drops the brand filter — the old brand often has nothing
   *  in the new system, which would otherwise land on an empty page. */
  protected setSystem(slug: string | null): void {
    this.merge({ system: slug, manufacturer: null });
  }

  protected setSort(sort: string): void {
    this.merge({ sort: sort === 'relevance' ? null : sort });
  }

  protected setMinRating(min: number | null): void {
    this.merge({ minRating: min === null ? null : String(min) });
  }

  protected filledStars(rating: number): string {
    return '★'.repeat(rating);
  }

  protected applyPrice(): void {
    this.merge({
      minPrice: this.minPrice().trim() || null,
      maxPrice: this.maxPrice().trim() || null,
    });
  }

  /** Drops the vehicle and the brand with it, since a brand chosen while a
   *  car was selected often has nothing across the rest of the catalogue. */
  protected clearVehicle(): void {
    this.merge({ variant: null, manufacturer: null });
  }

  protected clearSupplier(): void {
    this.merge({ supplier: null });
  }

  protected clearPrice(): void {
    this.minPrice.set('');
    this.maxPrice.set('');
    this.merge({ minPrice: null, maxPrice: null });
  }
}
