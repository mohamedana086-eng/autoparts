import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-login',
  imports: [RouterLink],
  template: `
    <div class="max-w-sm mx-auto px-6 py-16">
      <h1 class="font-display text-2xl font-bold mb-1">Sign in</h1>
      <p class="text-sm text-mute mb-8">Access your pricing tier, orders, and admin tools.</p>

      <form class="grid gap-4" (submit)="submit($event)">
        @if (error()) {
          <p class="text-sm text-alert bg-alert/10 border border-alert/30 rounded-plate px-3 py-2">{{ error() }}</p>
        }

        <label class="grid gap-1 text-xs text-mute">
          Email
          <input type="email" name="email" required autocomplete="email"
                 [value]="email()" (input)="email.set($any($event.target).value)"
                 class="bg-ink-panel border border-ink-line rounded-plate px-3 py-2 text-sm text-paper" />
        </label>
        <label class="grid gap-1 text-xs text-mute">
          Password
          <input type="password" name="password" required autocomplete="current-password"
                 [value]="password()" (input)="password.set($any($event.target).value)"
                 class="bg-ink-panel border border-ink-line rounded-plate px-3 py-2 text-sm text-paper" />
        </label>

        <button type="submit" [disabled]="pending()"
                class="w-full btn-primary py-2.5">
          {{ pending() ? 'Signing in…' : 'Sign in' }}
        </button>
      </form>

      <p class="text-xs text-mute mt-6 text-center">
        No account yet? <a routerLink="/register" class="link-signal">Create one</a>
      </p>
    </div>
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.pending()) return;

    this.pending.set(true);
    this.error.set(null);
    try {
      await this.auth.login(this.email().trim(), this.password());
      // Both branches of this were '/' — staff signed in and landed on the
      // storefront, which is not what they came for. Customers still do.
      this.router.navigate([this.auth.isStaff() ? '/admin' : '/']);
    } catch (err: any) {
      this.error.set(err?.error?.error ?? 'Could not sign in. Please try again.');
    } finally {
      this.pending.set(false);
    }
  }
}
