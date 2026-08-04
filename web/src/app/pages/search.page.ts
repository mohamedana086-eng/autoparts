import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CatalogService } from '../core/catalog.service';
import { SupplierRating } from '../core/supplier-rating';
import type { MatchIn, SearchResponse, SearchSort } from '../core/api.models';

const SORT_LABELS: Array<{ value: SearchSort; label: string }> = [
  { value: 'relevance', label: 'Best match' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'delivery', label: 'Fastest delivery' },
];

@Component({
  selector: 'app-search',
  imports: [RouterLink, SupplierRating],
  template: `
    <div class="max-w-7xl mx-auto px-6 py-8">
      <div class="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-4">
        <h1 class="font-display text-2xl font-bold">
          @if (query()) {
            Results for <span class="font-mono text-signal">{{ query() }}</span>
          } @else {
            {{ data()?.systemName ?? 'All parts' }}
          }
        </h1>
        <p class="text-xs text-mute">
          Got a whole list?
          <a routerLink="/bulk" class="link-signal">Check a spreadsheet of part numbers</a>.
        </p>
      </div>

      @if (data()?.variantLabel; as vehicle) {
        <div class="note note-signal flex flex-wrap items-center gap-3 mb-3">
          <span>Showing only parts that fit <span class="font-medium text-paper">{{ vehicle }}</span></span>
          <button type="button" (click)="clearVehicle()" class="text-xs link-signal ml-auto">
            Show all vehicles
          </button>
        </div>
      }

      @if (data()?.supplierName; as supplierName) {
        <div class="note note-quiet flex flex-wrap items-center gap-3 mb-3">
          <span>
            Only parts from
            <a [routerLink]="['/supplier', data()!.supplier]" class="link-signal">{{ supplierName }}</a>
          </span>
          <button type="button" (click)="clearSupplier()" class="text-xs link-signal ml-auto">
            Show all suppliers
          </button>
        </div>
      }

      @if (data()?.fuzzy) {
        <p class="note note-signal mb-3">
          Nothing matches <span class="font-mono">{{ query() }}</span> exactly — these are the
          closest parts we carry.
        </p>
      }

      <!-- Two columns from lg up. Below that the filters collapse behind a
           toggle rather than stacking eight blocks above the results, which
           is what pushed the first result off the first screen. -->
      <div class="grid lg:grid-cols-[232px_1fr] gap-x-8 gap-y-4 items-start">
        <button type="button" (click)="filtersOpen.set(!filtersOpen())"
                [attr.aria-expanded]="filtersOpen()"
                class="lg:hidden panel px-3 py-2 text-xs text-left flex items-center justify-between">
          <span class="eyebrow">Filters</span>
          <span class="text-mute">{{ filtersOpen() ? 'Hide' : 'Show' }}</span>
        </button>

        <!-- Sticky alone is not enough: the filters run taller than the
             viewport on a broad query, and a stuck element with no scroll of
             its own simply cuts the last group off with no way to reach it.
             It gets its own scroll, bounded to the space between its top
             offset and the bottom of the screen. overscroll-contain stops a
             scroll that reaches the end of the list from carrying on into the
             results behind it. -->
        <aside class="lg:block lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto lg:overscroll-contain lg:pr-1"
               [class.hidden]="!filtersOpen()">
          @if (data()) {
            @if (data()!.facets.systems.length > 1 || data()!.system) {
              <div class="filter-group">
                <p class="eyebrow mb-2">System</p>
                <div class="flex flex-wrap gap-1.5">
                  <button type="button" (click)="setSystem(null)" class="chip"
                          [class.chip-on]="!data()!.system" [class.chip-idle]="!!data()!.system">All</button>
                  @for (s of data()!.facets.systems; track s.slug) {
                    <button type="button" (click)="setSystem(s.slug)" class="chip"
                            [class.chip-on]="data()!.system === s.slug"
                            [class.chip-idle]="data()!.system !== s.slug">
                      {{ s.name }} <span class="chip-count">{{ s.count }}</span>
                    </button>
                  }
                </div>
              </div>
            }

            <!-- All three options on every query. They are options a customer
                 picks, not facets that come and go: a zero on "OEM numbers"
                 answers whether the number typed is an OE one, which a hidden
                 chip does not. Any combination can be selected. -->
            @if (data()!.facets.matchIn.length > 0) {
              <div class="filter-group">
                <p class="eyebrow mb-2">Search in</p>
                <div class="flex flex-wrap gap-1.5">
                  <button type="button" (click)="clearMatchIn()"
                          [attr.aria-pressed]="data()!.matchIn.length === 0" class="chip"
                          [class.chip-on]="data()!.matchIn.length === 0"
                          [class.chip-idle]="data()!.matchIn.length > 0">Everything</button>
                  @for (m of data()!.facets.matchIn; track m.name) {
                    <button type="button" (click)="toggleMatchIn(m.name)"
                            [attr.aria-pressed]="isMatchInSelected(m.name)" class="chip"
                            [class.chip-on]="isMatchInSelected(m.name)"
                            [class.chip-idle]="!isMatchInSelected(m.name)"
                            [class.opacity-50]="m.count === 0 && !isMatchInSelected(m.name)">
                      {{ matchInLabel(m.name) }} <span class="chip-count">{{ m.count }}</span>
                    </button>
                  }
                </div>
                @if (data()!.matchIn.length > 0) {
                  <p class="text-[11px] text-mute mt-2">
                    Only parts found by {{ selectedMatchInPhrase() }} — results matched on a
                    name are excluded.
                  </p>
                }
              </div>
            }

            @if (data()!.facets.manufacturers.length > 1 || data()!.manufacturer) {
              <div class="filter-group">
                <p class="eyebrow mb-2">Brand</p>
                <div class="flex flex-wrap gap-1.5">
                  <button type="button" (click)="setBrand(null)" class="chip"
                          [class.chip-on]="!data()!.manufacturer"
                          [class.chip-idle]="!!data()!.manufacturer">All</button>
                  @for (b of data()!.facets.manufacturers; track b.name) {
                    <button type="button" (click)="setBrand(b.name)" class="chip"
                            [class.chip-on]="data()!.manufacturer === b.name"
                            [class.chip-idle]="data()!.manufacturer !== b.name">
                      {{ b.name }} <span class="chip-count">{{ b.count }}</span>
                    </button>
                  }
                </div>
              </div>
            }

            @if (data()!.facets.reliabilities.length > 1 || showReturnsChip()) {
              <div class="filter-group">
                <p class="eyebrow mb-2">Supplier</p>
                <div class="flex flex-wrap gap-1.5">
                  <button type="button" (click)="setReliability(null)" class="chip"
                          [class.chip-on]="!data()!.reliability"
                          [class.chip-idle]="!!data()!.reliability">Any</button>
                  @for (r of data()!.facets.reliabilities; track r.name) {
                    <button type="button" (click)="setReliability(r.name)" class="chip capitalize"
                            [class.chip-on]="data()!.reliability === r.name"
                            [class.chip-idle]="data()!.reliability !== r.name">
                      {{ r.name }} <span class="chip-count">{{ r.count }}</span>
                    </button>
                  }
                  @if (showReturnsChip()) {
                    <button type="button" (click)="toggleReturns()"
                            [attr.aria-pressed]="data()!.returns" class="chip"
                            [class.chip-on]="data()!.returns" [class.chip-idle]="!data()!.returns">
                      Returns accepted <span class="chip-count">{{ data()!.facets.returns }}</span>
                    </button>
                  }
                </div>
              </div>
            }

            @if (ratingThresholds().length > 0) {
              <div class="filter-group">
                <p class="eyebrow mb-2">Supplier rating</p>
                <div class="flex flex-wrap gap-1.5">
                  <button type="button" (click)="setMinRating(null)" class="chip"
                          [class.chip-on]="!data()!.minRating"
                          [class.chip-idle]="!!data()!.minRating">Any</button>
                  @for (t of ratingThresholds(); track t.min) {
                    <button type="button" (click)="setMinRating(t.min)" class="chip"
                            [class.chip-on]="data()!.minRating === t.min"
                            [class.chip-idle]="data()!.minRating !== t.min">
                      {{ t.min }}★{{ t.min < 5 ? '+' : '' }}
                      <span class="chip-count">{{ t.count }}</span>
                    </button>
                  }
                </div>
                @if (unratedCount() > 0) {
                  <p class="text-[11px] text-mute mt-2">
                    {{ unratedCount() }} from suppliers we have not rated
                  </p>
                }
              </div>
            }

            @if (data()!.priceRange; as range) {
              <div class="filter-group">
                <p class="eyebrow mb-2">Price</p>
                <div class="flex items-center gap-2">
                  <input type="number" inputmode="decimal" min="0" [value]="minPrice()"
                         (input)="minPrice.set($any($event.target).value)" (change)="applyPrice()"
                         [attr.placeholder]="'€' + range.min" aria-label="Minimum price"
                         class="field-sm w-full font-mono" />
                  <span class="text-xs text-mute">to</span>
                  <input type="number" inputmode="decimal" min="0" [value]="maxPrice()"
                         (input)="maxPrice.set($any($event.target).value)" (change)="applyPrice()"
                         [attr.placeholder]="'€' + range.max" aria-label="Maximum price"
                         class="field-sm w-full font-mono" />
                </div>
                @if (data()!.minPrice !== null || data()!.maxPrice !== null) {
                  <button type="button" (click)="clearPrice()" class="text-[11px] link-signal mt-2">
                    Clear price
                  </button>
                }
              </div>
            }
          }
        </aside>

        <section>
          <div class="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4">
            @if (data()) {
              <span class="text-xs text-mute font-mono">{{ data()!.count }} found</span>
            }
            <p class="text-xs text-mute">
              @if (data()?.isLoggedIn) {
                Prices at your <span class="text-paper">{{ data()!.tierName }}</span> tier.
              } @else {
                Prices at Retail tier ·
                <a routerLink="/login" class="link-signal">sign in</a> for your account's price.
              }
            </p>
            @if (data()) {
              <label class="ml-auto flex items-center gap-2 eyebrow">
                Sort
                <select [value]="data()!.sort" (change)="setSort($any($event.target).value)"
                        class="field-sm normal-case tracking-normal">
                  @for (s of sorts; track s.value) {
                    <option [value]="s.value">{{ s.label }}</option>
                  }
                </select>
              </label>
            }
          </div>

          @if (error()) {
            <div class="note note-alert p-4">{{ error() }}</div>
          } @else if (loading()) {
            <div class="grid gap-3">
              @for (n of skeletons; track n) {
                <div class="panel h-[104px] animate-pulse"></div>
              }
            </div>
          } @else {
            <div class="grid gap-3">
              @for (p of data()!.products; track p.id) {
                <a [routerLink]="['/product', p.id]"
                   class="panel hover:border-signal/50 transition-colors p-4 grid grid-cols-1 md:grid-cols-[auto_1fr_auto] gap-4 items-center">
                  <div class="plate relative rounded-plate px-4 py-2 w-fit">
                    <p class="text-[9px] text-mute uppercase tracking-wider">{{ p.manufacturer }}</p>
                    <p class="font-mono font-semibold text-sm">{{ p.partNumber }}</p>
                  </div>

                  <div>
                    <p class="font-medium">{{ p.name }}</p>
                    <p class="text-xs text-mute mt-1">{{ p.system }}</p>

                    @if (p.matchedVia && p.matchedOn === 'interchange-oem') {
                      <p class="text-[11px] text-signal mt-1.5">
                        Replaces OE number
                        <span class="font-mono">{{ p.matchedVia }}</span>
                        @if (p.matchedViaManufacturer) {
                          <span class="text-mute">&nbsp;· {{ p.matchedViaManufacturer }}</span>
                        }
                      </p>
                    } @else if (p.matchedVia && p.matchedOn === 'interchange-aftermarket') {
                      <p class="text-[11px] text-signal mt-1.5">
                        Replaces <span class="font-mono">{{ p.matchedVia }}</span>
                        @if (p.matchedViaManufacturer) {
                          <span class="text-mute">&nbsp;· {{ p.matchedViaManufacturer }}</span>
                        }
                      </p>
                    }

                    <div class="flex flex-wrap items-center gap-3 mt-2 text-xs text-mute">
                      <span>{{ p.stockDays }} day{{ p.stockDays === 1 ? '' : 's' }} delivery</span>
                      <span class="text-stock">In stock</span>
                      @if (p.supplier; as supplier) {
                        <app-supplier-rating
                          [rating]="supplier.rating"
                          [name]="supplier.name"
                          [showUnrated]="false"
                          [attr.title]="supplier.name + (supplier.rating ? ' rated ' + supplier.rating + ' out of 5' : '')" />
                        @if (supplier.acceptsReturns === true) {
                          <span class="text-stock">Returns accepted</span>
                        }
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
                  @if (data()!.matchIn.length) {
                    "{{ query() }}" is not among our {{ selectedMatchInPhrase() }}.
                    <button type="button" (click)="clearMatchIn()" class="link-signal">Search everything</button>
                  } @else if (data()!.manufacturer) {
                    Nothing from {{ data()!.manufacturer }} here.
                    <button type="button" (click)="setBrand(null)" class="link-signal">Show all brands</button>
                  } @else if (query()) {
                    No parts match "{{ query() }}". Part numbers can be typed with or without
                    spaces and dots, and you can search by brand or by a number the part replaces.
                  } @else if (data()!.systemName) {
                    Nothing in {{ data()!.systemName }} yet.
                    <a routerLink="/" class="link-signal">Browse another system</a>
                    or search by part number.
                  } @else {
                    The catalog is empty.
                  }
                </div>
              }
            </div>
          }
        </section>
      </div>
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

  /** Only consulted below `lg`, where the sidebar collapses behind a toggle. */
  protected readonly filtersOpen = signal(false);

  /**
   * How many results the supplier facets were counted over — every product in
   * the current system, before any supplier filter narrowed it. The rating
   * facet buckets every product exactly once, unrated included, so summing it
   * gives that total without the API having to send it separately.
   */
  private readonly facetTotal = computed(() =>
    (this.data()?.facets.supplierRatings ?? []).reduce((sum, f) => sum + f.count, 0)
  );

  /**
   * Whether "Returns accepted" is worth offering. Hidden when every result
   * already comes from a supplier who takes stock back, for the same reason
   * the rating thresholds are: a chip that selects the whole page is not a
   * filter, it is furniture.
   */
  protected readonly showReturnsChip = computed(() => {
    const returns = this.data()?.facets.returns ?? 0;
    return returns > 0 && returns < this.facetTotal();
  });

  protected readonly ratingThresholds = computed(() => {
    const facets = this.data()?.facets.supplierRatings ?? [];
    const total = this.facetTotal();

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
          reliability: params.get('reliability'),
          returns: params.get('returns'),
          matchIn: params.get('matchIn'),
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

  protected setReliability(name: string | null): void {
    this.merge({ reliability: name });
  }

  protected isMatchInSelected(name: MatchIn): boolean {
    return this.data()?.matchIn.includes(name) === true;
  }

  /**
   * Adds or removes one option. Turning the last one off is the same as
   * "Everything", so the parameter is dropped rather than left empty — an
   * empty `matchIn=` in the url would be a filter that filters nothing.
   */
  protected toggleMatchIn(name: MatchIn): void {
    const current = this.data()?.matchIn ?? [];
    const next = current.includes(name)
      ? current.filter((m) => m !== name)
      : [...current, name];

    this.merge({ matchIn: next.length ? next.join(',') : null });
  }

  protected clearMatchIn(): void {
    this.merge({ matchIn: null });
  }

  /** "OEM numbers", "part numbers and OEM numbers", "a, b or c". */
  protected selectedMatchInPhrase(): string {
    const parts = (this.data()?.matchIn ?? []).map((m) => this.matchInPhrase(m));
    if (parts.length <= 1) return parts[0] ?? '';
    return `${parts.slice(0, -1).join(', ')} or ${parts[parts.length - 1]}`;
  }

  protected matchInLabel(name: MatchIn): string {
    switch (name) {
      case 'part-number':
        return 'Part numbers';
      case 'oem':
        return 'OEM numbers';
      case 'aftermarket':
        return 'Aftermarket interchanges';
    }
  }

  /** Mid-sentence form. Not the label lowercased — that would write "oem". */
  protected matchInPhrase(name: MatchIn): string {
    switch (name) {
      case 'part-number':
        return 'part numbers';
      case 'oem':
        return 'OEM numbers';
      case 'aftermarket':
        return 'aftermarket interchanges';
    }
  }

  /** Only ever set to `true` or dropped — "returns=false" would read as
   *  "suppliers who refuse returns", which is not what the chip offers. */
  protected toggleReturns(): void {
    this.merge({ returns: this.data()?.returns ? null : 'true' });
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
