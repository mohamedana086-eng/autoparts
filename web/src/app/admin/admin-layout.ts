import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-admin-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <!-- minmax(0,1fr), not 1fr: a bare 1fr floors at the content's min-content
         width, so a wide table stretched this column past the page and the
         whole admin scrolled sideways while the table's own overflow-x
         wrapper sat unused. Allowing the column to shrink puts the scrolling
         back where it belongs — inside the table.

         It has to be said at every width, not just from md up. Below md the
         grid is a single column that nothing constrains, so the floor came
         back and twelve of the thirteen admin pages scrolled sideways on a
         phone — the products table alone is 920px wide. The min-w-0 on the
         section says the same thing a second way: a grid item defaults to
         min-width auto, which is the floor this is trying to remove. -->
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-6 md:py-8 grid grid-cols-[minmax(0,1fr)] md:grid-cols-[220px_minmax(0,1fr)] gap-4 md:gap-8">
      <!-- A disclosure on a phone, a plain sidebar from md up.

           Thirteen links in five headed groups is 817px of navigation, and
           stacked above the content it pushed the work of every admin page
           1.22 screens down the phone. Closed, it is one row naming where you
           already are; open, it is the same nav it has always been.

           A button and a signal rather than <details>, because <details> hides
           its own content in the user-agent stylesheet and there is no
           dependable way to tell it not to at md and up — the desktop sidebar
           would be at the mercy of whether someone had closed it on a phone
           first. Here the hidden / md:grid pair decides, so the width does. -->
      <aside class="min-w-0">
        <button type="button" (click)="menuOpen.set(!menuOpen())"
                [attr.aria-expanded]="menuOpen()" aria-controls="admin-nav"
                class="md:hidden w-full flex items-center justify-between gap-3 px-3 py-2.5
                       rounded-plate border border-ink-line bg-ink-panel text-left">
          <span class="min-w-0">
            <span class="block eyebrow">Admin panel</span>
            <span class="block text-sm text-paper truncate">{{ currentLabel() }}</span>
          </span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
               class="shrink-0 text-mute transition-transform" [class.rotate-180]="menuOpen()">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        <p class="hidden md:block font-display font-bold text-sm mb-4 text-mute uppercase tracking-widest">Admin panel</p>
        <!-- md:!grid, not md:!block: block would drop the gaps between the
             groups, which are what makes the headings read as headings. -->
        <nav id="admin-nav" class="grid gap-4 mt-3 md:mt-0 md:!grid"
             [class.hidden]="!menuOpen()">
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
        <div class="mt-8 grid gap-1 text-xs text-mute md:!grid" [class.hidden]="!menuOpen()">
          <p class="uppercase tracking-widest font-display font-bold mb-1">Reference</p>
          <a routerLink="/search" class="hover:text-paper transition-colors">Product catalog</a>
          <a routerLink="/admin/orders" class="hover:text-paper transition-colors">Orders</a>
        </div>
      </aside>
      <section class="min-w-0"><router-outlet /></section>
    </div>
  `,
})
export class AdminLayout {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Phone only — from md up the styles show the nav whatever this says. */
  protected readonly menuOpen = signal(false);

  /**
   * The current url, as a signal.
   *
   * Seeded with the url the layout was created on, because NavigationEnd has
   * already fired by then: a component that only listens would show no page
   * name until the admin navigated somewhere, which is every first load.
   */
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects)
    ),
    { initialValue: this.router.url }
  );

  /**
   * What the collapsed menu says you are looking at.
   *
   * Longest matching path wins, so /admin/client-categories is not read as
   * /admin. Falls back to the panel's own name rather than to an empty row.
   */
  protected readonly currentLabel = computed(() => {
    const path = this.url().split('?')[0];
    const items = this.visibleNav().flatMap((section) => section.items);

    const match = items
      .filter((item) => (item.exact ? path === item.path : path.startsWith(item.path)))
      .sort((a, b) => b.path.length - a.path.length)[0];

    return match?.label ?? 'Dashboard';
  });

  /** A link that has been followed has done its job; the menu gets out of the
   *  way rather than leaving the admin to close it before they can read the
   *  page they just asked for. */
  constructor() {
    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => this.menuOpen.set(false));
  }

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
      heading: 'Inventory',
      adminOnly: true,
      items: [
        { path: '/admin/warehouses', label: 'Warehouses', exact: false },
        { path: '/admin/outlets', label: 'Retail outlets', exact: false },
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
      items: [
        // Purchase price first: it is the number the markup rules multiply, so
        // the section reads in the order the engine works in.
        { path: '/admin/price-lists', label: 'Purchase price lists', exact: false },
        { path: '/admin/markup-rules', label: 'Markup rules', exact: false },
      ],
    },
    {
      heading: 'Sales',
      adminOnly: false,
      items: [
        { path: '/admin/orders', label: 'Orders', exact: false },
        // Scoped to a salesperson's own customers by the API, the same way the
        // customer list is, so it is not admin-only.
        { path: '/admin/carts', label: 'Open baskets', exact: false },
        { path: '/admin/notifications', label: 'Notifications', exact: false, adminOnly: true },
      ],
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
