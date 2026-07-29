import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CatalogService } from '../core/catalog.service';
import { SystemIcon } from '../shell/system-icon';
import type { VehicleSystem } from '../core/api.models';

@Component({
  selector: 'app-home',
  imports: [RouterLink, SystemIcon],
  template: `
    <section class="hatch border-b border-ink-line">
      <div class="max-w-7xl mx-auto px-6 py-16 grid md:grid-cols-[1.2fr_1fr] gap-10 items-center">
        <div>
          <span class="font-mono text-xs text-signal tracking-widest uppercase">Part search · 40M+ references</span>
          <h1 class="font-display text-4xl md:text-5xl font-bold leading-[1.05] mt-3">
            Find the exact part.<br />Priced for your account.
          </h1>
          <p class="text-mute mt-4 max-w-md">
            Search any OE or aftermarket part number and see live stock, delivery time,
            and a price resolved automatically for your client tier.
          </p>
          <form class="mt-6 flex max-w-md" (submit)="search($event)">
            <input [value]="term()" (input)="term.set($any($event.target).value)"
                   placeholder="e.g. 17138616418" aria-label="Search parts"
                   class="flex-1 bg-ink-panel border border-ink-line rounded-l-plate px-4 py-3 font-mono text-sm placeholder:font-body placeholder:text-mute focus:outline-none focus:ring-1 focus:ring-signal" />
            <button type="submit"
                    class="bg-signal hover:bg-signal-dim text-ink font-display font-bold px-6 rounded-r-plate transition-colors">
              Search
            </button>
          </form>
          <p class="text-xs text-mute mt-3">
            Buying for a workshop?
            <a routerLink="/bulk" class="text-signal hover:underline">Check a whole spreadsheet at once</a>.
          </p>
        </div>

        <div class="relative border border-ink-line rounded-plate bg-ink-panel p-5">
          <p class="text-xs font-mono text-mute mb-3 uppercase tracking-widest">Sample lookup</p>
          <div class="plate relative rounded-plate px-4 py-3 mb-3">
            <p class="text-[10px] text-mute uppercase tracking-wider">Part number</p>
            <p class="font-mono text-lg font-semibold">17138616418</p>
          </div>
          <div class="grid grid-cols-3 gap-3 text-center">
            <div class="border border-ink-line rounded-plate py-3">
              <p class="text-[10px] text-mute uppercase">Your price</p>
              <p class="font-mono font-semibold text-signal">€70.82</p>
            </div>
            <div class="border border-ink-line rounded-plate py-3">
              <p class="text-[10px] text-mute uppercase">Delivery</p>
              <p class="font-mono font-semibold">8 days</p>
            </div>
            <div class="border border-ink-line rounded-plate py-3">
              <p class="text-[10px] text-mute uppercase">Stock</p>
              <p class="font-mono font-semibold text-stock">In stock</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="max-w-7xl mx-auto px-6 py-14">
      <div class="flex items-baseline justify-between mb-6">
        <h2 class="font-display text-xl font-bold">Browse by system</h2>
        @if (systems().length) {
          <span class="text-xs text-mute font-mono">{{ systems().length }} categories</span>
        }
      </div>

      @if (error()) {
        <div class="border border-alert/40 bg-alert/10 rounded-plate p-4 text-sm text-alert">{{ error() }}</div>
      } @else if (loading()) {
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          @for (n of skeletons; track n) {
            <div class="border border-ink-line rounded-plate bg-ink-panel h-[86px] animate-pulse"></div>
          }
        </div>
      } @else {
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          @for (s of systems(); track s.id) {
            <a [routerLink]="['/search']" [queryParams]="{ system: s.slug }"
               class="group border border-ink-line rounded-plate bg-ink-panel hover:border-signal/60 hover:bg-ink-raised transition-colors p-4 flex flex-col items-center text-center gap-2">
              <app-system-icon [name]="s.icon"
                               class="text-mute group-hover:text-signal transition-colors" />
              <span class="text-xs font-medium leading-tight">{{ s.name }}</span>
            </a>
          }
        </div>
      }
    </section>

    <section class="border-t border-ink-line bg-ink-panel/40">
      <div class="max-w-7xl mx-auto px-6 py-10 grid sm:grid-cols-3 gap-8">
        @for (f of features; track f.title) {
          <div class="flex gap-3">
            <span class="w-[6px] h-[6px] rounded-full bg-signal shrink-0 mt-2"></span>
            <div>
              <p class="font-display font-semibold text-sm">{{ f.title }}</p>
              <p class="text-xs text-mute mt-1">{{ f.body }}</p>
            </div>
          </div>
        }
      </div>
    </section>
  `,
})
export class HomePage {
  private readonly catalog = inject(CatalogService);
  private readonly router = inject(Router);

  protected readonly systems = signal<VehicleSystem[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly term = signal('');
  protected readonly skeletons = Array.from({ length: 12 }, (_, i) => i);

  protected readonly features = [
    { title: 'Fast delivery', body: 'Live lead times from every supplier, per part.' },
    { title: 'Verified fitment', body: 'Interchange data cross-checked against OE numbers.' },
    { title: 'Tier pricing', body: "Every account sees its own negotiated markup automatically." },
  ];

  constructor() {
    this.catalog.systems().subscribe({
      next: (res) => {
        this.systems.set(res.systems);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load the catalog. Is the API running?');
        this.loading.set(false);
      },
    });
  }

  protected search(event: Event): void {
    event.preventDefault();
    this.router.navigate(['/search'], { queryParams: { q: this.term().trim() || null } });
  }
}
