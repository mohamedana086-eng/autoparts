import { Component, inject, signal } from '@angular/core';
import { AdminService } from '../core/admin.service';
import type {
  AdminProduct, ImageInput, ProductInput, StockRowInput, TierRef,
} from '../core/admin.models';

/** What a warehouse holding none of a part reads as in the editor. */
interface StockCell {
  quantity: number;
  reserved: number;
  binLocation: string;
}

/** Shared, never mutated — returning one object keeps the template from
 *  rebinding an input on every change-detection pass. */
const EMPTY_CELL: StockCell = { quantity: 0, reserved: 0, binLocation: '' };

const BLANK: ProductInput = {
  partNumber: '',
  name: '',
  description: '',
  manufacturerId: '',
  vehicleSystemId: '',
  supplierId: null,
  basePrice: 0,
  // Blank so a new part inherits its supplier's lead time by default.
  stockDays: '',
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
      <div class="note note-alert p-3 mb-4">{{ error() }}</div>
    }
    @if (notice()) {
      <div class="note note-stock p-3 mb-4">{{ notice() }}</div>
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
              class="ml-auto btn-primary text-sm px-4 py-2">
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
                   class="field font-mono" />
          </label>
          <label class="grid gap-1 text-xs text-mute md:col-span-2">
            Name
            <input required [value]="form().name" (input)="patch('name', $any($event.target).value)"
                   class="field" />
          </label>

          <label class="grid gap-1 text-xs text-mute md:col-span-3">
            Description
            <input [value]="form().description" (input)="patch('description', $any($event.target).value)"
                   class="field" />
          </label>

          <label class="grid gap-1 text-xs text-mute">
            Manufacturer
            <select [value]="form().manufacturerId" (change)="patch('manufacturerId', $any($event.target).value)"
                    class="field">
              <option value="">— pick one —</option>
              @for (m of manufacturers(); track m.id) {
                <option [value]="m.id" [selected]="form().manufacturerId === m.id">{{ m.name }}</option>
              }
            </select>
          </label>
          <label class="grid gap-1 text-xs text-mute">
            Vehicle system
            <select [value]="form().vehicleSystemId" (change)="patch('vehicleSystemId', $any($event.target).value)"
                    class="field">
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
                     class="field font-mono" />
            </label>
            <label class="grid gap-1 text-xs text-mute">
              Delivery (days)
              <input type="number" min="0" step="1" placeholder="supplier default"
                     [value]="form().stockDays"
                     (input)="patch('stockDays', $any($event.target).value)"
                     class="field font-mono" />
            </label>
          </div>

          <label class="grid gap-1 text-xs text-mute md:col-span-3">
            Supplier
            <select [value]="form().supplierId ?? ''"
                    (change)="patchSupplier($any($event.target).value)" class="field">
              <option value="">— unsourced —</option>
              @for (s of suppliers(); track s.id) {
                <option [value]="s.id" [selected]="form().supplierId === s.id">{{ s.name }}</option>
              }
            </select>
            <span class="text-[11px] text-mute">
              A new part with the delivery field left blank takes this supplier's default.
            </span>
          </label>

          <div class="md:col-span-3 flex items-center gap-3 mt-1">
            <button type="submit" [disabled]="saving()"
                    class="btn-primary py-2.5 px-6">
              {{ saving() ? 'Saving…' : editingId() ? 'Save changes' : 'Create product' }}
            </button>
            <button type="button" (click)="cancel()"
                    class="text-xs text-mute hover:text-paper transition-colors">Cancel</button>
          </div>
        </form>
      </div>
    }

    @if (loading()) {
      <div class="panel h-40 animate-pulse"></div>
    } @else {
      <div class="table-wrap">
        <table class="w-full text-sm sm:min-w-[920px]">
          <thead>
            <tr class="table-head">
              <th class="col-wide px-4 py-3 font-medium"><span class="sr-only">Picture</span></th>
              <th class="px-4 py-3 font-medium">Part number</th>
              <th class="px-4 py-3 font-medium">Name</th>
              <th class="col-wide px-4 py-3 font-medium">Brand</th>
              <th class="col-wide px-4 py-3 font-medium">System</th>
              <th class="col-wide px-4 py-3 font-medium">Supplier</th>
              <th class="col-wide px-4 py-3 font-medium text-right">Purchase</th>
              <th class="col-wide px-4 py-3 font-medium">Delivery</th>
              <th class="px-4 py-3 font-medium text-right">In stock</th>
              <th class="col-wide px-4 py-3 font-medium">Refs</th>
              <th class="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            @for (p of products(); track p.id) {
              <tr class="table-row">
                <td class="col-wide px-4 py-3">
                  @if (p.primaryImageUrl) {
                    <img [src]="p.primaryImageUrl" [alt]="p.name" loading="lazy"
                         class="w-9 h-9 rounded object-cover bg-ink-panel" />
                  } @else {
                    <span class="block w-9 h-9 rounded bg-ink-panel border border-ink-line"
                          aria-label="No picture"></span>
                  }
                </td>
                <td class="px-4 py-3 font-mono text-xs">{{ p.partNumber }}</td>
                <td class="px-4 py-3">{{ p.name }}</td>
                <td class="col-wide px-4 py-3 text-mute">{{ p.manufacturerName }}</td>
                <td class="col-wide px-4 py-3 text-mute">{{ p.systemName }}</td>
                <td class="col-wide px-4 py-3 text-xs">
                  @if (p.supplierName) {
                    {{ p.supplierName }}
                  } @else {
                    <span class="text-mute">— unsourced —</span>
                  }
                </td>
                <td class="col-wide px-4 py-3 text-right font-mono">€{{ p.basePrice.toFixed(2) }}</td>
                <td class="col-wide px-4 py-3 font-mono text-xs">{{ p.stockDays }}d</td>
                <td class="px-4 py-3 text-right font-mono text-xs">
                  <!-- Zero held is a real answer and reads differently from a
                       part nobody has counted yet, so it is not dashed out. -->
                  @if (p.stockOnHand === null) {
                    <span class="text-mute">—</span>
                  } @else if (p.stockOnHand === 0) {
                    <span class="text-mute">0</span>
                  } @else {
                    <span class="text-stock">{{ p.stockAvailable }}</span>
                    @if (p.stockAvailable !== p.stockOnHand) {
                      <span class="text-mute"> / {{ p.stockOnHand }}</span>
                    }
                  }
                </td>
                <td class="col-wide px-4 py-3 font-mono text-xs text-mute">{{ p.interchangeCount }}</td>
                <td class="px-4 py-3 text-right whitespace-nowrap">
                  <button type="button" (click)="toggleInventory(p)"
                          class="text-xs font-mono uppercase link-signal mr-3"
                          [attr.aria-expanded]="expandedId() === p.id"
                          [attr.aria-label]="'Pictures and stock for ' + p.partNumber">
                    {{ expandedId() === p.id ? 'Close' : 'Stock' }}
                    @if (p.imageCount > 0) {
                      <span class="text-mute">({{ p.imageCount }})</span>
                    }
                  </button>
                  <button type="button" (click)="startEdit(p)"
                          class="text-xs font-mono uppercase link-signal mr-3"
                          [attr.aria-label]="'Edit ' + p.partNumber">Edit</button>
                  <button type="button" (click)="remove(p)" [disabled]="deletingId() === p.id"
                          class="text-xs font-mono uppercase text-mute hover:text-alert disabled:opacity-50 transition-colors"
                          [attr.aria-label]="'Delete ' + p.partNumber">
                    {{ deletingId() === p.id ? '…' : 'Delete' }}
                  </button>
                </td>
              </tr>

              @if (expandedId() === p.id) {
                <tr class="table-row">
                  <td colspan="11" class="px-4 py-5 bg-ink-panel/50">
                    @if (inventoryLoading()) {
                      <div class="h-24 animate-pulse"></div>
                    } @else {
                      <div class="grid lg:grid-cols-2 gap-8">
                        <!-- Pictures -->
                        <div class="min-w-0">
                          <p class="eyebrow mb-3">Pictures — the first one leads</p>

                          @for (img of images(); track $index) {
                            <div class="grid grid-cols-[1fr_1fr_auto] gap-2 mb-2 items-center">
                              <input [value]="img.url" (input)="patchImage($index, 'url', $any($event.target).value)"
                                     placeholder="https://… or /images/…"
                                     [attr.aria-label]="'Image ' + ($index + 1) + ' url'"
                                     class="field field-sm font-mono min-w-0" />
                              <input [value]="img.alt" (input)="patchImage($index, 'alt', $any($event.target).value)"
                                     placeholder="Describe it"
                                     [attr.aria-label]="'Image ' + ($index + 1) + ' description'"
                                     class="field field-sm min-w-0" />
                              <span class="flex gap-1.5 whitespace-nowrap">
                                <button type="button" (click)="moveImage($index, -1)" [disabled]="$index === 0"
                                        class="text-xs font-mono text-mute hover:text-paper disabled:opacity-30 transition-colors"
                                        [attr.aria-label]="'Move image ' + ($index + 1) + ' up'">↑</button>
                                <button type="button" (click)="moveImage($index, 1)"
                                        [disabled]="$index === images().length - 1"
                                        class="text-xs font-mono text-mute hover:text-paper disabled:opacity-30 transition-colors"
                                        [attr.aria-label]="'Move image ' + ($index + 1) + ' down'">↓</button>
                                <button type="button" (click)="removeImage($index)"
                                        class="text-xs font-mono text-mute hover:text-alert transition-colors"
                                        [attr.aria-label]="'Remove image ' + ($index + 1)">✕</button>
                              </span>
                            </div>
                          }
                          @if (images().length === 0) {
                            <p class="text-xs text-mute mb-2">No pictures on this part.</p>
                          }

                          <div class="flex items-center gap-3 mt-3">
                            <button type="button" (click)="addImage()" class="text-sm btn-quiet">
                              Add picture
                            </button>
                            <button type="button" (click)="saveImages(p)" [disabled]="savingImages()"
                                    class="btn-primary text-sm px-4 py-1.5">
                              {{ savingImages() ? 'Saving…' : 'Save pictures' }}
                            </button>
                          </div>
                        </div>

                        <!-- Stock -->
                        <div class="min-w-0">
                          <p class="eyebrow mb-3">Stock per warehouse</p>

                          @if (warehouses().length === 0) {
                            <p class="text-xs text-mute">
                              No active warehouse to count into yet.
                            </p>
                          } @else {
                            <div class="grid grid-cols-[1fr_5rem_5rem_1fr] gap-2 mb-1.5 text-[11px] text-mute">
                              <span>Warehouse</span>
                              <span class="text-right">On hand</span>
                              <span class="text-right">Reserved</span>
                              <span>Bin</span>
                            </div>
                            @for (w of warehouses(); track w.id) {
                              <div class="grid grid-cols-[1fr_5rem_5rem_1fr] gap-2 mb-2 items-center">
                                <span class="text-xs truncate min-w-0">{{ w.name }}</span>
                                <input type="number" min="0" step="1" [value]="stockAt(w.id).quantity"
                                       (input)="patchStock(w.id, 'quantity', $any($event.target).value)"
                                       [attr.aria-label]="'On hand at ' + w.name"
                                       class="field field-sm font-mono text-right min-w-0" />
                                <input type="number" min="0" step="1" [value]="stockAt(w.id).reserved"
                                       (input)="patchStock(w.id, 'reserved', $any($event.target).value)"
                                       [attr.aria-label]="'Reserved at ' + w.name"
                                       class="field field-sm font-mono text-right min-w-0" />
                                <input [value]="stockAt(w.id).binLocation"
                                       (input)="patchStock(w.id, 'binLocation', $any($event.target).value)"
                                       [attr.aria-label]="'Bin at ' + w.name"
                                       class="field field-sm font-mono min-w-0" />
                              </div>
                            }

                            <div class="flex items-center gap-3 mt-3">
                              <button type="button" (click)="saveStock(p)" [disabled]="savingStock()"
                                      class="btn-primary text-sm px-4 py-1.5">
                                {{ savingStock() ? 'Saving…' : 'Save stock' }}
                              </button>
                              <span class="text-[11px] text-mute">
                                Available is on hand minus reserved.
                              </span>
                            </div>
                          }
                        </div>
                      </div>
                    }
                  </td>
                </tr>
              }
            }
            @if (products().length === 0) {
              <tr><td colspan="11" class="px-4 py-8 text-center text-mute text-sm">No products match that.</td></tr>
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
  protected readonly suppliers = signal<TierRef[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly deletingId = signal<string | null>(null);
  protected readonly term = signal('');

  protected readonly editing = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly form = signal<ProductInput>({ ...BLANK });

  // ---------- Pictures and stock ----------
  // One part is open at a time, so a single set of signals serves the panel
  // rather than a per-row copy of every field.

  protected readonly warehouses = signal<TierRef[]>([]);
  protected readonly expandedId = signal<string | null>(null);
  protected readonly inventoryLoading = signal(false);
  protected readonly savingImages = signal(false);
  protected readonly savingStock = signal(false);
  protected readonly images = signal<ImageInput[]>([]);
  /** Keyed by warehouse id — the editor shows a line per warehouse either way. */
  protected readonly stock = signal<Record<string, StockCell>>({});

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
        this.suppliers.set(res.suppliers);
        this.warehouses.set(res.warehouses);
        this.loading.set(false);
      })
      .catch(() => {
        this.error.set('Could not load products.');
        this.loading.set(false);
      });
  }

  protected toggleInventory(p: AdminProduct): void {
    if (this.expandedId() === p.id) {
      this.expandedId.set(null);
      return;
    }

    this.expandedId.set(p.id);
    this.error.set(null);
    this.notice.set(null);
    this.inventoryLoading.set(true);
    this.images.set([]);
    this.stock.set({});

    Promise.all([this.admin.productImages(p.id), this.admin.productStock(p.id)])
      .then(([pictures, levels]) => {
        // Dropped if the admin closed the row or opened another while these
        // were in flight — otherwise one part's stock lands under another's.
        if (this.expandedId() !== p.id) return;

        this.images.set(pictures.images.map((i) => ({ url: i.url, alt: i.alt ?? '' })));
        this.stock.set(
          Object.fromEntries(
            levels.levels.map((l) => [
              l.warehouseId,
              { quantity: l.quantity, reserved: l.reserved, binLocation: l.binLocation ?? '' },
            ])
          )
        );
        this.inventoryLoading.set(false);
      })
      .catch(() => {
        if (this.expandedId() !== p.id) return;
        this.error.set('Could not load pictures and stock for that part.');
        this.inventoryLoading.set(false);
      });
  }

  protected stockAt(warehouseId: string): StockCell {
    return this.stock()[warehouseId] ?? EMPTY_CELL;
  }

  protected patchStock(warehouseId: string, key: keyof StockCell, value: string): void {
    this.stock.update((rows) => {
      const current = rows[warehouseId] ?? EMPTY_CELL;
      const next: StockCell =
        key === 'binLocation'
          ? { ...current, binLocation: value }
          : { ...current, [key]: Math.max(0, Math.trunc(Number(value) || 0)) };
      return { ...rows, [warehouseId]: next };
    });
  }

  protected addImage(): void {
    this.images.update((list) => [...list, { url: '', alt: '' }]);
  }

  protected removeImage(index: number): void {
    this.images.update((list) => list.filter((_, i) => i !== index));
  }

  protected patchImage(index: number, key: keyof ImageInput, value: string): void {
    this.images.update((list) =>
      list.map((img, i) => (i === index ? { ...img, [key]: value } : img))
    );
  }

  /** Position is what makes a picture the primary one, so this is the only
   *  way to promote one. */
  protected moveImage(index: number, delta: number): void {
    this.images.update((list) => {
      const target = index + delta;
      if (target < 0 || target >= list.length) return list;
      const next = [...list];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  protected async saveImages(p: AdminProduct): Promise<void> {
    if (this.savingImages()) return;

    this.savingImages.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      // A row left blank is one the admin added and did not fill in, not a
      // request to save an empty url the API would refuse.
      const rows = this.images().filter((img) => img.url.trim());
      const res = await this.admin.saveProductImages(p.id, rows);
      this.images.set(res.images.map((i) => ({ url: i.url, alt: i.alt ?? '' })));
      this.notice.set(
        `${p.partNumber}: ${res.images.length} picture${res.images.length === 1 ? '' : 's'} saved.`
      );

      // Keep the row's thumbnail and count honest without refetching the list.
      this.products.update((list) =>
        list.map((row) =>
          row.id === p.id
            ? {
                ...row,
                imageCount: res.images.length,
                primaryImageUrl: res.images[0]?.url ?? null,
              }
            : row
        )
      );
    } catch (err: any) {
      this.error.set(err?.error?.error ?? 'Could not save those pictures.');
    } finally {
      this.savingImages.set(false);
    }
  }

  protected async saveStock(p: AdminProduct): Promise<void> {
    if (this.savingStock()) return;

    this.savingStock.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      // Only warehouses with something to say. Sending every warehouse at zero
      // would write a row per site claiming it was counted — see the API,
      // where a warehouse left out is one that holds none.
      const rows: StockRowInput[] = Object.entries(this.stock())
        .filter(([, cell]) => cell.quantity > 0 || cell.reserved > 0 || cell.binLocation.trim())
        .map(([warehouseId, cell]) => ({
          warehouseId,
          quantity: cell.quantity,
          reserved: cell.reserved,
          binLocation: cell.binLocation.trim(),
        }));

      const res = await this.admin.saveProductStock(p.id, rows);
      this.stock.set(
        Object.fromEntries(
          res.levels.map((l) => [
            l.warehouseId,
            { quantity: l.quantity, reserved: l.reserved, binLocation: l.binLocation ?? '' },
          ])
        )
      );

      const onHand = res.levels.reduce((sum, l) => sum + l.quantity, 0);
      const available = res.levels.reduce((sum, l) => sum + l.available, 0);
      this.products.update((list) =>
        list.map((row) =>
          row.id === p.id ? { ...row, stockOnHand: onHand, stockAvailable: available } : row
        )
      );
      this.notice.set(`${p.partNumber}: ${onHand} on hand across ${res.levels.length} warehouse${
        res.levels.length === 1 ? '' : 's'
      }.`);
    } catch (err: any) {
      this.error.set(err?.error?.error ?? 'Could not save that stock.');
    } finally {
      this.savingStock.set(false);
    }
  }

  protected patch<K extends keyof ProductInput>(key: K, value: string): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  protected patchSupplier(id: string): void {
    this.form.update((f) => ({ ...f, supplierId: id || null }));
  }

  protected patchNumber(key: 'basePrice', value: string): void {
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
      supplierId: p.supplierId,
      basePrice: p.basePrice,
      stockDays: String(p.stockDays),
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
