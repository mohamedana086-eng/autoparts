import { Component, inject, signal } from '@angular/core';
import { AdminService } from '../core/admin.service';
import type { AdminClient, TierRef } from '../core/admin.models';

@Component({
  selector: 'app-admin-clients',
  template: `
    <h1 class="font-display text-2xl font-bold mb-1">Clients</h1>
    <p class="text-sm text-mute mb-6 max-w-2xl">
      Every account is listed here, including self-registered Trade / B2B applicants — they
      start on the Retail tier until you assign them a negotiated pricing category below.
    </p>

    @if (error()) {
      <div class="border border-alert/40 bg-alert/10 rounded-plate p-4 text-sm text-alert mb-4">{{ error() }}</div>
    }
    @if (saved()) {
      <div class="border border-stock/40 bg-stock/10 rounded-plate p-3 text-sm text-stock mb-4">{{ saved() }}</div>
    }

    @if (loading()) {
      <div class="border border-ink-line rounded-plate bg-ink-panel h-40 animate-pulse"></div>
    } @else {
      <div class="border border-ink-line rounded-plate overflow-x-auto">
        <table class="w-full text-sm min-w-[760px]">
          <thead>
            <tr class="bg-ink-panel text-mute text-xs uppercase tracking-wider text-left">
              <th class="px-4 py-3 font-medium">Name</th>
              <th class="px-4 py-3 font-medium">Email</th>
              <th class="px-4 py-3 font-medium">Login</th>
              <th class="px-4 py-3 font-medium">Role &amp; pricing tier</th>
            </tr>
          </thead>
          <tbody>
            @for (c of clients(); track c.id) {
              <tr class="border-t border-ink-line hover:bg-ink-panel/60">
                <td class="px-4 py-3 font-medium">{{ c.name }}</td>
                <td class="px-4 py-3 text-mute font-mono text-xs">{{ c.email }}</td>
                <td class="px-4 py-3">
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
                    <button type="button" (click)="save(c.id)" [disabled]="savingId() === c.id"
                            class="text-[10px] font-mono uppercase px-2 py-1 rounded-plate border border-signal text-signal hover:bg-signal/10 disabled:opacity-50 transition-colors">
                      {{ savingId() === c.id ? '…' : 'Save' }}
                    </button>
                  </div>
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
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly saved = signal<string | null>(null);
  protected readonly savingId = signal<string | null>(null);

  protected readonly roles = [
    { value: 'ADMIN', label: 'Admin' },
    { value: 'B2B', label: 'Trade / B2B' },
    { value: 'RETAIL', label: 'Retail' },
  ];

  /** Pending edits, so the selects can change without saving on every keystroke. */
  private pending = new Map<string, { role: string; categoryId: string | null }>();

  constructor() {
    this.admin
      .clients()
      .then((res) => {
        this.clients.set(res.clients);
        this.categories.set(res.categories);
        this.loading.set(false);
      })
      .catch(() => {
        this.error.set('Could not load clients.');
        this.loading.set(false);
      });
  }

  private draft(id: string) {
    const existing = this.pending.get(id);
    if (existing) return existing;
    const c = this.clients().find((x) => x.id === id)!;
    const fresh = { role: c.role as string, categoryId: c.categoryId };
    this.pending.set(id, fresh);
    return fresh;
  }

  protected setRole(id: string, role: string): void {
    this.draft(id).role = role;
  }

  protected setTier(id: string, categoryId: string): void {
    this.draft(id).categoryId = categoryId || null;
  }

  protected async save(id: string): Promise<void> {
    const d = this.draft(id);
    this.savingId.set(id);
    this.error.set(null);
    this.saved.set(null);
    try {
      const res = await this.admin.updateClient(id, d.role, d.categoryId);
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
