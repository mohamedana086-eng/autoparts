import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { CartService } from '../core/cart.service';
import { CatalogService } from '../core/catalog.service';
import type { ProductSummary } from '../core/api.models';

@Component({
  selector: 'app-site-header',
  imports: [RouterLink],
  template: `
    <header class="border-b border-ink-line bg-ink/95 backdrop-blur sticky top-0 z-40">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-col md:flex-row md:items-center gap-3 md:gap-6">
        <div class="flex items-center justify-between md:justify-start md:contents">
          <a routerLink="/" class="flex items-center gap-2 shrink-0">
            <div class="w-8 h-8 rounded-plate bg-signal flex items-center justify-center shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10131A" stroke-width="2.5"
                   stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
              </svg>
            </div>
            <span class="font-display font-bold text-lg tracking-tight whitespace-nowrap">
              AutoParts<span class="text-signal">Hub</span>
            </span>
          </a>

          <nav class="flex items-center gap-4 sm:gap-5 text-sm text-mute shrink-0 md:order-3">
            @if (auth.isAdmin()) {
              <a routerLink="/admin" class="hover:text-paper transition-colors hidden sm:inline">Admin</a>
            }

            @if (auth.isLoggedIn()) {
              <span class="hidden lg:inline text-paper text-xs">Hi, {{ firstName() }}</span>
              <button type="button" (click)="signOut()"
                      class="hover:text-paper transition-colors flex items-center gap-1.5" aria-label="Sign out">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                     stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                <span class="hidden lg:inline">Sign out</span>
              </button>
            } @else {
              <a routerLink="/login" class="hover:text-paper transition-colors flex items-center gap-1.5">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                     stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
                <span class="hidden lg:inline">Sign in</span>
              </a>
            }

            <a routerLink="/cart" class="hover:text-paper transition-colors flex items-center gap-1.5"
               [attr.aria-label]="cartLabel()">
              <span class="relative">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                     stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/>
                  <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>
                </svg>
                @if (cart.count() > 0) {
                  <span class="absolute -top-1.5 -right-2 bg-signal text-ink text-[10px] font-mono font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
                    {{ cart.count() > 99 ? '99+' : cart.count() }}
                  </span>
                }
              </span>
              <span class="hidden lg:inline">Cart</span>
            </a>
          </nav>
        </div>

        <form class="flex w-full md:flex-1 md:max-w-xl md:order-2 relative" (submit)="submitSearch($event)">
          <div class="relative flex-1 min-w-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
                 class="absolute left-3 top-1/2 -translate-y-1/2 text-mute">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input [value]="term()" (input)="onType($any($event.target).value)"
                   (focus)="focused.set(true)" (blur)="onBlur()" (keydown.escape)="close()"
                   placeholder="Part number, brand, or a number it replaces" aria-label="Search parts"
                   autocomplete="off" role="combobox" [attr.aria-expanded]="showSuggestions()"
                   aria-controls="search-suggestions"
                   class="w-full bg-ink-panel border border-ink-line rounded-l-plate pl-9 pr-3 py-2 text-sm font-mono placeholder:font-body placeholder:text-mute focus:outline-none focus:ring-1 focus:ring-signal" />
          </div>
          <button type="submit"
                  class="bg-signal hover:bg-signal-dim transition-colors text-ink font-display font-bold text-sm px-5 rounded-r-plate shrink-0">
            Find
          </button>

          @if (showSuggestions()) {
            <div id="search-suggestions" role="listbox"
                 class="absolute top-full left-0 right-0 mt-1 z-50 border border-ink-line rounded-plate bg-ink-raised shadow-xl overflow-hidden">
              @for (s of suggestions(); track s.id) {
                <button type="button" role="option" [attr.aria-selected]="false"
                        (mousedown)="openProduct($event, s.id)"
                        class="w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-ink-panel transition-colors border-b border-ink-line last:border-b-0">
                  <span class="font-mono text-xs text-paper shrink-0">{{ s.partNumber }}</span>
                  <span class="text-xs text-mute truncate flex-1">{{ s.name }}</span>
                  @if (s.matchedOn === 'interchange' && s.matchedVia) {
                    <span class="text-[10px] text-signal shrink-0">replaces {{ s.matchedVia }}</span>
                  } @else {
                    <span class="text-[10px] text-mute shrink-0">{{ s.manufacturer }}</span>
                  }
                  <span class="font-mono text-xs text-signal shrink-0">€{{ s.price.toFixed(2) }}</span>
                </button>
              }
              @if (suggestions().length === 0 && !searching()) {
                <p class="px-3 py-2 text-xs text-mute">No parts match that.</p>
              }
            </div>
          }
        </form>
      </div>
    </header>
  `,
})
export class SiteHeader {
  protected readonly auth = inject(AuthService);
  protected readonly cart = inject(CartService);
  private readonly router = inject(Router);
  private readonly catalog = inject(CatalogService);

  protected readonly term = signal('');
  protected readonly suggestions = signal<ProductSummary[]>([]);
  protected readonly focused = signal(false);
  protected readonly searching = signal(false);

  private readonly typed = new Subject<string>();

  constructor() {
    this.typed
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        // switchMap so a slower earlier request cannot overwrite a newer one.
        switchMap((q) => this.catalog.suggest(q))
      )
      .subscribe({
        next: (res) => {
          this.suggestions.set(res.products);
          this.searching.set(false);
        },
        error: () => {
          this.suggestions.set([]);
          this.searching.set(false);
        },
      });
  }

  protected showSuggestions(): boolean {
    return this.focused() && this.term().trim().length >= 2;
  }

  protected onType(value: string): void {
    this.term.set(value);
    const q = value.trim();
    if (q.length < 2) {
      this.suggestions.set([]);
      return;
    }
    this.searching.set(true);
    this.typed.next(q);
  }

  /** Deferred so a click on a suggestion lands before the list closes. */
  protected onBlur(): void {
    setTimeout(() => this.focused.set(false), 120);
  }

  protected close(): void {
    this.focused.set(false);
  }

  protected openProduct(event: Event, id: string): void {
    event.preventDefault();
    this.close();
    this.router.navigate(['/product', id]);
  }

  protected firstName(): string {
    return this.auth.user()?.name.split(' ')[0] ?? '';
  }

  protected cartLabel(): string {
    const n = this.cart.count();
    return n > 0 ? `Cart, ${n} item${n === 1 ? '' : 's'}` : 'Cart';
  }

  protected submitSearch(event: Event): void {
    event.preventDefault();
    this.close();
    this.router.navigate(['/search'], { queryParams: { q: this.term().trim() || null } });
  }

  protected async signOut(): Promise<void> {
    await this.auth.logout();
    this.router.navigate(['/login']);
  }
}
