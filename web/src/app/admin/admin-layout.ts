import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-admin-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <!-- minmax(0,1fr), not 1fr: a bare 1fr floors at the content's min-content
         width, so a wide table stretched this column past the page and the
         whole admin scrolled sideways while the table's own overflow-x
         wrapper sat unused. Allowing the column to shrink puts the scrolling
         back where it belongs — inside the table. -->
    <div class="max-w-7xl mx-auto px-6 py-8 grid md:grid-cols-[220px_minmax(0,1fr)] gap-8">
      <aside>
        <p class="font-display font-bold text-sm mb-4 text-mute uppercase tracking-widest">Admin panel</p>
        <nav class="grid gap-4">
          @for (section of visibleNav(); track section.heading) {
            <div class="grid gap-1">
              @if (section.heading) {
                <p class="eyebrow px-3 mb-0.5">{{ section.heading }}</p>
              }
              @for (item of section.items; track item.path) {
                <a [routerLink]="item.path" routerLinkActive="text-paper bg-ink-panel"
                   [routerLinkActiveOptions]="{ exact: item.exact }"
                   class="flex items-center gap-2.5 px-3 py-2 rounded-plate text-sm text-mute hover:text-paper hover:bg-ink-panel transition-colors">
                  {{ item.label }}
                </a>
              }
            </div>
          }
        </nav>
        <div class="mt-8 grid gap-1 text-xs text-mute">
          <p class="uppercase tracking-widest font-display font-bold mb-1">Reference</p>
          <a routerLink="/search" class="hover:text-paper transition-colors">Product catalog</a>
          <a routerLink="/admin/orders" class="hover:text-paper transition-colors">Orders</a>
        </div>
      </aside>
      <section><router-outlet /></section>
    </div>
  `,
})
export class AdminLayout {
  private readonly auth = inject(AuthService);

  /**
   * Grouped rather than one flat list. Seven unlabelled links gave no clue
   * which of them decided a price and which described the catalogue, and the
   * customer settings that arrived together read as unrelated entries.
   */
  private readonly nav = [
    { heading: '', adminOnly: false, items: [{ path: '/admin', label: 'Dashboard', exact: true }] },
    {
      heading: 'Catalogue',
      adminOnly: true,
      items: [
        { path: '/admin/products', label: 'Products', exact: false },
        { path: '/admin/suppliers', label: 'Suppliers', exact: false },
      ],
    },
    {
      heading: 'Customers',
      adminOnly: false,
      items: [
        { path: '/admin/clients', label: 'Customers', exact: false },
        { path: '/admin/client-categories', label: 'Categories & price lists', exact: false, adminOnly: true },
        { path: '/admin/currencies', label: 'Currencies', exact: false, adminOnly: true },
      ],
    },
    {
      heading: 'Pricing',
      adminOnly: true,
      items: [{ path: '/admin/markup-rules', label: 'Markup rules', exact: false }],
    },
    {
      heading: 'Sales',
      adminOnly: false,
      items: [{ path: '/admin/orders', label: 'Orders', exact: false }],
    },
  ];

  /**
   * What this account can actually use. Tidiness only — the API scopes and
   * refuses on its own, and a hidden link is not a permission. A SALES user
   * following a hidden url gets the same 403 either way.
   */
  protected readonly visibleNav = computed(() => {
    if (this.auth.isAdmin()) return this.nav;

    return this.nav
      .filter((section) => !section.adminOnly)
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => !('adminOnly' in item && item.adminOnly)),
      }))
      .filter((section) => section.items.length > 0);
  });
}
