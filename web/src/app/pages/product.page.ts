import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CatalogService } from '../core/catalog.service';
import { CartService } from '../core/cart.service';
import { SupplierRating } from '../core/supplier-rating';
import type { ProductResponse } from '../core/api.models';

@Component({
  selector: 'app-product',
  imports: [RouterLink, SupplierRating],
  template: `
    @if (error()) {
      <div class="max-w-5xl mx-auto px-6 py-16 text-center">
        <p class="text-mute text-sm">{{ error() }}</p>
        <a routerLink="/" class="inline-block mt-4 link-signal text-sm">Back to the catalog</a>
      </div>
    } @else if (loading() || !data()) {
      <div class="max-w-5xl mx-auto px-6 py-10 grid md:grid-cols-[1.3fr_1fr] gap-10">
        <div class="h-64 panel animate-pulse"></div>
        <div class="h-64 panel animate-pulse"></div>
      </div>
    } @else {
      <div class="max-w-5xl mx-auto px-6 py-10 grid md:grid-cols-[1.3fr_1fr] gap-10">
        <div>
          <!-- Nothing at all when the part has no picture, rather than a large
               empty frame where one would be. Today that is every part. -->
          @if (usableImages().length > 0) {
            <div class="mb-6">
              <div class="panel rounded-plate overflow-hidden aspect-[4/3] flex items-center justify-center bg-ink-raised">
                <img [src]="selected().url" [alt]="selected().alt || product().name"
                     (error)="imageFailed(selected().url)" decoding="async"
                     class="w-full h-full object-contain" />
              </div>

              <!-- Only worth a strip when there is a choice to make. -->
              @if (usableImages().length > 1) {
                <div class="flex flex-wrap gap-2 mt-3">
                  @for (img of usableImages(); track img.url) {
                    <button type="button" (click)="selectedIndex.set($index)"
                            [attr.aria-label]="'Picture ' + ($index + 1) + ' of ' + usableImages().length"
                            [attr.aria-current]="$index === selectedIndex()"
                            class="w-14 h-14 rounded-plate overflow-hidden border transition-colors bg-ink-raised
                                   flex items-center justify-center"
                            [class]="$index === selectedIndex() ? 'border-signal' : 'border-ink-line hover:border-mute'">
                      <img [src]="img.url" [alt]="img.alt || product().name"
                           (error)="imageFailed(img.url)" loading="lazy" decoding="async"
                           class="w-full h-full object-contain" />
                    </button>
                  }
                </div>
              }
            </div>
          }

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
                    <span class="flex items-center gap-2">
                      @if (i.isOEM) {
                        <span class="text-[10px] text-signal uppercase font-mono">OE number</span>
                      }
                      @if (i.exactMatch) {
                        <span class="text-[10px] text-stock uppercase font-mono">exact match</span>
                      }
                    </span>
                  </div>
                }
              </div>
            } @else {
              <p class="text-xs text-mute">No cross-references on file for this part.</p>
            }
          </div>
        </div>

        <aside class="panel p-6 h-fit sticky top-24">
          <p class="text-xs text-mute uppercase tracking-widest mb-1">
            {{ data()!.isLoggedIn ? 'Your price (' + data()!.tierName + ')' : 'Price (Retail)' }}
          </p>
          <p class="font-mono text-3xl font-bold text-signal">€{{ product().price.toFixed(2) }}</p>
          @if (product().appliedRule) {
            <p class="text-[11px] text-mute mt-1">via {{ product().appliedRule }}</p>
          }
          @if (!data()!.isLoggedIn) {
            <p class="text-[11px] text-mute mt-1">
              <a routerLink="/login" class="link-signal">Sign in</a> to see your account's price.
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
                  class="w-full mt-6 btn-primary py-3">
            {{ added() ? 'Added to cart' : 'Add to cart' }}
          </button>

          @if (product().supplier; as supplier) {
            <p class="text-[11px] text-mute mt-4 flex flex-wrap items-baseline gap-1.5">
              <span>Supplied by</span>
              <a [routerLink]="['/supplier', supplier.slug]" class="link-signal">
                {{ supplier.name }}
              </a>
              <app-supplier-rating [rating]="supplier.rating" [name]="supplier.name" [showUnrated]="false" />
            </p>
          }

          <p class="text-[11px] text-mute mt-2">Fitment verified against OE reference</p>
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

  /**
   * Pictures whose url would not load.
   *
   * Kept by url rather than by index because dropping one shifts every index
   * after it, and the selection is an index. An admin can enter any http(s)
   * address and nothing can check it still resolves, so a dead link is an
   * ordinary outcome — the gallery simply carries on without it, and if that
   * was the last one the whole block disappears the way it does for a part
   * that never had a picture.
   */
  private readonly failedImages = signal<ReadonlySet<string>>(new Set());

  protected readonly usableImages = computed(() => {
    const failed = this.failedImages();
    return (this.data()?.product.images ?? []).filter((i) => !failed.has(i.url));
  });

  protected readonly selectedIndex = signal(0);

  /** The picture on show. Clamped, since a failure can shorten the list under
   *  a selection that was valid a moment ago. */
  protected readonly selected = computed(() => {
    const images = this.usableImages();
    return images[Math.min(this.selectedIndex(), images.length - 1)] ?? images[0];
  });

  protected imageFailed(url: string): void {
    this.failedImages.update((prev) => (prev.has(url) ? prev : new Set(prev).add(url)));
  }

  private resetTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      if (!id) return;
      this.loading.set(true);
      this.error.set(null);
      // A different part starts on its own first picture, and inherits none of
      // the previous one's dead links.
      this.selectedIndex.set(0);
      this.failedImages.set(new Set());

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
