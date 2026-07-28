import { Component } from '@angular/core';

@Component({
  selector: 'app-site-footer',
  template: `
    <footer class="border-t border-ink-line mt-16">
      <div class="max-w-7xl mx-auto px-6 py-8 flex flex-col sm:flex-row justify-between gap-4 text-xs text-mute">
        <p>© {{ year }} AutoParts Hub. Prices shown are resolved per your account's pricing tier.</p>
        <p class="font-mono">Catalog data synced hourly · TecDoc-compatible</p>
      </div>
    </footer>
  `,
})
export class SiteFooter {
  protected readonly year = new Date().getFullYear();
}
