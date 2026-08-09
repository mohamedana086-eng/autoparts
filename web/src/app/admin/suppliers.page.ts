import { Component, inject, signal } from '@angular/core';
import { AdminService } from '../core/admin.service';
import { SupplierBadges } from '../core/supplier-badges';
import {
  MAX_RATING,
  RELIABILITIES,
  type AdminSupplier,
  type SupplierInput,
  type TierRef,
} from '../core/admin.models';

const BLANK: SupplierInput = {
  name: '',
  code: '',
  slug: '',
  description: '',
  reliability: 'standard',
  rating: null,
  acceptsReturns: null,
  country: '',
  guaranteeMonths: '',
  defaultStockDays: '',
  purchaseCurrencyId: null,
};

@Component({
  selector: 'app-admin-suppliers',
  imports: [SupplierBadges],
  template: `
    <h1 class="font-display text-2xl font-bold mb-1">Suppliers</h1>
    <p class="text-sm text-mute mb-6 max-w-2xl">
      Everyone we buy from. <span class="text-paper">Reliability</span> is what the trading
      relationship is; <span class="text-paper">rating</span> is how well they actually
      perform, and it is what customers can filter the catalogue by.
    </p>

    @if (error()) {
      <div class="note note-alert p-3 mb-4">{{ error() }}</div>
    }
    @if (notice()) {
      <div class="note note-stock p-3 mb-4">{{ notice() }}</div>
    }

    <div class="flex mb-4">
      <button type="button" (click)="startCreate()"
              class="ml-auto btn-primary text-sm px-4 py-2">
        Add supplier
      </button>
    </div>

    @if (editing()) {
      <div class="border border-signal/40 rounded-plate bg-ink-panel p-6 mb-6">
        <h2 class="font-display font-semibold mb-4">
          {{ editingId() ? 'Edit supplier' : 'New supplier' }}
        </h2>
        <form class="grid md:grid-cols-3 gap-4" (submit)="save($event)">
          <label class="grid gap-1 text-xs text-mute md:col-span-2">
            Name
            <input required [value]="form().name" (input)="patch('name', $any($event.target).value)"
                   class="field" />
          </label>
          <label class="grid gap-1 text-xs text-mute">
            Code
            <input required placeholder="e.g. IB16" [value]="form().code"
                   (input)="patch('code', $any($event.target).value)"
                   class="field font-mono uppercase" />
          </label>

          <label class="grid gap-1 text-xs text-mute md:col-span-3">
            Description
            <input [value]="form().description" (input)="patch('description', $any($event.target).value)"
                   class="field" />
          </label>

          <label class="grid gap-1 text-xs text-mute">
            Page url
            <input placeholder="made from the name if left blank" [value]="form().slug"
                   (input)="patch('slug', $any($event.target).value)"
                   class="field font-mono" />
          </label>

          <label class="grid gap-1 text-xs text-mute">
            Reliability
            <select [value]="form().reliability" (change)="patch('reliability', $any($event.target).value)"
                    class="field">
              @for (r of reliabilities; track r) {
                <option [value]="r" [selected]="form().reliability === r">{{ r }}</option>
              }
            </select>
          </label>

          <label class="grid gap-1 text-xs text-mute">
            Country
            <input placeholder="e.g. Germany" [value]="form().country"
                   (input)="patch('country', $any($event.target).value)" class="field" />
          </label>

          <label class="grid gap-1 text-xs text-mute">
            Guarantee (months)
            <input type="number" min="0" step="1" placeholder="none agreed"
                   [value]="form().guaranteeMonths"
                   (input)="patch('guaranteeMonths', $any($event.target).value)"
                   class="field font-mono" />
          </label>

          <label class="grid gap-1 text-xs text-mute">
            Delivery time (days)
            <input type="number" min="0" step="1" placeholder="none"
                   [value]="form().defaultStockDays"
                   (input)="patch('defaultStockDays', $any($event.target).value)"
                   class="field font-mono" />
            <span class="text-[11px] text-mute">
              Used for new parts that leave their own delivery time blank. Never changes a
              part that already has one.
            </span>
          </label>

          <label class="grid gap-1 text-xs text-mute">
            Invoices in
            <select [value]="form().purchaseCurrencyId ?? ''"
                    (change)="patchCurrency($any($event.target).value)" class="field">
              <option value="">— not recorded —</option>
              @for (c of currencies(); track c.id) {
                <option [value]="c.id" [selected]="form().purchaseCurrencyId === c.id">{{ c.name }}</option>
              }
            </select>
            <span class="text-[11px] text-mute">
              Reference only — purchase prices stay in the base currency.
            </span>
          </label>

          <label class="grid gap-1 text-xs text-mute">
            Returns accepted
            <select [value]="returnsValue(form().acceptsReturns)"
                    (change)="patchReturns($any($event.target).value)"
                    class="field">
              <option value="">Not established</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </label>

          <div class="grid gap-1 text-xs text-mute">
            <span>Rating</span>
            <div class="flex items-center gap-1 h-[38px]">
              @for (star of stars; track star) {
                <button type="button" (click)="patchRating(star)"
                        [attr.aria-label]="'Rate ' + star + ' out of ' + max"
                        [attr.aria-pressed]="(form().rating ?? 0) >= star"
                        class="text-lg leading-none transition-colors"
                        [class]="(form().rating ?? 0) >= star ? 'text-signal' : 'text-ink-line hover:text-mute'">
                  ★
                </button>
              }
              @if (form().rating !== null) {
                <button type="button" (click)="patchRating(null)"
                        class="ml-2 text-[11px] text-mute hover:text-paper transition-colors">Clear</button>
              } @else {
                <span class="ml-2 text-[11px] text-mute">Unrated</span>
              }
            </div>
          </div>

          <div class="md:col-span-3 flex gap-3 mt-1">
            <button type="submit" [disabled]="saving()"
                    class="btn-primary text-sm px-5 py-2">
              {{ saving() ? 'Saving…' : 'Save' }}
            </button>
            <button type="button" (click)="cancel()"
                    class="text-sm text-mute hover:text-paper transition-colors">Cancel</button>
          </div>
        </form>
      </div>
    }

    @if (loading()) {
      <div class="panel h-40 animate-pulse"></div>
    } @else {
      <div class="border border-ink-line rounded-plate overflow-x-auto">
        <table class="w-full text-sm min-w-[760px]">
          <thead>
            <tr class="bg-ink-panel text-mute text-xs uppercase tracking-wider text-left">
              <th class="px-4 py-3 font-medium">Supplier</th>
              <th class="px-4 py-3 font-medium">Code</th>
              <th class="px-4 py-3 font-medium">Type</th>
              <th class="px-4 py-3 font-medium">Country</th>
              <th class="px-4 py-3 font-medium text-right">Guar.</th>
              <th class="px-4 py-3 font-medium text-right">Lead</th>
              <th class="px-4 py-3 font-medium">Returns</th>
              <th class="px-4 py-3 font-medium">Rating</th>
              <th class="px-4 py-3 font-medium">Parts</th>
              <th class="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            @for (s of suppliers(); track s.id) {
              <tr class="border-t border-ink-line hover:bg-ink-panel/60">
                <td class="px-4 py-3">
                  <span class="font-medium">{{ s.name }}</span>
                  <span class="block text-xs text-mute font-mono">/supplier/{{ s.slug }}</span>
                </td>
                <td class="px-4 py-3 font-mono text-xs">{{ s.code }}</td>
                <td class="px-4 py-3">
                  <app-supplier-badges [reliability]="s.reliability" [acceptsReturns]="null" />
                </td>
                <td class="px-4 py-3 text-xs">
                  {{ s.country ?? '—' }}
                  @if (s.purchaseCurrencyCode) {
                    <span class="block text-mute font-mono">{{ s.purchaseCurrencyCode }}</span>
                  }
                </td>
                <td class="px-4 py-3 font-mono text-xs text-right">
                  {{ s.guaranteeMonths === null ? '—' : s.guaranteeMonths + 'm' }}
                </td>
                <td class="px-4 py-3 font-mono text-xs text-right">
                  {{ s.defaultStockDays === null ? '—' : s.defaultStockDays + 'd' }}
                </td>
                <td class="px-4 py-3">
                  <select [value]="returnsValue(s.acceptsReturns)"
                          (change)="setReturns(s, $any($event.target).value)"
                          [disabled]="returnsId() === s.id"
                          [attr.aria-label]="'Returns accepted by ' + s.name"
                          class="bg-ink border border-ink-line rounded-plate px-2 py-1 text-xs text-paper disabled:opacity-50">
                    <option value="">—</option>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                </td>
                <td class="px-4 py-3">
                  <div class="flex items-center gap-1">
                    @for (star of stars; track star) {
                      <button type="button" (click)="rate(s, star)" [disabled]="ratingId() === s.id"
                              [attr.aria-label]="'Rate ' + s.name + ' ' + star + ' out of ' + max"
                              [attr.aria-pressed]="(s.rating ?? 0) >= star"
                              class="text-base leading-none disabled:opacity-50 transition-colors"
                              [class]="(s.rating ?? 0) >= star ? 'text-signal' : 'text-ink-line hover:text-mute'">
                        ★
                      </button>
                    }
                    @if (s.rating === null) {
                      <span class="ml-1.5 text-[11px] text-mute">Unrated</span>
                    } @else {
                      <button type="button" (click)="rate(s, null)" [disabled]="ratingId() === s.id"
                              class="ml-1.5 text-[11px] text-mute hover:text-paper disabled:opacity-50 transition-colors">
                        Clear
                      </button>
                    }
                  </div>
                </td>
                <td class="px-4 py-3 font-mono">{{ s.productCount }}</td>
                <td class="px-4 py-3 text-right whitespace-nowrap">
                  <button type="button" (click)="startEdit(s)"
                          class="text-mute hover:text-paper transition-colors text-xs uppercase font-mono mr-3">
                    Edit
                  </button>
                  <button type="button" (click)="remove(s)" [disabled]="deletingId() === s.id"
                          class="text-mute hover:text-alert disabled:opacity-50 transition-colors text-xs uppercase font-mono"
                          [attr.aria-label]="'Delete ' + s.name">
                    {{ deletingId() === s.id ? '…' : 'Delete' }}
                  </button>
                </td>
              </tr>
            }
            @if (suppliers().length === 0) {
              <tr><td colspan="10" class="px-4 py-8 text-center text-mute text-sm">No suppliers yet.</td></tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class AdminSuppliersPage {
  private readonly admin = inject(AdminService);

  protected readonly suppliers = signal<AdminSupplier[]>([]);
  protected readonly currencies = signal<TierRef[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly deletingId = signal<string | null>(null);
  protected readonly ratingId = signal<string | null>(null);
  protected readonly returnsId = signal<string | null>(null);

  protected readonly editing = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly form = signal<SupplierInput>({ ...BLANK });

  protected readonly reliabilities = RELIABILITIES;
  protected readonly max = MAX_RATING;
  protected readonly stars = Array.from({ length: MAX_RATING }, (_, i) => i + 1);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.admin
      .suppliers()
      .then((res) => {
        this.suppliers.set(res.suppliers);
        this.currencies.set(res.currencies);
        this.loading.set(false);
      })
      .catch(() => {
        this.error.set('Could not load suppliers.');
        this.loading.set(false);
      });
  }

  protected patch<K extends keyof SupplierInput>(key: K, value: string): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  /** Clicking the star already at the rating clears it — otherwise a 1 could
   *  never be taken back to unrated from the form. */
  protected patchRating(star: number | null): void {
    this.form.update((f) => ({ ...f, rating: f.rating === star ? null : star }));
  }

  /** The tri-state as a select value. Empty string is "not established", which
   *  has to stay distinct from a recorded "no". */
  protected returnsValue(value: boolean | null): string {
    return value === null || value === undefined ? '' : String(value);
  }

  protected parseReturns(raw: string): boolean | null {
    return raw === '' ? null : raw === 'true';
  }

  protected patchReturns(raw: string): void {
    this.form.update((f) => ({ ...f, acceptsReturns: this.parseReturns(raw) }));
  }

  protected startCreate(): void {
    this.form.set({ ...BLANK });
    this.editingId.set(null);
    this.editing.set(true);
    this.error.set(null);
    this.notice.set(null);
  }

  protected startEdit(s: AdminSupplier): void {
    this.form.set({
      name: s.name,
      code: s.code,
      slug: s.slug,
      description: s.description ?? '',
      reliability: s.reliability,
      rating: s.rating,
      acceptsReturns: s.acceptsReturns,
      country: s.country ?? '',
      guaranteeMonths: s.guaranteeMonths === null ? '' : String(s.guaranteeMonths),
      defaultStockDays: s.defaultStockDays === null ? '' : String(s.defaultStockDays),
      purchaseCurrencyId: s.purchaseCurrencyId,
    });
    this.editingId.set(s.id);
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
        ? await this.admin.updateSupplier(id, this.form())
        : await this.admin.createSupplier(this.form());
      this.notice.set(`${res.supplier.name} saved.`);
      this.editing.set(false);
      this.editingId.set(null);
      this.load();
    } catch (err: any) {
      // The API says which of code or url clashed — surface that verbatim.
      this.error.set(err?.error?.error ?? 'Could not save that supplier.');
    } finally {
      this.saving.set(false);
    }
  }

  /** Rating straight from the table. Clicking the current rating clears it. */
  protected async rate(supplier: AdminSupplier, star: number | null): Promise<void> {
    const next = supplier.rating === star ? null : star;
    this.ratingId.set(supplier.id);
    this.error.set(null);
    this.notice.set(null);
    try {
      const res = await this.admin.rateSupplier(supplier.id, next);
      this.suppliers.update((list) =>
        list.map((s) => (s.id === supplier.id ? res.supplier : s))
      );
    } catch (err: any) {
      this.error.set(err?.error?.error ?? 'Could not save that rating.');
    } finally {
      this.ratingId.set(null);
    }
  }

  /** Return terms straight from the table, without a full edit. */
  protected async setReturns(supplier: AdminSupplier, raw: string): Promise<void> {
    this.returnsId.set(supplier.id);
    this.error.set(null);
    this.notice.set(null);
    try {
      const res = await this.admin.setSupplierReturns(supplier.id, this.parseReturns(raw));
      this.suppliers.update((list) =>
        list.map((s) => (s.id === supplier.id ? res.supplier : s))
      );
    } catch (err: any) {
      this.error.set(err?.error?.error ?? 'Could not save those return terms.');
    } finally {
      this.returnsId.set(null);
    }
  }

  protected async remove(s: AdminSupplier): Promise<void> {
    this.deletingId.set(s.id);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.admin.deleteSupplier(s.id);
      this.suppliers.update((list) => list.filter((x) => x.id !== s.id));
      this.notice.set(`${s.name} deleted.`);
    } catch (err: any) {
      // The API explains when a supplier still sources parts and cannot go.
      this.error.set(err?.error?.error ?? 'Could not delete that supplier.');
    } finally {
      this.deletingId.set(null);
    }
  }

  protected patchCurrency(id: string): void {
    this.form.update((f) => ({ ...f, purchaseCurrencyId: id || null }));
  }
}
