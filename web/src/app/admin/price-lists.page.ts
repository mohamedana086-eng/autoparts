import { Component, inject, signal } from '@angular/core';
import { AdminService } from '../core/admin.service';
import type {
  AdminPriceList, AdminPriceListItem, PriceListUploadResult, PriceRowInput,
} from '../core/admin.models';

/**
 * Headings, as supplier files actually write them.
 *
 * `article` sits beside `artikel` because an English-language file from a
 * German supplier says "Article No" and the German-only pattern missed it,
 * putting the description column where the part number should have been.
 */
const HEADER_WORDS = /^(part|item|code|ref|reference|number|no\.?|sku|oe|oem|artikel|article|art\.?)/i;
const PRICE_WORDS = /^(price|cost|net|amount|value|preis|prix)/i;
const CURRENCY_WORDS = /^(currency|curr|ccy)/i;

@Component({
  selector: 'app-admin-price-lists',
  template: `
    <h1 class="font-display text-2xl font-bold mb-1">Purchase price lists</h1>
    <p class="text-sm text-mute mb-6 max-w-3xl">
      What each part costs to buy — the figure every markup rule multiplies up. Upload as many
      lists as you like; <strong class="text-paper">at most one is active</strong>, and switching
      one on stands the other down. A part the active list does not mention keeps its own stored
      price, so a list covering half the catalogue reprices half of it and leaves the rest alone.
    </p>

    @if (error()) {
      <div class="note note-alert p-3 mb-4">{{ error() }}</div>
    }
    @if (notice()) {
      <div class="note p-3 mb-4 text-sm">{{ notice() }}</div>
    }

    <!-- ---------- Upload ---------- -->
    <div class="panel p-5 mb-8">
      <h2 class="font-display font-semibold text-sm mb-1">Upload a list</h2>
      <p class="text-xs text-mute mb-4">
        .xlsx or .csv — a part-number column, a price column, and optionally a currency column.
        Columns are found by their heading; without headings the first three are used in that
        order. It arrives switched off, so nothing changes until you activate it.
      </p>

      <div class="grid md:grid-cols-2 gap-4">
        <label class="grid gap-1">
          <span class="text-xs text-mute">Name</span>
          <input [value]="name()" (input)="name.set($any($event.target).value)"
                 placeholder="Bosch — Q3 2026" class="field" />
        </label>
        <label class="grid gap-1">
          <span class="text-xs text-mute">Note (optional)</span>
          <input [value]="description()" (input)="description.set($any($event.target).value)"
                 placeholder="Sent 12 Aug, replaces the June list" class="field" />
        </label>
      </div>

      <input type="file" accept=".xlsx,.xls,.csv" (change)="onFile($event)"
             aria-label="Price list spreadsheet"
             class="mt-4 block w-full text-xs text-mute file:mr-3 file:py-2 file:px-4 file:rounded-plate file:border-0 file:bg-signal file:text-ink file:font-display file:font-bold file:text-xs hover:file:bg-signal-dim file:cursor-pointer" />

      @if (parsed().length > 0) {
        <div class="mt-4 border-t border-ink-line pt-4">
          <p class="text-xs text-mute mb-2">
            <span class="text-paper font-mono">{{ fileName() }}</span> —
            {{ parsed().length }} row{{ parsed().length === 1 ? '' : 's' }} read.
            First few, as they will be sent:
          </p>
          <ul class="grid gap-1 mb-4">
            @for (row of parsed().slice(0, 5); track $index) {
              <li class="flex items-baseline gap-3 text-xs">
                <span class="font-mono text-paper w-44 shrink-0">{{ row.partNumber }}</span>
                <span class="font-mono">{{ row.price }}</span>
                <span class="text-mute">{{ row.currency || 'base currency' }}</span>
              </li>
            }
          </ul>
          <button type="button" (click)="upload()" [disabled]="busy()"
                  class="btn-primary text-sm px-4 py-2">
            {{ busy() ? 'Uploading…' : 'Upload ' + parsed().length + ' rows' }}
          </button>
        </div>
      }

      @if (result(); as res) {
        <div class="mt-4 border-t border-ink-line pt-4 text-sm">
          <p>
            <span class="font-mono text-stock font-bold">{{ res.accepted }}</span> priced
            @if (res.rejectedCount > 0) {
              · <span class="font-mono text-alert">{{ res.rejectedCount }}</span> not used
            }
          </p>
          @if (res.rejected.length > 0) {
            <ul class="grid gap-1 mt-3">
              @for (r of res.rejected; track $index) {
                <li class="text-xs text-mute">
                  <span class="font-mono text-paper">{{ r.partNumber }}</span> — {{ r.reason }}
                </li>
              }
            </ul>
            @if (res.rejectedCount > res.rejected.length) {
              <p class="text-xs text-mute mt-2">
                …and {{ res.rejectedCount - res.rejected.length }} more.
              </p>
            }
          }
        </div>
      }
    </div>

    <!-- ---------- The lists ---------- -->
    @if (loading()) {
      <div class="panel h-40 animate-pulse"></div>
    } @else {
      <div class="table-wrap">
        <table class="w-full text-sm sm:min-w-[760px]">
          <thead>
            <tr class="table-head">
              <th class="px-4 py-3 font-medium">Name</th>
              <th class="col-wide px-4 py-3 font-medium">Uploaded</th>
              <th class="px-4 py-3 font-medium text-right">Parts</th>
              <th class="px-4 py-3 font-medium">In force</th>
              <th class="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            @for (l of lists(); track l.id) {
              <tr class="table-row" [class.bg-ink-panel]="l.active">
                <td class="px-4 py-3">
                  <span class="font-medium">{{ l.name }}</span>
                  @if (l.description) {
                    <span class="block text-xs text-mute">{{ l.description }}</span>
                  }
                  @if (l.sourceName) {
                    <span class="block text-[10px] text-mute font-mono">{{ l.sourceName }}</span>
                  }
                </td>
                <td class="col-wide px-4 py-3 text-mute text-xs font-mono">{{ l.createdAt.slice(0, 10) }}</td>
                <td class="px-4 py-3 text-right font-mono">{{ l.itemCount }}</td>
                <td class="px-4 py-3">
                  <button type="button" (click)="setActive(l, !l.active)" [disabled]="busyId() === l.id"
                          class="text-[10px] font-mono uppercase px-2 py-1 rounded-plate border transition-colors disabled:opacity-50"
                          [class]="l.active ? 'border-stock text-stock' : 'border-ink-line text-mute hover:text-paper'">
                    {{ l.active ? 'Active' : 'Switch on' }}
                  </button>
                </td>
                <td class="px-4 py-3 text-right whitespace-nowrap">
                  <button type="button" (click)="toggleItems(l.id)"
                          class="text-xs font-mono uppercase link-signal mr-3"
                          [attr.aria-expanded]="expandedId() === l.id">
                    {{ expandedId() === l.id ? 'Hide' : 'Prices' }}
                  </button>
                  <button type="button" (click)="rename(l)" [disabled]="busyId() === l.id"
                          class="text-xs font-mono uppercase link-signal mr-3 disabled:opacity-50">
                    Rename
                  </button>
                  <button type="button" (click)="remove(l)" [disabled]="busyId() === l.id || l.active"
                          [attr.title]="l.active ? 'Switch it off first' : null"
                          class="text-xs font-mono uppercase text-alert hover:underline disabled:opacity-40">
                    Delete
                  </button>
                </td>
              </tr>

              @if (expandedId() === l.id) {
                <tr class="table-row">
                  <td colspan="5" class="px-4 py-4 bg-ink-panel/50">
                    @if (itemsLoading()) {
                      <div class="h-16 animate-pulse"></div>
                    } @else {
                      <table class="w-full text-xs">
                        <thead>
                          <tr class="text-mute uppercase tracking-wider text-left">
                            <th class="pb-2 pr-3 font-medium">Part</th>
                            <th class="pb-2 pr-3 font-medium text-right">This list</th>
                            <th class="pb-2 pr-3 font-medium text-right">As quoted</th>
                            <th class="pb-2 font-medium text-right">Without it</th>
                          </tr>
                        </thead>
                        <tbody>
                          @for (i of items(); track i.productId) {
                            <tr class="border-t border-ink-line">
                              <td class="py-2 pr-3">
                                <span class="font-mono text-paper">{{ i.partNumber }}</span>
                                <span class="block text-mute truncate max-w-[22rem]">{{ i.name }}</span>
                              </td>
                              <td class="py-2 pr-3 text-right font-mono text-paper">€{{ i.price.toFixed(2) }}</td>
                              <td class="py-2 pr-3 text-right font-mono text-mute">
                                @if (i.sourceCurrency) {
                                  {{ i.sourcePrice?.toFixed(2) }} {{ i.sourceCurrency }}
                                } @else {
                                  —
                                }
                              </td>
                              <td class="py-2 text-right font-mono text-mute">€{{ i.basePrice.toFixed(2) }}</td>
                            </tr>
                          }
                        </tbody>
                      </table>
                      <p class="text-[10px] text-mute mt-3 font-mono">
                        Showing {{ items().length }} of {{ l.itemCount }}, by part number.
                        "Without it" is the price that applies when this list is off.
                      </p>
                    }
                  </td>
                </tr>
              }
            }
            @if (lists().length === 0) {
              <tr>
                <td colspan="5" class="px-4 py-8 text-center text-mute text-sm">
                  No price list yet. Every part is using its own stored price.
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class AdminPriceListsPage {
  private readonly admin = inject(AdminService);

  protected readonly lists = signal<AdminPriceList[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly busyId = signal<string | null>(null);

  protected readonly name = signal('');
  protected readonly description = signal('');
  protected readonly fileName = signal<string | null>(null);
  protected readonly parsed = signal<PriceRowInput[]>([]);
  protected readonly result = signal<PriceListUploadResult | null>(null);

  protected readonly expandedId = signal<string | null>(null);
  protected readonly items = signal<AdminPriceListItem[]>([]);
  protected readonly itemsLoading = signal(false);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.admin
      .priceLists()
      .then((res) => {
        this.lists.set(res.lists);
        this.loading.set(false);
      })
      .catch(() => {
        this.error.set('Could not load the price lists.');
        this.loading.set(false);
      });
  }

  // ---------- Reading the file ----------

  protected async onFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.fileName.set(file.name);
    this.error.set(null);
    this.result.set(null);
    // A name is almost always the file's, so offer it rather than ask twice.
    if (!this.name().trim()) this.name.set(file.name.replace(/\.[^.]+$/, ''));

    try {
      const rows = file.name.toLowerCase().endsWith('.csv')
        ? this.fromCsv(await file.text())
        : await this.fromSpreadsheet(file);

      this.parsed.set(rows);
      if (rows.length === 0) {
        this.error.set('No part number and price columns found in that file.');
      }
    } catch {
      this.parsed.set([]);
      this.error.set('Could not read that file. Save it as .xlsx or .csv and try again.');
    }
  }

  /** Loaded on demand, as the bulk lookup does, so the spreadsheet parser
   *  stays out of the bundle of every other admin page. */
  private async fromSpreadsheet(file: File): Promise<PriceRowInput[]> {
    const readXlsxFile = (await import('read-excel-file')).default;
    const rows = await readXlsxFile(file);
    return this.toRows(rows.map((r) => r.map((c) => (c == null ? '' : String(c)))));
  }

  private fromCsv(text: string): PriceRowInput[] {
    const rows = text
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map((line) => line.split(/[,;\t]/).map((c) => c.trim().replace(/^"|"$/g, '')));
    return this.toRows(rows);
  }

  /**
   * Works out which column is which, then reads the rest.
   *
   * By heading where there is one, because supplier files do not agree on
   * column order any more than they agree on how to punctuate a part number.
   * Falling back to the first three in order is what a file with no headings
   * can be read as, and the preview above the upload button is there so a
   * wrong guess is seen before it becomes prices.
   */
  private toRows(rows: string[][]): PriceRowInput[] {
    if (rows.length === 0) return [];

    const header = rows[0].map((c) => c.trim());
    const looksLikeHeader =
      HEADER_WORDS.test(header[0] ?? '') || header.some((c) => PRICE_WORDS.test(c));

    let partAt = 0;
    let priceAt = 1;
    let currencyAt = header.findIndex((c) => CURRENCY_WORDS.test(c));

    if (looksLikeHeader) {
      const price = header.findIndex((c) => PRICE_WORDS.test(c));
      if (price >= 0) priceAt = price;

      const found = header.findIndex((c) => HEADER_WORDS.test(c));
      if (found >= 0) {
        partAt = found;
      } else {
        // Headed file, price column identified, but nothing that reads like a
        // part-number heading. Column 0 is the usual guess and is wrong often
        // enough — a description column sits there in plenty of supplier
        // exports — so take the first column that is not one of the two we did
        // recognise instead.
        const firstFree = header.findIndex((_, i) => i !== priceAt && i !== currencyAt);
        partAt = firstFree >= 0 ? firstFree : 0;
      }
    } else if (currencyAt < 0 && (rows[0][2] ?? '').trim().length > 0) {
      // No headings, but a third column that is filled: treat it as currency,
      // which is the order the upload note asks for.
      currencyAt = 2;
    }

    const body = looksLikeHeader ? rows.slice(1) : rows;

    const out: PriceRowInput[] = [];

    for (const r of body) {
      const partNumber = (r[partAt] ?? '').trim();
      if (!partNumber) continue;

      // An empty cell is not a price of zero. Number('') is 0, so reading it
      // straight would quietly set that part's cost to nothing and sell it at
      // pure markup on top of nothing. A blank is a row with no price in it,
      // and it is dropped rather than priced.
      const raw = (r[priceAt] ?? '').toString().trim();
      if (!raw) continue;

      const price = Number(raw.replace(/[^0-9.,-]/g, '').replace(',', '.'));
      if (!Number.isFinite(price)) continue;

      out.push({
        partNumber,
        price,
        currency: currencyAt >= 0 ? (r[currencyAt] ?? '').trim() || null : null,
      });
    }

    return out;
  }

  // ---------- Acting on them ----------

  protected async upload(): Promise<void> {
    if (!this.name().trim()) {
      this.error.set('Give the list a name.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const res = await this.admin.uploadPriceList({
        name: this.name().trim(),
        description: this.description().trim() || null,
        sourceName: this.fileName(),
        rows: this.parsed(),
      });
      this.result.set(res);
      this.parsed.set([]);
      this.name.set('');
      this.description.set('');
      this.notice.set(`"${res.list.name}" is saved and switched off. Activate it when you are ready.`);
      this.load();
    } catch (err: any) {
      this.error.set(err?.error?.error ?? 'Could not upload that list.');
    } finally {
      this.busy.set(false);
    }
  }

  protected async setActive(list: AdminPriceList, active: boolean): Promise<void> {
    this.busyId.set(list.id);
    this.error.set(null);
    try {
      await this.admin.updatePriceList(list.id, { active });
      this.notice.set(
        active
          ? `"${list.name}" is now setting purchase prices. Any other list has been switched off.`
          : `"${list.name}" is off. Every part it covered is back on its own stored price.`
      );
      this.load();
    } catch (err: any) {
      this.error.set(err?.error?.error ?? 'Could not change that list.');
    } finally {
      this.busyId.set(null);
    }
  }

  protected async rename(list: AdminPriceList): Promise<void> {
    const next = prompt('Name for this price list', list.name);
    if (next === null || next.trim() === list.name) return;

    this.busyId.set(list.id);
    this.error.set(null);
    try {
      await this.admin.updatePriceList(list.id, { name: next.trim() });
      this.load();
    } catch (err: any) {
      this.error.set(err?.error?.error ?? 'Could not rename that list.');
    } finally {
      this.busyId.set(null);
    }
  }

  protected async remove(list: AdminPriceList): Promise<void> {
    if (!confirm(`Delete "${list.name}" and its ${list.itemCount} prices? This cannot be undone.`)) {
      return;
    }
    this.busyId.set(list.id);
    this.error.set(null);
    try {
      await this.admin.deletePriceList(list.id);
      if (this.expandedId() === list.id) this.expandedId.set(null);
      this.notice.set(`"${list.name}" is deleted.`);
      this.load();
    } catch (err: any) {
      this.error.set(err?.error?.error ?? 'Could not delete that list.');
    } finally {
      this.busyId.set(null);
    }
  }

  protected toggleItems(id: string): void {
    if (this.expandedId() === id) {
      this.expandedId.set(null);
      return;
    }
    this.expandedId.set(id);
    this.items.set([]);
    this.itemsLoading.set(true);
    this.admin
      .priceList(id)
      .then((res) => {
        this.items.set(res.items);
        this.itemsLoading.set(false);
      })
      .catch(() => {
        this.error.set('Could not load those prices.');
        this.itemsLoading.set(false);
      });
  }
}
