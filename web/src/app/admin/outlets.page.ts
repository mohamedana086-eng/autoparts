import { Component, inject, signal } from '@angular/core';
import { AdminService } from '../core/admin.service';
import type { AdminOutlet, OutletInput, TierRef } from '../core/admin.models';

const BLANK: OutletInput = {
  code: '',
  name: '',
  city: '',
  address: '',
  phone: '',
  warehouseId: null,
  active: true,
};

@Component({
  selector: 'app-admin-outlets',
  template: `
    <h1 class="font-display text-2xl font-bold mb-1">Retail outlets</h1>
    <p class="text-sm text-mute mb-6 max-w-2xl">
      Counters a customer can walk into or collect from. Each is supplied by one warehouse —
      an outlet can be opened before that is settled, and shows as unassigned until it is.
    </p>

    @if (error()) {
      <div class="note note-alert p-3 mb-4">{{ error() }}</div>
    }
    @if (notice()) {
      <div class="note note-stock p-3 mb-4">{{ notice() }}</div>
    }

    <div class="flex mb-4">
      <button type="button" (click)="startCreate()" class="ml-auto btn-primary text-sm px-4 py-2">
        Add outlet
      </button>
    </div>

    @if (editing()) {
      <div class="border border-signal/40 rounded-plate bg-ink-panel p-6 mb-6">
        <h2 class="font-display font-semibold mb-4">
          {{ editingId() ? 'Edit outlet' : 'New outlet' }}
        </h2>
        <form class="grid md:grid-cols-4 gap-4" (submit)="save($event)">
          <label class="grid gap-1 text-xs text-mute">
            Code
            <input required placeholder="CAI1" [value]="form().code"
                   (input)="patch('code', $any($event.target).value)"
                   class="field font-mono uppercase" />
          </label>
          <label class="grid gap-1 text-xs text-mute md:col-span-2">
            Name
            <input required placeholder="Nasr City counter" [value]="form().name"
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
            Phone
            <input [value]="form().phone" (input)="patch('phone', $any($event.target).value)"
                   class="field font-mono" />
          </label>
          <label class="grid gap-1 text-xs text-mute">
            Active
            <select [value]="form().active ? 'true' : 'false'"
                    (change)="patchActive($any($event.target).value)" class="field">
              <option value="true" [selected]="form().active">Yes</option>
              <option value="false" [selected]="!form().active">No</option>
            </select>
          </label>

          <label class="grid gap-1 text-xs text-mute md:col-span-4">
            Supplied by
            <select [value]="form().warehouseId ?? ''"
                    (change)="patchWarehouse($any($event.target).value)" class="field">
              <option value="">— not assigned —</option>
              @for (w of warehouses(); track w.id) {
                <option [value]="w.id" [selected]="form().warehouseId === w.id">{{ w.name }}</option>
              }
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
      <div class="table-wrap">
        <table class="w-full text-sm sm:min-w-[860px]">
          <thead>
            <tr class="table-head">
              <th class="px-4 py-3 font-medium">Code</th>
              <th class="px-4 py-3 font-medium">Name</th>
              <th class="col-wide px-4 py-3 font-medium">City</th>
              <th class="col-wide px-4 py-3 font-medium">Phone</th>
              <th class="col-wide px-4 py-3 font-medium">Supplied by</th>
              <th class="px-4 py-3 font-medium">Status</th>
              <th class="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            @for (o of outlets(); track o.id) {
              <tr class="table-row">
                <td class="px-4 py-3 font-mono text-xs">{{ o.code }}</td>
                <td class="px-4 py-3">{{ o.name }}</td>
                <td class="col-wide px-4 py-3 text-mute">{{ o.city || '—' }}</td>
                <td class="col-wide px-4 py-3 font-mono text-xs text-mute">{{ o.phone || '—' }}</td>
                <td class="col-wide px-4 py-3 text-xs">
                  @if (o.warehouseCode) {
                    <span class="font-mono">{{ o.warehouseCode }}</span> {{ o.warehouseName }}
                  } @else {
                    <span class="text-mute">— unassigned —</span>
                  }
                </td>
                <td class="px-4 py-3 text-xs">
                  @if (o.active) {
                    <span class="text-stock">Open</span>
                  } @else {
                    <span class="text-mute">Closed</span>
                  }
                </td>
                <td class="px-4 py-3 text-right whitespace-nowrap">
                  <button type="button" (click)="startEdit(o)"
                          class="text-xs font-mono uppercase link-signal mr-3"
                          [attr.aria-label]="'Edit ' + o.code">Edit</button>
                  <button type="button" (click)="remove(o)" [disabled]="deletingId() === o.id"
                          class="text-xs font-mono uppercase text-mute hover:text-alert disabled:opacity-50 transition-colors"
                          [attr.aria-label]="'Delete ' + o.code">
                    {{ deletingId() === o.id ? '…' : 'Delete' }}
                  </button>
                </td>
              </tr>
            }
            @if (outlets().length === 0) {
              <tr>
                <td colspan="7" class="px-4 py-8 text-center text-mute text-sm">No outlets yet.</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class AdminOutletsPage {
  private readonly admin = inject(AdminService);

  protected readonly outlets = signal<AdminOutlet[]>([]);
  protected readonly warehouses = signal<TierRef[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly deletingId = signal<string | null>(null);

  protected readonly editing = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly form = signal<OutletInput>({ ...BLANK });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.admin
      .outlets()
      .then((res) => {
        this.outlets.set(res.outlets);
        this.warehouses.set(res.warehouses);
        this.loading.set(false);
      })
      .catch(() => {
        this.error.set('Could not load outlets.');
        this.loading.set(false);
      });
  }

  protected patch<K extends 'code' | 'name' | 'city' | 'address' | 'phone'>(
    key: K,
    value: string
  ): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  protected patchWarehouse(id: string): void {
    this.form.update((f) => ({ ...f, warehouseId: id || null }));
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

  protected startEdit(o: AdminOutlet): void {
    this.form.set({
      code: o.code,
      name: o.name,
      city: o.city ?? '',
      address: o.address ?? '',
      phone: o.phone ?? '',
      warehouseId: o.warehouseId,
      active: o.active,
    });
    this.editingId.set(o.id);
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
        ? await this.admin.updateOutlet(id, this.form())
        : await this.admin.createOutlet(this.form());
      this.notice.set(`${res.outlet.code} saved.`);
      this.editing.set(false);
      this.editingId.set(null);
      this.load();
    } catch (err: any) {
      this.error.set(err?.error?.error ?? 'Could not save that outlet.');
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(o: AdminOutlet): Promise<void> {
    this.deletingId.set(o.id);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.admin.deleteOutlet(o.id);
      this.outlets.update((list) => list.filter((x) => x.id !== o.id));
      this.notice.set(`${o.code} deleted.`);
    } catch (err: any) {
      this.error.set(err?.error?.error ?? 'Could not delete that outlet.');
    } finally {
      this.deletingId.set(null);
    }
  }
}
