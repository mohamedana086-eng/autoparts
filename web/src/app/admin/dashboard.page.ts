import { Component, inject, signal } from '@angular/core';
import { AdminService } from '../core/admin.service';
import type { AdminStats } from '../core/admin.models';

@Component({
  selector: 'app-admin-dashboard',
  template: `
    <h1 class="font-display text-2xl font-bold mb-6">Dashboard</h1>

    @if (error()) {
      <div class="border border-alert/40 bg-alert/10 rounded-plate p-4 text-sm text-alert">{{ error() }}</div>
    } @else {
      <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        @for (s of tiles(); track s.label) {
          <div class="border border-ink-line rounded-plate bg-ink-panel p-5">
            <p class="font-mono text-2xl font-bold">
              {{ stats() ? s.value : '—' }}
            </p>
            <p class="text-xs text-mute mt-1">{{ s.label }}</p>
          </div>
        }
      </div>
    }

    <div class="mt-10 border border-ink-line rounded-plate bg-ink-panel p-6">
      <h2 class="font-display font-semibold mb-2">How pricing resolves</h2>
      <p class="text-sm text-mute leading-relaxed">
        Every price shown to a client is computed at request time: the engine looks for the
        most specific active <strong class="text-paper">markup rule</strong> that matches the
        client's category, the supplier, manufacturer, vehicle system, part-number prefix, or
        purchase-price band. If nothing matches, it falls back to that client category's
        default markup percentage. See
        <code class="font-mono text-xs bg-ink-raised px-1.5 py-0.5 rounded">lib/pricing.ts</code>.
      </p>
    </div>
  `,
})
export class AdminDashboardPage {
  private readonly admin = inject(AdminService);

  protected readonly stats = signal<AdminStats | null>(null);
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.admin
      .stats()
      .then((s) => this.stats.set(s))
      .catch(() => this.error.set('Could not load dashboard figures.'));
  }

  protected tiles() {
    const s = this.stats();
    return [
      { label: 'Products', value: s?.products ?? 0 },
      { label: 'Clients', value: s?.clients ?? 0 },
      { label: 'Active markup rules', value: s?.activeRules ?? 0 },
      { label: 'Orders', value: s?.orders ?? 0 },
    ];
  }
}
