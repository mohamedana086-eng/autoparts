import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { CartService } from '../core/cart.service';

interface BulkRow {
  input: string;
  found: boolean;
  matchedOn?: 'part-number' | 'interchange';
  matchedVia?: string | null;
  product: {
    id: string;
    partNumber: string;
    name: string;
    manufacturer: string;
    system: string;
    stockDays: number;
    price: number;
    appliedRule: string | null;
  } | null;
}

interface BulkResponse {
  tierName: string;
  isLoggedIn: boolean;
  submitted: number;
  truncated: boolean;
  maxRows: number;
  foundCount: number;
  missingCount: number;
  total: number;
  rows: BulkRow[];
}

/** Header words that mean the first row labels the column rather than being data. */
const HEADER_WORDS = /^(part|item|code|ref|reference|number|no\.?|sku|oe|oem|artikel)/i;

@Component({
  selector: 'app-bulk',
  imports: [RouterLink],
  template: `
    <div class="max-w-5xl mx-auto px-6 py-10">
      <h1 class="font-display text-2xl font-bold mb-1">Check a list of part numbers</h1>
      <p class="text-sm text-mute mb-8 max-w-2xl">
        Upload a spreadsheet — or paste the numbers — and we will tell you which ones we
        carry and what they cost on your account. Numbers can be written with or without
        spaces and dots, and a number we do not stock still matches if one of our parts
        replaces it.
      </p>

      @if (error()) {
        <div class="note note-alert p-3 mb-4">{{ error() }}</div>
      }

      <div class="grid md:grid-cols-2 gap-4 mb-8">
        <div class="panel p-5">
          <h2 class="font-display font-semibold text-sm mb-1">Upload a file</h2>
          <p class="text-xs text-mute mb-4">.xlsx or .csv — part numbers in the first column.</p>
          <input type="file" accept=".xlsx,.xls,.csv" (change)="onFile($event)"
                 aria-label="Spreadsheet of part numbers"
                 class="block w-full text-xs text-mute file:mr-3 file:py-2 file:px-4 file:rounded-plate file:border-0 file:bg-signal file:text-ink file:font-display file:font-bold file:text-xs hover:file:bg-signal-dim file:cursor-pointer" />
          @if (fileName()) {
            <p class="text-xs text-mute mt-3">
              <span class="text-paper">{{ fileName() }}</span> — {{ parsedCount() }} number{{ parsedCount() === 1 ? '' : 's' }} read
            </p>
          }
        </div>

        <div class="panel p-5">
          <h2 class="font-display font-semibold text-sm mb-1">Or paste them</h2>
          <p class="text-xs text-mute mb-4">One per line.</p>
          <textarea rows="4" [value]="pasted()" (input)="pasted.set($any($event.target).value)"
                    aria-label="Paste part numbers"
                    placeholder="0 986 424 815&#10;09.9772.11&#10;W 712/75"
                    class="w-full field font-mono"></textarea>
          <button type="button" (click)="checkPasted()" [disabled]="busy()"
                  class="mt-3 btn-primary text-sm px-4 py-2">
            {{ busy() ? 'Checking…' : 'Check list' }}
          </button>
        </div>
      </div>

      @if (result(); as res) {
        <div class="panel p-5 mb-4 flex flex-wrap items-center gap-x-8 gap-y-2">
          <p class="text-sm">
            <span class="font-mono text-stock font-bold">{{ res.foundCount }}</span> of
            <span class="font-mono">{{ res.submitted }}</span> in stock
            @if (res.missingCount > 0) {
              · <span class="font-mono text-mute">{{ res.missingCount }}</span> not carried
            }
          </p>
          <p class="text-sm">
            Total <span class="font-mono text-signal font-bold">€{{ res.total.toFixed(2) }}</span>
            <span class="text-xs text-mute">at {{ res.tierName }} tier</span>
          </p>
          @if (res.foundCount > 0) {
            <button type="button" (click)="addAll()"
                    class="ml-auto btn-primary text-sm px-4 py-2">
              {{ added() ? 'Added to cart' : 'Add all ' + res.foundCount + ' to cart' }}
            </button>
          }
        </div>

        @if (res.truncated) {
          <p class="text-xs text-alert mb-4">
            Only the first {{ res.maxRows }} numbers were checked.
          </p>
        }

        @if (!res.isLoggedIn) {
          <p class="text-xs text-mute mb-4">
            Prices are Retail — <a routerLink="/login" class="link-signal">sign in</a>
            to price this list on your account.
          </p>
        }

        <div class="border border-ink-line rounded-plate overflow-x-auto">
          <table class="w-full text-sm min-w-[720px]">
            <thead>
              <tr class="bg-ink-panel text-mute text-xs uppercase tracking-wider text-left">
                <th class="px-4 py-3 font-medium">Your number</th>
                <th class="px-4 py-3 font-medium">Part</th>
                <th class="px-4 py-3 font-medium">Brand</th>
                <th class="px-4 py-3 font-medium">Delivery</th>
                <th class="px-4 py-3 font-medium text-right">Price</th>
                <th class="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              @for (row of res.rows; track $index) {
                <tr class="border-t border-ink-line" [class.opacity-60]="!row.found">
                  <td class="px-4 py-3 font-mono text-xs">{{ row.input }}</td>
                  <td class="px-4 py-3">
                    @if (row.found && row.product) {
                      <a [routerLink]="['/product', row.product.id]" class="hover:text-signal transition-colors">
                        {{ row.product.name }}
                      </a>
                      <span class="block font-mono text-[11px] text-mute">{{ row.product.partNumber }}</span>
                      @if (row.matchedOn === 'interchange') {
                        <span class="block text-[11px] text-signal">replaces your number</span>
                      }
                    } @else {
                      <span class="text-mute text-xs">Not carried</span>
                    }
                  </td>
                  <td class="px-4 py-3 text-mute text-xs">{{ row.product?.manufacturer ?? '—' }}</td>
                  <td class="px-4 py-3 font-mono text-xs">
                    {{ row.product ? row.product.stockDays + 'd' : '—' }}
                  </td>
                  <td class="px-4 py-3 text-right font-mono">
                    {{ row.product ? '€' + row.product.price.toFixed(2) : '—' }}
                  </td>
                  <td class="px-4 py-3 text-right">
                    @if (row.found && row.product) {
                      <button type="button" (click)="addOne(row)"
                              class="text-xs font-mono uppercase link-signal"
                              [attr.aria-label]="'Add ' + row.product.partNumber + ' to cart'">Add</button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
})
export class BulkPage {
  private readonly http = inject(HttpClient);
  private readonly cart = inject(CartService);

  protected readonly result = signal<BulkResponse | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly added = signal(false);
  protected readonly fileName = signal<string | null>(null);
  protected readonly parsedCount = signal(0);
  protected readonly pasted = signal('');

  protected async onFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.fileName.set(file.name);
    this.error.set(null);

    try {
      const numbers = file.name.toLowerCase().endsWith('.csv')
        ? this.fromCsv(await file.text())
        : await this.fromSpreadsheet(file);

      this.parsedCount.set(numbers.length);
      if (numbers.length === 0) {
        this.error.set('No part numbers found in the first column of that file.');
        this.result.set(null);
        return;
      }
      await this.check(numbers);
    } catch {
      this.error.set('Could not read that file. Save it as .xlsx or .csv and try again.');
      this.result.set(null);
    }
  }

  /** Loaded on demand so the spreadsheet parser stays out of every other page.
   *
   *  Held on read-excel-file 5.x deliberately: 9.3.5 throws
   *  "readFiles(...).then is not a function" from inside the library on any
   *  workbook, through both its browser and node entries. */
  private async fromSpreadsheet(file: File): Promise<string[]> {
    const readXlsxFile = (await import('read-excel-file')).default;
    const rows = await readXlsxFile(file);
    return this.firstColumn(
      rows.map((row) => row.map((cell) => (cell == null ? '' : String(cell))))
    );
  }

  private fromCsv(text: string): string[] {
    const rows = text
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map((line) => line.split(/[,;\t]/).map((c) => c.trim().replace(/^"|"$/g, '')));
    return this.firstColumn(rows);
  }

  /** First column only, minus a header row if the sheet has one. */
  private firstColumn(rows: string[][]): string[] {
    const values = rows.map((r) => (r[0] ?? '').trim()).filter((v) => v.length > 0);
    if (values.length && HEADER_WORDS.test(values[0])) values.shift();
    return values;
  }

  protected async checkPasted(): Promise<void> {
    const numbers = this.pasted()
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (numbers.length === 0) {
      this.error.set('Paste at least one part number.');
      return;
    }
    this.fileName.set(null);
    await this.check(numbers);
  }

  private async check(partNumbers: string[]): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.added.set(false);
    try {
      const res = await firstValueFrom(
        this.http.post<BulkResponse>('/api/catalog/bulk', { partNumbers })
      );
      this.result.set(res);
    } catch (err: any) {
      this.error.set(err?.error?.error ?? 'Could not check that list.');
      this.result.set(null);
    } finally {
      this.busy.set(false);
    }
  }

  protected addOne(row: BulkRow): void {
    if (!row.product) return;
    this.cart.add({
      id: row.product.id,
      partNumber: row.product.partNumber,
      name: row.product.name,
      manufacturer: row.product.manufacturer,
      unitPrice: row.product.price,
      stockDays: row.product.stockDays,
    });
  }

  protected addAll(): void {
    for (const row of this.result()?.rows ?? []) this.addOne(row);
    this.added.set(true);
  }
}
