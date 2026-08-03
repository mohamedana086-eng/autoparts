import { Component, inject, signal } from '@angular/core';
import { AdminService } from '../core/admin.service';
import {
  MAX_RATING,
  RELIABILITIES,
  type AdminSupplier,
  type SupplierInput,
} from '../core/admin.models';

const BLANK: SupplierInput = {
  name: '',
  code: '',
  slug: '',
  description: '',
  reliability: 'standard',
  rating: null,
};

const RELIABILITY_STYLE: Record<string, string> = {
  official: 'border-stock text-stock',
  reliable: 'border-signal text-signal',
  standard: 'border-ink-line text-mute',
};

@Component({
  selector: 'app-admin-suppliers',
  template: `
    <h1 class="font-display text-2xl font-bold mb-1">Suppliers</h1>
    <p class="text-sm text-mute mb-6 max-w-2xl">
      Everyone we buy from. <span class="text-paper">Reliability</span> is what the trading
      relationship is; <span class="text-paper">rating</span> is how well they actually
      perform, and it is what customers can filter the catalogue by.
    </p>

    @if (error()) {
      <div class="border border-alert/40 bg-alert/10 rounded-plate p-3 text-sm text-alert mb-4">{{ error() }}</div>
    }
    @if (notice()) {
      <div class="border border-stock/40 bg-stock/10 rounded-plate p-3 text-sm text-stock mb-4">{{ notice() }}</div>
    }

    <div class="flex mb-4">
      <button type="button" (click)="startCreate()"
              class="ml-auto bg-signal hover:bg-signal-dim text-ink font-display font-bold text-sm px-4 py-2 rounded-plate transition-colors">
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
                   class="bg-ink border border-ink-line rounded-plate px-3 py-2 text-sm text-paper" />
          </label>
          <label class="grid gap-1 text-xs text-mute">
            Code
            <input required placeholder="e.g. IB16" [value]="form().code"
                   (input)="patch('code', $any($event.target).value)"
                   class="bg-ink border border-ink-line rounded-plate px-3 py-2 text-sm text-paper font-mono uppercase" />
          </label>

          <label class="grid gap-1 text-xs text-mute md:col-span-3">
            Description
            <input [value]="form().description" (input)="patch('description', $any($event.target).value)"
                   class="bg-ink border border-ink-line rounded-plate px-3 py-2 text-sm text-paper" />
          </label>

          <label class="grid gap-1 text-xs text-mute">
            Page url
            <input placeholder="made from the name if left blank" [value]="form().slug"
                   (input)="patch('slug', $any($event.target).value)"
                   class="bg-ink border border-ink-line rounded-plate px-3 py-2 text-sm text-paper font-mono" />
          </label>

          <label class="grid gap-1 text-xs text-mute">
            Reliability
            <select [value]="form().reliability" (change)="patch('reliability', $any($event.target).value)"
                    class="bg-ink border border-ink-line rounded-plate px-3 py-2 text-sm text-paper">
              @for (r of reliabilities; track r) {
                <option [value]="r" [selected]="form().reliability === r">{{ r }}</option>
              }
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
                    class="bg-signal hover:bg-signal-dim disabled:opacity-60 text-ink font-display font-bold text-sm px-5 py-2 rounded-plate transition-colors">
              {{ saving() ? 'Saving…' : 'Save' }}
            </button>
            <button type="button" (click)="cancel()"
                    class="text-sm text-mute hover:text-paper transition-colors">Cancel</button>
          </div>
        </form>
      </div>
    }

    @if (loading()) {
      <div class="border border-ink-line rounded-plate bg-ink-panel h-40 animate-pulse"></div>
    } @else {
      <div class="border border-ink-line rounded-plate overflow-x-auto">
        <table class="w-full text-sm min-w-[760px]">
          <thead>
            <tr class="bg-ink-panel text-mute text-xs uppercase tracking-wider text-left">
              <th class="px-4 py-3 font-medium">Supplier</th>
              <th class="px-4 py-3 font-medium">Code</th>
              <th class="px-4 py-3 font-medium">Reliability</th>
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
                  <span class="font-mono text-[10px] uppercase px-2 py-0.5 rounded-plate border"
                        [class]="badge(s.reliability)">{{ s.reliability }}</span>
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
              <tr><td colspan="6" class="px-4 py-8 text-center text-mute text-sm">No suppliers yet.</td></tr>
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
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly deletingId = signal<string | null>(null);
  protected readonly ratingId = signal<string | null>(null);

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

  protected badge(reliability: string): string {
    return RELIABILITY_STYLE[reliability] ?? RELIABILITY_STYLE['standard'];
  }
}
