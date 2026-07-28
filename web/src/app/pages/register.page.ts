import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-register',
  imports: [RouterLink],
  template: `
    <div class="max-w-sm mx-auto px-6 py-16">
      <h1 class="font-display text-2xl font-bold mb-1">Create an account</h1>
      <p class="text-sm text-mute mb-8">
        Retail accounts get instant access. Trade accounts start on the Retail tier and are
        reviewed by our team for a negotiated pricing tier.
      </p>

      <form class="grid gap-4" (submit)="submit($event)">
        @if (error()) {
          <p class="text-sm text-alert bg-alert/10 border border-alert/30 rounded-plate px-3 py-2">{{ error() }}</p>
        }

        <div class="grid gap-1">
          <span class="text-xs text-mute">Account type</span>
          <div class="grid grid-cols-2 gap-2">
            <button type="button" (click)="role.set('RETAIL')"
                    [class]="role() === 'RETAIL' ? selectedTab : unselectedTab">
              <span class="block font-medium">Retail</span>
              <span class="block text-[11px] text-mute">Buy at listed retail price</span>
            </button>
            <button type="button" (click)="role.set('B2B')"
                    [class]="role() === 'B2B' ? selectedTab : unselectedTab">
              <span class="block font-medium">Trade / B2B</span>
              <span class="block text-[11px] text-mute">Apply for a wholesale tier</span>
            </button>
          </div>
        </div>

        <label class="grid gap-1 text-xs text-mute">
          {{ role() === 'B2B' ? 'Company / contact name' : 'Full name' }}
          <input name="name" required [value]="name()" (input)="name.set($any($event.target).value)"
                 class="bg-ink-panel border border-ink-line rounded-plate px-3 py-2 text-sm text-paper" />
        </label>
        <label class="grid gap-1 text-xs text-mute">
          Email
          <input type="email" name="email" required autocomplete="email"
                 [value]="email()" (input)="email.set($any($event.target).value)"
                 class="bg-ink-panel border border-ink-line rounded-plate px-3 py-2 text-sm text-paper" />
        </label>
        <label class="grid gap-1 text-xs text-mute">
          City
          <input name="city" [value]="city()" (input)="city.set($any($event.target).value)"
                 class="bg-ink-panel border border-ink-line rounded-plate px-3 py-2 text-sm text-paper" />
        </label>
        <label class="grid gap-1 text-xs text-mute">
          Password
          <input type="password" name="password" required minlength="6" autocomplete="new-password"
                 [value]="password()" (input)="password.set($any($event.target).value)"
                 class="bg-ink-panel border border-ink-line rounded-plate px-3 py-2 text-sm text-paper" />
        </label>

        <button type="submit" [disabled]="pending()"
                class="w-full bg-signal hover:bg-signal-dim disabled:opacity-60 text-ink font-display font-bold py-2.5 rounded-plate transition-colors">
          {{ pending() ? 'Creating account…' : 'Create account' }}
        </button>
      </form>

      <p class="text-xs text-mute mt-6 text-center">
        Already have an account? <a routerLink="/login" class="text-signal hover:underline">Sign in</a>
      </p>
    </div>
  `,
})
export class RegisterPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly role = signal<'RETAIL' | 'B2B'>('RETAIL');
  protected readonly name = signal('');
  protected readonly email = signal('');
  protected readonly city = signal('');
  protected readonly password = signal('');
  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly selectedTab =
    'rounded-plate border px-3 py-2 text-sm text-left transition-colors border-signal bg-signal/10 text-paper';
  protected readonly unselectedTab =
    'rounded-plate border px-3 py-2 text-sm text-left transition-colors border-ink-line text-mute';

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.pending()) return;

    this.pending.set(true);
    this.error.set(null);
    try {
      await this.auth.register({
        name: this.name().trim(),
        email: this.email().trim(),
        password: this.password(),
        role: this.role(),
        city: this.city().trim(),
      });
      this.router.navigate(['/']);
    } catch (err: any) {
      this.error.set(err?.error?.error ?? 'Could not create the account. Please try again.');
    } finally {
      this.pending.set(false);
    }
  }
}
