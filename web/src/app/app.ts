import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';
import { SiteHeader } from './shell/site-header';
import { SiteFooter } from './shell/site-footer';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, SiteHeader, SiteFooter],
  template: `
    <div class="min-h-screen flex flex-col">
      <app-site-header />
      <main class="flex-1"><router-outlet /></main>
      <app-site-footer />
    </div>
  `,
})
export class App {
  private readonly auth = inject(AuthService);

  constructor() {
    // Ask the API who we are once on boot; the header renders from the result.
    void this.auth.refresh();
  }
}
