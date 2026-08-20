import { Component, inject, signal } from '@angular/core';
import { AdminService } from '../core/admin.service';
import type { AdminClient, ClientInput, TierRef } from '../core/admin.models';

@Component({
  selector: 'app-admin-clients',
  template: `
    <h1 class="font-display text-2xl font-bold mb-1">Customers</h1>
    <p class="text-sm text-mute mb-6 max-w-2xl">
      Every account, including self-registered Trade / B2B applicants — they start on the
      Retail tier until you assign a negotiated category. Discount comes off the price the
      markup rules resolve; currency is what the account is quoted in.
    </p>

    @if (error()) {
      <div class="note note-alert p-4 mb-4">{{ error() }}</div>
    }
    @if (saved()) {
      <div class="note note-stock p-3 mb-4">{{ saved() }}</div>
    }

    @if (loading()) {
      <div class="panel h-40 animate-pulse"></div>
    } @else {
      <div class="table-wrap">
        <table class="w-full text-sm sm:min-w-[1060px]">
          <thead>
            <tr class="table-head">
              <th class="px-4 py-3 font-medium">Name</th>
              <th class="px-4 py-3 font-medium">Email</th>
              <th class="col-wide px-4 py-3 font-medium">Login</th>
              <th class="px-4 py-3 font-medium">Role &amp; pricing tier</th>
              <th class="col-wide px-4 py-3 font-medium">Discount</th>
              <th class="col-wide px-4 py-3 font-medium">Currency</th>
              <th class="col-wide px-4 py-3 font-medium">Sales manager</th>
              <th class="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            @for (c of clients(); track c.id) {
              <tr class="table-row">
                <td class="px-4 py-3 font-medium">{{ c.name }}</td>
                <td class="px-4 py-3 text-mute font-mono text-xs">{{ c.email }}</td>
                <td class="col-wide px-4 py-3">
                  <span class="text-[10px] font-mono uppercase px-2 py-1 rounded-plate border"
                        [class]="c.hasLogin ? 'border-stock text-stock' : 'border-ink-line text-mute'">
                    {{ c.hasLogin ? 'enabled' : 'no login' }}
                  </span>
                </td>
                <td class="px-4 py-3">
                  <div class="flex items-center gap-2">
                    <select [value]="c.role" (change)="setRole(c.id, $any($event.target).value)"
                            [attr.aria-label]="'Role for ' + c.name"
                            class="bg-ink border border-ink-line rounded-plate px-2 py-1 text-xs text-paper">
                      @for (r of roles; track r.value) {
                        <option [value]="r.value" [selected]="c.role === r.value">{{ r.label }}</option>
                      }
                    </select>
                    <select [value]="c.categoryId ?? ''" (change)="setTier(c.id, $any($event.target).value)"
                            [attr.aria-label]="'Pricing tier for ' + c.name"
                            class="bg-ink border border-ink-line rounded-plate px-2 py-1 text-xs text-paper">
                      <option value="">— none —</option>
                      @for (cat of categories(); track cat.id) {
                        <option [value]="cat.id" [selected]="c.categoryId === cat.id">{{ cat.name }}</option>
                      }
                    </select>
                  </div>
                </td>

                <td class="col-wide px-4 py-3">
                  <div class="flex items-baseline gap-1">
                    <input type="number" min="0" max="100" step="0.5"
                           [value]="c.discountPercent"
                           (input)="setDiscount(c.id, $any($event.target).value)"
                           [attr.aria-label]="'Discount for ' + c.name"
                           class="field-sm w-16 font-mono" />
                    <span class="text-xs text-mute">%</span>
                  </div>
                </td>

                <td class="col-wide px-4 py-3">
                  <select [value]="c.currencyId ?? ''" (change)="setCurrency(c.id, $any($event.target).value)"
                          [attr.aria-label]="'Currency for ' + c.name"
                          class="field-sm">
                    <option value="">Base</option>
                    @for (cur of currencies(); track cur.id) {
                      <option [value]="cur.id" [selected]="c.currencyId === cur.id">{{ cur.name }}</option>
                    }
                  </select>
                </td>

                <td class="col-wide px-4 py-3">
                  <select [value]="c.salesManagerId ?? ''"
                          (change)="setSalesManager(c.id, $any($event.target).value)"
                          [attr.aria-label]="'Sales manager for ' + c.name"
                          class="field-sm">
                    <option value="">— unassigned —</option>
                    @for (m of salesManagers(); track m.id) {
                      <option [value]="m.id" [selected]="c.salesManagerId === m.id">{{ m.name }}</option>
                    }
                  </select>
                </td>

                <td class="px-4 py-3 text-right">
                  <button type="button" (click)="save(c.id)" [disabled]="savingId() === c.id"
                          class="text-[10px] font-mono uppercase px-2 py-1 rounded-plate border border-signal text-signal hover:bg-signal/10 disabled:opacity-50 transition-colors">
                    {{ savingId() === c.id ? '…' : 'Save' }}
                  </button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class AdminClientsPage {
  private readonly admin = inject(AdminService);

  protected readonly clients = signal<AdminClient[]>([]);
  protected readonly categories = signal<TierRef[]>([]);
  protected readonly currencies = signal<TierRef[]>([]);
  protected readonly salesManagers = signal<TierRef[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly saved = signal<string | null>(null);
  protected readonly savingId = signal<string | null>(null);

  protected readonly roles = [
    { value: 'ADMIN', label: 'Admin' },
    { value: 'SALES', label: 'Sales' },
    { value: 'B2B', label: 'Trade / B2B' },
    { value: 'RETAIL', label: 'Retail' },
  ];

  /** Pending edits, so the controls can change without saving on every keystroke. */
  private pending = new Map<string, ClientInput>();

  constructor() {
    this.admin
      .clients()
      .then((res) => {
        this.clients.set(res.clients);
        this.categories.set(res.categories);
        this.currencies.set(res.currencies);
        this.salesManagers.set(res.salesManagers);
        this.loading.set(false);
      })
      .catch(() => {
        this.error.set('Could not load clients.');
        this.loading.set(false);
      });
  }

  private draft(id: string): ClientInput {
    const existing = this.pending.get(id);
    if (existing) return existing;
    const c = this.clients().find((x) => x.id === id)!;
    const fresh: ClientInput = {
      role: c.role as string,
      categoryId: c.categoryId,
      discountPercent: c.discountPercent,
      currencyId: c.currencyId,
      salesManagerId: c.salesManagerId,
    };
    this.pending.set(id, fresh);
    return fresh;
  }

  protected setRole(id: string, role: string): void {
    this.draft(id).role = role;
  }

  protected setTier(id: string, categoryId: string): void {
    this.draft(id).categoryId = categoryId || null;
  }

  protected setDiscount(id: string, value: string): void {
    this.draft(id).discountPercent = Number(value);
  }

  protected setCurrency(id: string, currencyId: string): void {
    this.draft(id).currencyId = currencyId || null;
  }

  protected setSalesManager(id: string, salesManagerId: string): void {
    this.draft(id).salesManagerId = salesManagerId || null;
  }

  protected async save(id: string): Promise<void> {
    const d = this.draft(id);
    this.savingId.set(id);
    this.error.set(null);
    this.saved.set(null);
    try {
      const res = await this.admin.updateClient(id, d);
      this.clients.update((list) => list.map((c) => (c.id === id ? res.client : c)));
      this.pending.delete(id);
      this.saved.set(`${res.client.name} updated.`);
    } catch (err: any) {
      this.error.set(err?.error?.error ?? 'Could not save that change.');
    } finally {
      this.savingId.set(null);
    }
  }
}
