import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-site-footer',
  imports: [RouterLink],
  template: `
    <footer class="border-t border-ink-line mt-16">
      <div class="max-w-7xl mx-auto px-6 py-8 flex flex-col sm:flex-row justify-between gap-4 text-xs text-mute">
        <p>© {{ year }} AutoParts Hub. Prices shown are resolved per your account's pricing tier.</p>
        <nav class="flex gap-4">
          <a routerLink="/suppliers" class="hover:text-paper transition-colors">Suppliers</a>
          <a routerLink="/bulk" class="hover:text-paper transition-colors">Bulk lookup</a>
        </nav>
      </div>
    </footer>
  `,
})
export class SiteFooter {
  protected readonly year = new Date().getFullYear();
}
