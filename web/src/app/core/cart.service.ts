import { Injectable, computed, effect, signal } from '@angular/core';

export interface CartItem {
  id: string;
  partNumber: string;
  name: string;
  manufacturer: string;
  /** Tier price resolved by the API when the part was added, held as quoted. */
  unitPrice: number;
  stockDays: number;
  qty: number;
}

const STORAGE_KEY = 'aph_cart';
const MAX_QTY = 999;

function parseStored(raw: string): CartItem[] {
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];
  // Drop anything hand-edited or written by an older build rather than
  // rendering it as a NaN price further down.
  return parsed.filter(
    (i: unknown): i is CartItem =>
      !!i &&
      typeof (i as CartItem).id === 'string' &&
      typeof (i as CartItem).qty === 'number' &&
      Number.isFinite((i as CartItem).unitPrice)
  );
}

@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly _items = signal<CartItem[]>(this.load());

  readonly items = this._items.asReadonly();
  readonly count = computed(() => this._items().reduce((n, i) => n + i.qty, 0));
  readonly total = computed(() => this._items().reduce((sum, i) => sum + i.unitPrice * i.qty, 0));

  constructor() {
    effect(() => {
      const items = this._items();
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      } catch {
        // quota exceeded or storage blocked — the cart still works this session
      }
    });
  }

  private load(): CartItem[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? parseStored(raw) : [];
    } catch {
      return [];
    }
  }

  add(item: Omit<CartItem, 'qty'>, qty = 1): void {
    this._items.update((prev) => {
      const existing = prev.find((i) => i.id === item.id);
      if (!existing) return [...prev, { ...item, qty: Math.min(qty, MAX_QTY) }];
      return prev.map((i) =>
        i.id === item.id ? { ...i, qty: Math.min(i.qty + qty, MAX_QTY) } : i
      );
    });
  }

  setQty(id: string, qty: number): void {
    this._items.update((prev) =>
      qty <= 0
        ? prev.filter((i) => i.id !== id)
        : prev.map((i) => (i.id === id ? { ...i, qty: Math.min(qty, MAX_QTY) } : i))
    );
  }

  remove(id: string): void {
    this._items.update((prev) => prev.filter((i) => i.id !== id));
  }

  clear(): void {
    this._items.set([]);
  }
}
