import { Component, inject, signal } from '@angular/core';
import { AdminService } from '../core/admin.service';
import type { AdminStats } from '../core/admin.models';

@Component({
  selector: 'app-admin-dashboard',
  template: `
    <h1 class="font-display text-2xl font-bold mb-6">Dashboard</h1>

    @if (error()) {
      <div class="note note-alert p-4">{{ error() }}</div>
    } @else {
      <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        @for (s of tiles(); track s.label) {
          <div class="panel p-5">
            <p class="font-mono text-2xl font-bold">
              {{ stats() ? s.value : '—' }}
            </p>
            <p class="text-xs text-mute mt-1">{{ s.label }}</p>
          </div>
        }
      </div>
    }

    <div class="mt-10 panel p-6">
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

  /**
   * The figures, labelled for whoever is reading them.
   *
   * A salesperson's counts cover their own accounts, so calling them "Clients"
   * and "Orders" would read as the whole business and be wrong by a wide
   * margin. The markup-rule tile is dropped entirely rather than zeroed —
   * pricing is admin-only, and a zero would say something false.
   */
  protected tiles() {
    const s = this.stats();
    const own = s?.scope === 'own';

    const tiles = [
      { label: 'Products in the catalogue', value: s?.products ?? 0 },
      { label: own ? 'Your customers' : 'Clients', value: s?.clients ?? 0 },
      { label: own ? 'Orders from your customers' : 'Orders', value: s?.orders ?? 0 },
    ];

    if (s?.activeRules != null) {
      tiles.splice(2, 0, { label: 'Active markup rules', value: s.activeRules });
    }

    return tiles;
  }
}
