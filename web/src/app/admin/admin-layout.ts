import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-admin-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="max-w-7xl mx-auto px-6 py-8 grid md:grid-cols-[220px_1fr] gap-8">
      <aside>
        <p class="font-display font-bold text-sm mb-4 text-mute uppercase tracking-widest">Admin panel</p>
        <nav class="grid gap-1">
          @for (item of nav; track item.path) {
            <a [routerLink]="item.path" routerLinkActive="text-paper bg-ink-panel"
               [routerLinkActiveOptions]="{ exact: item.exact }"
               class="flex items-center gap-2.5 px-3 py-2 rounded-plate text-sm text-mute hover:text-paper hover:bg-ink-panel transition-colors">
              {{ item.label }}
            </a>
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
  protected readonly nav = [
    { path: '/admin', label: 'Dashboard', exact: true },
    { path: '/admin/clients', label: 'Clients', exact: false },
    { path: '/admin/client-categories', label: 'Client categories', exact: false },
    { path: '/admin/markup-rules', label: 'Markup rules', exact: false },
    { path: '/admin/orders', label: 'Orders', exact: false },
  ];
}
