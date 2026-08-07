import { Component, inject, signal } from '@angular/core';
import { AdminService } from '../core/admin.service';
import type { AdminCurrency, CurrencyInput } from '../core/admin.models';

const BLANK: CurrencyInput = { code: '', name: '', symbol: '', rate: 1, active: true };

@Component({
  selector: 'app-admin-currencies',
  template: `
    <h1 class="font-display text-2xl font-bold mb-1">Currencies</h1>
    <p class="text-sm text-mute mb-6 max-w-2xl">
      What accounts can be quoted in. Every rate says how many units one unit of the base
      currency buys, so a price is converted by multiplying — there is only one direction
      to get wrong.
    </p>

    @if (error()) {
      <div class="note note-alert p-3 mb-4">{{ error() }}</div>
    }
    @if (notice()) {
      <div class="note note-stock p-3 mb-4">{{ notice() }}</div>
    }

    <div class="flex mb-4">
      <button type="button" (click)="startCreate()" class="ml-auto btn-primary text-sm px-4 py-2">
        Add currency
      </button>
    </div>

    @if (editing()) {
      <div class="border border-signal/40 rounded-plate bg-ink-panel p-6 mb-6">
        <h2 class="font-display font-semibold mb-4">
          {{ editingId() ? 'Edit currency' : 'New currency' }}
        </h2>
        <form class="grid md:grid-cols-4 gap-4" (submit)="save($event)">
          <label class="grid gap-1 text-xs text-mute">
            Code
            <input required maxlength="3" placeholder="EGP" [value]="form().code"
                   (input)="patch('code', $any($event.target).value)"
                   class="field font-mono uppercase" />
          </label>
          <label class="grid gap-1 text-xs text-mute md:col-span-2">
            Name
            <input required placeholder="Egyptian pound" [value]="form().name"
                   (input)="patch('name', $any($event.target).value)" class="field" />
          </label>
          <label class="grid gap-1 text-xs text-mute">
            Symbol
            <input required placeholder="E£" [value]="form().symbol"
                   (input)="patch('symbol', $any($event.target).value)" class="field" />
          </label>

          <label class="grid gap-1 text-xs text-mute md:col-span-2">
            Rate — units per 1 {{ baseCode() }}
            <input type="number" step="0.0001" min="0.0001" required [value]="form().rate"
                   (input)="patchRate($any($event.target).value)"
                   [disabled]="editingIsBase()"
                   class="field font-mono disabled:opacity-50" />
            @if (editingIsBase()) {
              <span class="text-[11px] text-mute">
                The base currency is the unit everything else is measured against, so its
                rate is always 1.
              </span>
            }
          </label>

          <label class="grid gap-1 text-xs text-mute">
            Active
            <select [value]="form().active ? 'true' : 'false'"
                    (change)="patchActive($any($event.target).value)"
                    [disabled]="editingIsBase()"
                    class="field disabled:opacity-50">
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </label>

          <div class="md:col-span-4 flex gap-3 mt-1">
            <button type="submit" [disabled]="saving()" class="btn-primary text-sm px-5 py-2">
              {{ saving() ? 'Saving…' : 'Save' }}
            </button>
            <button type="button" (click)="cancel()" class="text-sm btn-quiet">Cancel</button>
          </div>
        </form>
      </div>
    }

    @if (loading()) {
      <div class="panel h-40 animate-pulse"></div>
    } @else {
      <div class="border border-ink-line rounded-plate overflow-x-auto">
        <table class="w-full text-sm min-w-[680px]">
          <thead>
            <tr class="bg-ink-panel text-mute text-xs uppercase tracking-wider text-left">
              <th class="px-4 py-3 font-medium">Code</th>
              <th class="px-4 py-3 font-medium">Name</th>
              <th class="px-4 py-3 font-medium text-right">Rate</th>
              <th class="px-4 py-3 font-medium">Status</th>
              <th class="px-4 py-3 font-medium text-right">Accounts</th>
              <th class="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            @for (c of currencies(); track c.id) {
              <tr class="border-t border-ink-line hover:bg-ink-panel/60">
                <td class="px-4 py-3">
                  <span class="font-mono font-medium">{{ c.code }}</span>
                  <span class="text-mute ml-1">{{ c.symbol }}</span>
                </td>
                <td class="px-4 py-3">
                  {{ c.name }}
                  @if (c.isBase) {
                    <span class="ml-2 font-mono text-[10px] uppercase px-2 py-0.5 rounded-plate border border-signal text-signal">
                      base
                    </span>
                  }
                </td>
                <td class="px-4 py-3 font-mono text-right">{{ c.rate }}</td>
                <td class="px-4 py-3">
                  <span class="font-mono text-[10px] uppercase px-2 py-0.5 rounded-plate border"
                        [class]="c.active ? 'border-stock text-stock' : 'border-ink-line text-mute'">
                    {{ c.active ? 'active' : 'off' }}
                  </span>
                </td>
                <td class="px-4 py-3 font-mono text-right">{{ c.clientCount }}</td>
                <td class="px-4 py-3 text-right whitespace-nowrap">
                  <button type="button" (click)="startEdit(c)"
                          class="btn-quiet text-xs uppercase font-mono mr-3">Edit</button>
                  <button type="button" (click)="remove(c)"
                          [disabled]="deletingId() === c.id || c.isBase"
                          [attr.title]="c.isBase ? 'The base currency cannot be removed' : null"
                          [attr.aria-label]="'Delete ' + c.code"
                          class="text-mute hover:text-alert disabled:opacity-40 transition-colors text-xs uppercase font-mono">
                    {{ deletingId() === c.id ? '…' : 'Delete' }}
                  </button>
                </td>
              </tr>
            }
            @if (currencies().length === 0) {
              <tr><td colspan="6" class="px-4 py-8 text-center text-mute text-sm">No currencies yet.</td></tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class AdminCurrenciesPage {
  private readonly admin = inject(AdminService);

  protected readonly currencies = signal<AdminCurrency[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly deletingId = signal<string | null>(null);

  protected readonly editing = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly editingIsBase = signal(false);
  protected readonly form = signal<CurrencyInput>({ ...BLANK });

  constructor() {
    this.load();
  }

  protected baseCode(): string {
    return this.currencies().find((c) => c.isBase)?.code ?? 'base';
  }

  private load(): void {
    this.loading.set(true);
    this.admin
      .currencies()
      .then((res) => {
        this.currencies.set(res.currencies);
        this.loading.set(false);
      })
      .catch(() => {
        this.error.set('Could not load currencies.');
        this.loading.set(false);
      });
  }

  protected patch<K extends keyof CurrencyInput>(key: K, value: string): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  protected patchRate(value: string): void {
    this.form.update((f) => ({ ...f, rate: Number(value) }));
  }

  protected patchActive(value: string): void {
    this.form.update((f) => ({ ...f, active: value === 'true' }));
  }

  protected startCreate(): void {
    this.form.set({ ...BLANK });
    this.editingId.set(null);
    this.editingIsBase.set(false);
    this.editing.set(true);
    this.error.set(null);
    this.notice.set(null);
  }

  protected startEdit(c: AdminCurrency): void {
    this.form.set({ code: c.code, name: c.name, symbol: c.symbol, rate: c.rate, active: c.active });
    this.editingId.set(c.id);
    this.editingIsBase.set(c.isBase);
    this.editing.set(true);
    this.error.set(null);
    this.notice.set(null);
  }

  protected cancel(): void {
    this.editing.set(false);
    this.editingId.set(null);
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    if (this.saving()) return;

    this.saving.set(true);
    this.error.set(null);
    try {
      const id = this.editingId();
      const res = id
        ? await this.admin.updateCurrency(id, this.form())
        : await this.admin.createCurrency(this.form());
      this.notice.set(`${res.currency.code} saved.`);
      this.editing.set(false);
      this.editingId.set(null);
      this.load();
    } catch (err: any) {
      // The API explains a duplicate code, or an attempt to move the base.
      this.error.set(err?.error?.error ?? 'Could not save that currency.');
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(c: AdminCurrency): Promise<void> {
    this.deletingId.set(c.id);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.admin.deleteCurrency(c.id);
      this.currencies.update((list) => list.filter((x) => x.id !== c.id));
      this.notice.set(`${c.code} removed.`);
    } catch (err: any) {
      // The API explains when accounts still quote in it.
      this.error.set(err?.error?.error ?? 'Could not remove that currency.');
    } finally {
      this.deletingId.set(null);
    }
  }
}
