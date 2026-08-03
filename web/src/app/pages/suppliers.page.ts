import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SuppliersService, type SupplierSummary } from '../core/suppliers.service';
import { SupplierRating } from '../core/supplier-rating';

const RELIABILITY_STYLE: Record<string, string> = {
  official: 'border-stock text-stock',
  reliable: 'border-signal text-signal',
  standard: 'border-ink-line text-mute',
};

@Component({
  selector: 'app-suppliers',
  imports: [RouterLink, SupplierRating],
  template: `
    <div class="max-w-5xl mx-auto px-6 py-10">
      <h1 class="font-display text-2xl font-bold mb-1">Suppliers</h1>
      <p class="text-sm text-mute mb-8 max-w-2xl">
        Everyone we buy from. Open a supplier to see the brands they carry and browse
        their range on its own, priced for your account.
      </p>

      @if (error()) {
        <div class="border border-alert/40 bg-alert/10 rounded-plate p-4 text-sm text-alert">{{ error() }}</div>
      } @else if (loading()) {
        <div class="grid gap-3">
          @for (n of [0, 1, 2]; track n) {
            <div class="border border-ink-line rounded-plate bg-ink-panel h-28 animate-pulse"></div>
          }
        </div>
      } @else {
        <div class="grid gap-3">
          @for (s of suppliers(); track s.id) {
            <a [routerLink]="['/supplier', s.slug]"
               class="border border-ink-line rounded-plate bg-ink-panel hover:border-signal/50 transition-colors p-5 block">
              <div class="flex flex-wrap items-baseline gap-3">
                <span class="font-display font-bold">{{ s.name }}</span>
                <span class="font-mono text-[10px] uppercase px-2 py-0.5 rounded-plate border"
                      [class]="badge(s.reliability)">{{ s.reliability }}</span>
                <app-supplier-rating class="text-xs" [rating]="s.rating" [name]="s.name" />
                <span class="ml-auto text-xs text-mute font-mono">{{ s.productCount }} parts</span>
              </div>
              @if (s.description) {
                <p class="text-sm text-mute mt-2">{{ s.description }}</p>
              }
            </a>
          }
        </div>
      }
    </div>
  `,
})
export class SuppliersPage {
  private readonly suppliers_ = inject(SuppliersService);

  protected readonly suppliers = signal<SupplierSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.suppliers_
      .all()
      .then((res) => {
        this.suppliers.set(res.suppliers);
        this.loading.set(false);
      })
      .catch(() => {
        this.error.set('Could not load suppliers.');
        this.loading.set(false);
      });
  }

  protected badge(reliability: string): string {
    return RELIABILITY_STYLE[reliability] ?? RELIABILITY_STYLE['standard'];
  }
}
