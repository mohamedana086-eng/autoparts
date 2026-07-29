import { Component, inject, signal } from '@angular/core';
import { AdminService } from '../core/admin.service';
import type { AdminProduct, ProductInput, TierRef } from '../core/admin.models';

const BLANK: ProductInput = {
  partNumber: '',
  name: '',
  description: '',
  manufacturerId: '',
  vehicleSystemId: '',
  basePrice: 0,
  stockDays: 1,
};

@Component({
  selector: 'app-admin-products',
  template: `
    <h1 class="font-display text-2xl font-bold mb-1">Products</h1>
    <p class="text-sm text-mute mb-6 max-w-2xl">
      The catalogue itself. Prices here are the supplier purchase price — what a client
      pays is this plus whichever markup rule matches them.
    </p>

    @if (error()) {
      <div class="border border-alert/40 bg-alert/10 rounded-plate p-3 text-sm text-alert mb-4">{{ error() }}</div>
    }
    @if (notice()) {
      <div class="border border-stock/40 bg-stock/10 rounded-plate p-3 text-sm text-stock mb-4">{{ notice() }}</div>
    }

    <div class="flex flex-wrap items-center gap-3 mb-4">
      <input [value]="term()" (input)="term.set($any($event.target).value)"
             (keydown.enter)="load()" placeholder="Filter by part number or name"
             aria-label="Filter products"
             class="bg-ink-panel border border-ink-line rounded-plate px-3 py-2 text-sm text-paper w-64" />
      <button type="button" (click)="load()"
              class="text-xs font-mono uppercase px-3 py-2 rounded-plate border border-ink-line text-mute hover:text-paper transition-colors">
        Filter
      </button>
      <button type="button" (click)="startCreate()"
              class="ml-auto bg-signal hover:bg-signal-dim text-ink font-display font-bold text-sm px-4 py-2 rounded-plate transition-colors">
        Add product
      </button>
    </div>

    @if (editing()) {
      <div class="border border-signal/40 rounded-plate bg-ink-panel p-6 mb-6">
        <h2 class="font-display font-semibold mb-4">
          {{ editingId() ? 'Edit product' : 'New product' }}
        </h2>
        <form class="grid md:grid-cols-3 gap-4" (submit)="save($event)">
          <label class="grid gap-1 text-xs text-mute">
            Part number
            <input required [value]="form().partNumber" (input)="patch('partNumber', $any($event.target).value)"
                   class="bg-ink border border-ink-line rounded-plate px-3 py-2 text-sm text-paper font-mono" />
          </label>
          <label class="grid gap-1 text-xs text-mute md:col-span-2">
            Name
            <input required [value]="form().name" (input)="patch('name', $any($event.target).value)"
                   class="bg-ink border border-ink-line rounded-plate px-3 py-2 text-sm text-paper" />
          </label>

          <label class="grid gap-1 text-xs text-mute md:col-span-3">
            Description
            <input [value]="form().description" (input)="patch('description', $any($event.target).value)"
                   class="bg-ink border border-ink-line rounded-plate px-3 py-2 text-sm text-paper" />
          </label>

          <label class="grid gap-1 text-xs text-mute">
            Manufacturer
            <select [value]="form().manufacturerId" (change)="patch('manufacturerId', $any($event.target).value)"
                    class="bg-ink border border-ink-line rounded-plate px-3 py-2 text-sm text-paper">
              <option value="">— pick one —</option>
              @for (m of manufacturers(); track m.id) {
                <option [value]="m.id" [selected]="form().manufacturerId === m.id">{{ m.name }}</option>
              }
            </select>
          </label>
          <label class="grid gap-1 text-xs text-mute">
            Vehicle system
            <select [value]="form().vehicleSystemId" (change)="patch('vehicleSystemId', $any($event.target).value)"
                    class="bg-ink border border-ink-line rounded-plate px-3 py-2 text-sm text-paper">
              <option value="">— pick one —</option>
              @for (s of systems(); track s.id) {
                <option [value]="s.id" [selected]="form().vehicleSystemId === s.id">{{ s.name }}</option>
              }
            </select>
          </label>
          <div class="grid grid-cols-2 gap-4">
            <label class="grid gap-1 text-xs text-mute">
              Purchase price (€)
              <input type="number" step="0.01" min="0" required [value]="form().basePrice"
                     (input)="patchNumber('basePrice', $any($event.target).value)"
                     class="bg-ink border border-ink-line rounded-plate px-3 py-2 text-sm text-paper font-mono" />
            </label>
            <label class="grid gap-1 text-xs text-mute">
              Delivery (days)
              <input type="number" min="0" step="1" required [value]="form().stockDays"
                     (input)="patchNumber('stockDays', $any($event.target).value)"
                     class="bg-ink border border-ink-line rounded-plate px-3 py-2 text-sm text-paper font-mono" />
            </label>
          </div>

          <div class="md:col-span-3 flex items-center gap-3 mt-1">
            <button type="submit" [disabled]="saving()"
                    class="bg-signal hover:bg-signal-dim disabled:opacity-60 text-ink font-display font-bold py-2.5 px-6 rounded-plate transition-colors">
              {{ saving() ? 'Saving…' : editingId() ? 'Save changes' : 'Create product' }}
            </button>
            <button type="button" (click)="cancel()"
                    class="text-xs text-mute hover:text-paper transition-colors">Cancel</button>
          </div>
        </form>
      </div>
    }

    @if (loading()) {
      <div class="border border-ink-line rounded-plate bg-ink-panel h-40 animate-pulse"></div>
    } @else {
      <div class="border border-ink-line rounded-plate overflow-x-auto">
        <table class="w-full text-sm min-w-[820px]">
          <thead>
            <tr class="bg-ink-panel text-mute text-xs uppercase tracking-wider text-left">
              <th class="px-4 py-3 font-medium">Part number</th>
              <th class="px-4 py-3 font-medium">Name</th>
              <th class="px-4 py-3 font-medium">Brand</th>
              <th class="px-4 py-3 font-medium">System</th>
              <th class="px-4 py-3 font-medium text-right">Purchase</th>
              <th class="px-4 py-3 font-medium">Delivery</th>
              <th class="px-4 py-3 font-medium">Refs</th>
              <th class="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            @for (p of products(); track p.id) {
              <tr class="border-t border-ink-line hover:bg-ink-panel/60">
                <td class="px-4 py-3 font-mono text-xs">{{ p.partNumber }}</td>
                <td class="px-4 py-3">{{ p.name }}</td>
                <td class="px-4 py-3 text-mute">{{ p.manufacturerName }}</td>
                <td class="px-4 py-3 text-mute">{{ p.systemName }}</td>
                <td class="px-4 py-3 text-right font-mono">€{{ p.basePrice.toFixed(2) }}</td>
                <td class="px-4 py-3 font-mono text-xs">{{ p.stockDays }}d</td>
                <td class="px-4 py-3 font-mono text-xs text-mute">{{ p.interchangeCount }}</td>
                <td class="px-4 py-3 text-right whitespace-nowrap">
                  <button type="button" (click)="startEdit(p)"
                          class="text-xs font-mono uppercase text-signal hover:underline mr-3"
                          [attr.aria-label]="'Edit ' + p.partNumber">Edit</button>
                  <button type="button" (click)="remove(p)" [disabled]="deletingId() === p.id"
                          class="text-xs font-mono uppercase text-mute hover:text-alert disabled:opacity-50 transition-colors"
                          [attr.aria-label]="'Delete ' + p.partNumber">
                    {{ deletingId() === p.id ? '…' : 'Delete' }}
                  </button>
                </td>
              </tr>
            }
            @if (products().length === 0) {
              <tr><td colspan="8" class="px-4 py-8 text-center text-mute text-sm">No products match that.</td></tr>
            }
          </tbody>
        </table>
      </div>
      <p class="text-xs text-mute mt-3 font-mono">{{ products().length }} shown</p>
    }
  `,
})
export class AdminProductsPage {
  private readonly admin = inject(AdminService);

  protected readonly products = signal<AdminProduct[]>([]);
  protected readonly manufacturers = signal<TierRef[]>([]);
  protected readonly systems = signal<TierRef[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly deletingId = signal<string | null>(null);
  protected readonly term = signal('');

  protected readonly editing = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly form = signal<ProductInput>({ ...BLANK });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.admin
      .products(this.term().trim())
      .then((res) => {
        this.products.set(res.products);
        this.manufacturers.set(res.manufacturers);
        this.systems.set(res.systems);
        this.loading.set(false);
      })
      .catch(() => {
        this.error.set('Could not load products.');
        this.loading.set(false);
      });
  }

  protected patch<K extends keyof ProductInput>(key: K, value: string): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  protected patchNumber(key: 'basePrice' | 'stockDays', value: string): void {
    this.form.update((f) => ({ ...f, [key]: Number(value) }));
  }

  protected startCreate(): void {
    this.form.set({ ...BLANK });
    this.editingId.set(null);
    this.editing.set(true);
    this.error.set(null);
    this.notice.set(null);
  }

  protected startEdit(p: AdminProduct): void {
    this.form.set({
      partNumber: p.partNumber,
      name: p.name,
      description: p.description ?? '',
      manufacturerId: p.manufacturerId,
      vehicleSystemId: p.vehicleSystemId,
      basePrice: p.basePrice,
      stockDays: p.stockDays,
    });
    this.editingId.set(p.id);
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
        ? await this.admin.updateProduct(id, this.form())
        : await this.admin.createProduct(this.form());
      this.notice.set(`${res.product.partNumber} saved.`);
      this.editing.set(false);
      this.editingId.set(null);
      this.load();
    } catch (err: any) {
      this.error.set(err?.error?.error ?? 'Could not save that product.');
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(p: AdminProduct): Promise<void> {
    this.deletingId.set(p.id);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.admin.deleteProduct(p.id);
      this.products.update((list) => list.filter((x) => x.id !== p.id));
      this.notice.set(`${p.partNumber} deleted.`);
    } catch (err: any) {
      // The API explains when a part is on an order and cannot go.
      this.error.set(err?.error?.error ?? 'Could not delete that product.');
    } finally {
      this.deletingId.set(null);
    }
  }
}
