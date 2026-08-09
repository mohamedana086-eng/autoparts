import { Component, inject, signal } from '@angular/core';
import { AdminService } from '../core/admin.service';
import type { AdminWarehouse, WarehouseInput } from '../core/admin.models';

const BLANK: WarehouseInput = {
  code: '',
  name: '',
  city: '',
  address: '',
  active: true,
  priority: 0,
};

@Component({
  selector: 'app-admin-warehouses',
  template: `
    <h1 class="font-display text-2xl font-bold mb-1">Warehouses</h1>
    <p class="text-sm text-mute mb-6 max-w-2xl">
      Where stock is held. Not the same thing as a supplier — a supplier is who a part is
      bought from, a warehouse is where the ones already bought sit. Counts are set per part
      from the <span class="text-paper">Products</span> page.
    </p>

    @if (error()) {
      <div class="note note-alert p-3 mb-4">{{ error() }}</div>
    }
    @if (notice()) {
      <div class="note note-stock p-3 mb-4">{{ notice() }}</div>
    }

    <div class="flex mb-4">
      <button type="button" (click)="startCreate()" class="ml-auto btn-primary text-sm px-4 py-2">
        Add warehouse
      </button>
    </div>

    @if (editing()) {
      <div class="border border-signal/40 rounded-plate bg-ink-panel p-6 mb-6">
        <h2 class="font-display font-semibold mb-4">
          {{ editingId() ? 'Edit warehouse' : 'New warehouse' }}
        </h2>
        <form class="grid md:grid-cols-4 gap-4" (submit)="save($event)">
          <label class="grid gap-1 text-xs text-mute">
            Code
            <input required placeholder="EU1" [value]="form().code"
                   (input)="patch('code', $any($event.target).value)"
                   class="field font-mono uppercase" />
          </label>
          <label class="grid gap-1 text-xs text-mute md:col-span-2">
            Name
            <input required placeholder="Rotterdam main" [value]="form().name"
                   (input)="patch('name', $any($event.target).value)" class="field" />
          </label>
          <label class="grid gap-1 text-xs text-mute">
            City
            <input [value]="form().city" (input)="patch('city', $any($event.target).value)"
                   class="field" />
          </label>

          <label class="grid gap-1 text-xs text-mute md:col-span-2">
            Address
            <input [value]="form().address" (input)="patch('address', $any($event.target).value)"
                   class="field" />
          </label>
          <label class="grid gap-1 text-xs text-mute">
            Picking priority
            <input type="number" step="1" [value]="form().priority"
                   (input)="patchPriority($any($event.target).value)" class="field font-mono" />
            <span class="text-[11px] text-mute">Higher is drawn from first.</span>
          </label>
          <label class="grid gap-1 text-xs text-mute">
            Active
            <select [value]="form().active ? 'true' : 'false'"
                    (change)="patchActive($any($event.target).value)" class="field">
              <option value="true" [selected]="form().active">Yes</option>
              <option value="false" [selected]="!form().active">No</option>
            </select>
            <span class="text-[11px] text-mute">Inactive keeps the stock, stops the picking.</span>
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
      <div class="table-wrap">
        <table class="w-full text-sm min-w-[860px]">
          <thead>
            <tr class="table-head">
              <th class="px-4 py-3 font-medium">Code</th>
              <th class="px-4 py-3 font-medium">Name</th>
              <th class="px-4 py-3 font-medium">City</th>
              <th class="px-4 py-3 font-medium text-right">Parts</th>
              <th class="px-4 py-3 font-medium text-right">On hand</th>
              <th class="px-4 py-3 font-medium text-right">Reserved</th>
              <th class="px-4 py-3 font-medium text-right">Outlets</th>
              <th class="px-4 py-3 font-medium">Status</th>
              <th class="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            @for (w of warehouses(); track w.id) {
              <tr class="table-row">
                <td class="px-4 py-3 font-mono text-xs">{{ w.code }}</td>
                <td class="px-4 py-3">{{ w.name }}</td>
                <td class="px-4 py-3 text-mute">{{ w.city || '—' }}</td>
                <td class="px-4 py-3 text-right font-mono text-xs">{{ w.skuCount }}</td>
                <td class="px-4 py-3 text-right font-mono">{{ w.totalQuantity }}</td>
                <td class="px-4 py-3 text-right font-mono text-mute">{{ w.totalReserved }}</td>
                <td class="px-4 py-3 text-right font-mono text-xs">{{ w.outletCount }}</td>
                <td class="px-4 py-3 text-xs">
                  @if (w.active) {
                    <span class="text-stock">Active</span>
                  } @else {
                    <span class="text-mute">Closed</span>
                  }
                </td>
                <td class="px-4 py-3 text-right whitespace-nowrap">
                  <button type="button" (click)="startEdit(w)"
                          class="text-xs font-mono uppercase link-signal mr-3"
                          [attr.aria-label]="'Edit ' + w.code">Edit</button>
                  <button type="button" (click)="remove(w)" [disabled]="deletingId() === w.id"
                          class="text-xs font-mono uppercase text-mute hover:text-alert disabled:opacity-50 transition-colors"
                          [attr.aria-label]="'Delete ' + w.code">
                    {{ deletingId() === w.id ? '…' : 'Delete' }}
                  </button>
                </td>
              </tr>
            }
            @if (warehouses().length === 0) {
              <tr>
                <td colspan="9" class="px-4 py-8 text-center text-mute text-sm">
                  No warehouses yet. Add one before counting stock.
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class AdminWarehousesPage {
  private readonly admin = inject(AdminService);

  protected readonly warehouses = signal<AdminWarehouse[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly deletingId = signal<string | null>(null);

  protected readonly editing = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly form = signal<WarehouseInput>({ ...BLANK });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.admin
      .warehouses()
      .then((res) => {
        this.warehouses.set(res.warehouses);
        this.loading.set(false);
      })
      .catch(() => {
        this.error.set('Could not load warehouses.');
        this.loading.set(false);
      });
  }

  protected patch<K extends 'code' | 'name' | 'city' | 'address'>(key: K, value: string): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  protected patchPriority(value: string): void {
    this.form.update((f) => ({ ...f, priority: Number(value) || 0 }));
  }

  protected patchActive(value: string): void {
    this.form.update((f) => ({ ...f, active: value === 'true' }));
  }

  protected startCreate(): void {
    this.form.set({ ...BLANK });
    this.editingId.set(null);
    this.editing.set(true);
    this.error.set(null);
    this.notice.set(null);
  }

  protected startEdit(w: AdminWarehouse): void {
    this.form.set({
      code: w.code,
      name: w.name,
      city: w.city ?? '',
      address: w.address ?? '',
      active: w.active,
      priority: w.priority,
    });
    this.editingId.set(w.id);
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
        ? await this.admin.updateWarehouse(id, this.form())
        : await this.admin.createWarehouse(this.form());
      this.notice.set(`${res.warehouse.code} saved.`);
      this.editing.set(false);
      this.editingId.set(null);
      this.load();
    } catch (err: any) {
      this.error.set(err?.error?.error ?? 'Could not save that warehouse.');
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(w: AdminWarehouse): Promise<void> {
    this.deletingId.set(w.id);
    this.error.set(null);
    this.notice.set(null);
    try {
      // The API refuses while stock is still held here, and says so.
      const res = await this.admin.deleteWarehouse(w.id);
      this.warehouses.update((list) => list.filter((x) => x.id !== w.id));
      this.notice.set(
        res.orphanedOutlets > 0
          ? `${w.code} deleted. ${res.orphanedOutlets} outlet${
              res.orphanedOutlets === 1 ? '' : 's'
            } now have no warehouse.`
          : `${w.code} deleted.`
      );
    } catch (err: any) {
      this.error.set(err?.error?.error ?? 'Could not delete that warehouse.');
    } finally {
      this.deletingId.set(null);
    }
  }
}
