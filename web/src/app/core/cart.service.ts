import { HttpClient } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { EMPTY, Subject, catchError, debounceTime, firstValueFrom, switchMap } from 'rxjs';
import { AuthService } from './auth.service';
import type { SavedBasket, SavedBasketLine } from './api.models';

export interface CartItem {
  id: string;
  partNumber: string;
  name: string;
  manufacturer: string;
  /** Tier price resolved by the API when the part was added, held as quoted. */
  unitPrice: number;
  stockDays: number;
  qty: number;
  /**
   * Units that may be held of this part, as the API last reported them.
   *
   * A ceiling for the quantity controls, not a guarantee: it was true when the
   * page loaded and someone else can buy the last one in between. Checkout
   * re-checks under a row lock and refuses if it has moved, which is what
   * actually protects the stock — this only keeps the customer from typing a
   * number that was never going to work.
   */
  available: number;
}

const STORAGE_KEY = 'aph_cart';
const MAX_QTY = 999;

/** What a quantity change actually did, so the page can say so. */
export interface QuantityOutcome {
  /** What the line holds now. Zero means it is not in the basket. */
  qty: number;
  /** True when less was granted than asked for, because stock ran out. */
  capped: boolean;
  /** What the part had when the change was applied. */
  available: number;
}

/** Long enough that typing a quantity is one request, short enough that a tab
 *  closed straight after a change has already sent it. */
const PUSH_DEBOUNCE_MS = 600;

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

function fromServer(line: SavedBasketLine): CartItem {
  return {
    id: line.productId,
    partNumber: line.partNumber,
    name: line.name,
    manufacturer: line.manufacturer,
    unitPrice: line.unitPrice,
    stockDays: line.stockDays,
    qty: Math.min(line.quantity, MAX_QTY),
    available: line.available,
  };
}

/**
 * Combines what this browser was holding with what the account had saved.
 *
 * A union, so signing in never costs the customer a line: parts added while
 * anonymous survive, and a basket left on another device comes back. Where
 * both know a part, the larger quantity wins rather than the sum — the same
 * basket synced twice would otherwise double every line the two already
 * agreed on, and doubling silently is the worse failure.
 *
 * The server's own figures win on price and description: they were resolved
 * against the tier on this request, while the local copy could be from before
 * the customer signed in, and so priced at Retail.
 *
 * Exported for its tests. It is the one piece of this service that is a plain
 * function of its inputs, and the rule it encodes — union, larger quantity,
 * server prices — is the part worth pinning down.
 */
export function mergeBaskets(local: CartItem[], server: SavedBasketLine[]): CartItem[] {
  const byId = new Map(local.map((i) => [i.id, i]));

  for (const line of server) {
    const mine = byId.get(line.productId);
    const wanted = mine ? Math.max(mine.qty, line.quantity) : line.quantity;

    byId.set(line.productId, {
      ...fromServer(line),
      // Held to what the part has as well as to the ceiling: a basket saved
      // when there were ten of something has no claim on it now there are two.
      qty: Math.min(wanted, line.available, MAX_QTY),
    });
  }

  // A merged line can come out at zero — the part sold out while the basket
  // sat — and a line for none of something is not a line.
  return [...byId.values()].filter((i) => i.qty > 0);
}

/**
 * The basket.
 *
 * `localStorage` is still the copy that renders — it is instant, it works
 * signed out, and it holds the display fields the API does not store. On top
 * of that, a signed-in basket is mirrored to `/api/cart`, which is what lets
 * it follow the customer to another device and what puts it on the admin's
 * open-baskets list.
 *
 * Only ids and quantities ever go up. Prices come back down resolved from the
 * caller's tier and are never sent, so nothing here can decide what a basket
 * costs — checkout re-resolves every line regardless.
 */
@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private readonly _items = signal<CartItem[]>(this.load());

  readonly items = this._items.asReadonly();
  readonly count = computed(() => this._items().reduce((n, i) => n + i.qty, 0));
  readonly total = computed(() => this._items().reduce((sum, i) => sum + i.unitPrice * i.qty, 0));

  private readonly pushes = new Subject<void>();

  /**
   * Whether the server copy has been merged in yet.
   *
   * Until it has, a local change must not be pushed: the first render of a
   * signed-in session happens before the fetch lands, and pushing then would
   * replace a basket saved on another device with whatever this browser
   * happened to have — including nothing at all.
   */
  private adopted = false;

  /** Who the last sync ran for, so the effect fires on a change of account
   *  rather than on every unrelated signal read. */
  private syncedUserId: string | null = null;

  constructor() {
    effect(() => {
      const items = this._items();
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      } catch {
        // quota exceeded or storage blocked — the cart still works this session
      }
      if (this.adopted) this.pushes.next();
    });

    effect(() => {
      const id = this.auth.user()?.id ?? null;
      if (id === this.syncedUserId) return;
      this.syncedUserId = id;

      if (id) void this.adopt();
      else this.abandon();
    });

    this.pushes
      .pipe(
        debounceTime(PUSH_DEBOUNCE_MS),
        // switchMap so a slower earlier PUT cannot land after a newer one and
        // put back a line the customer has just removed.
        switchMap(() =>
          this.http
            .put<SavedBasket>('/api/cart', { items: this.payload() })
            .pipe(catchError(() => EMPTY))
        )
      )
      .subscribe();
  }

  private load(): CartItem[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? parseStored(raw) : [];
    } catch {
      return [];
    }
  }

  /** Ids and quantities only — see the class comment. */
  private payload(): Array<{ productId: string; quantity: number }> {
    return this._items().map((i) => ({ productId: i.id, quantity: i.qty }));
  }

  /** Pulls the account's saved basket in and merges this browser's into it. */
  private async adopt(): Promise<void> {
    let saved: SavedBasket;
    try {
      saved = await firstValueFrom(this.http.get<SavedBasket>('/api/cart'));
    } catch {
      // Offline, or the session went away between the two calls. Keep what is
      // in this browser and leave `adopted` false so nothing is pushed over
      // the saved copy on the strength of a failed read.
      return;
    }

    this._items.update((local) => mergeBaskets(local, saved.items));
    this.adopted = true;
    // Send the merged basket straight back, so the lines added while signed
    // out are saved rather than living only in this browser.
    this.pushes.next();
  }

  /**
   * Signing out empties the basket here.
   *
   * The account's copy is untouched on the server and comes back on the next
   * sign-in, so nothing is lost — and leaving it on screen would hand the next
   * person at a shared workshop terminal the last customer's basket.
   */
  private abandon(): void {
    this.adopted = false;
    this._items.set([]);
  }

  /**
   * Adds to the basket, up to what the part actually has.
   *
   * Returns what happened rather than silently doing less than was asked: a
   * quantity that quietly becomes a smaller one is the kind of thing a
   * customer notices at the till, and the caller needs to be able to say
   * "only four available" at the moment they clicked.
   */
  add(item: Omit<CartItem, 'qty'>, qty = 1): QuantityOutcome {
    const ceiling = Math.min(item.available, MAX_QTY);
    const held = this._items().find((i) => i.id === item.id)?.qty ?? 0;
    const wanted = held + qty;
    const granted = Math.min(wanted, ceiling);

    if (granted <= 0) {
      return { qty: held, capped: true, available: item.available };
    }

    this._items.update((prev) => {
      const existing = prev.find((i) => i.id === item.id);
      if (!existing) return [...prev, { ...item, qty: granted }];
      return prev.map((i) =>
        i.id === item.id ? { ...i, ...item, qty: granted } : i
      );
    });

    return { qty: granted, capped: granted < wanted, available: item.available };
  }

  setQty(id: string, qty: number): QuantityOutcome {
    const line = this._items().find((i) => i.id === id);
    if (!line) return { qty: 0, capped: false, available: 0 };

    if (qty <= 0) {
      this._items.update((prev) => prev.filter((i) => i.id !== id));
      return { qty: 0, capped: false, available: line.available };
    }

    const granted = Math.min(qty, line.available, MAX_QTY);
    this._items.update((prev) => prev.map((i) => (i.id === id ? { ...i, qty: granted } : i)));

    return { qty: granted, capped: granted < qty, available: line.available };
  }

  remove(id: string): void {
    this._items.update((prev) => prev.filter((i) => i.id !== id));
  }

  clear(): void {
    this._items.set([]);
  }
}
