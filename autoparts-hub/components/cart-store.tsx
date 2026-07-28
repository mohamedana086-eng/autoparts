'use client';

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react';

export interface CartItem {
  id: string;
  partNumber: string;
  name: string;
  manufacturer: string;
  /** Tier price resolved on the server when the part was added. Kept as-is
   *  so the cart shows what was quoted, the way ClientCategory.shelfLifeDays
   *  describes holding a price. */
  unitPrice: number;
  stockDays: number;
  qty: number;
}

interface CartContextValue {
  items: CartItem[];
  count: number;
  total: number;
  /** False until localStorage has been read. Render nothing cart-shaped
   *  before this flips, or the server's empty cart will not match. */
  ready: boolean;
  add: (item: Omit<CartItem, 'qty'>, qty?: number) => void;
  setQty: (id: string, qty: number) => void;
  remove: (id: string) => void;
  clear: () => void;
}

const STORAGE_KEY = 'aph_cart';
const MAX_QTY = 999;

const CartContext = createContext<CartContextValue | null>(null);

function parseStored(raw: string): CartItem[] {
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];
  // Anything hand-edited or written by an older build gets dropped rather
  // than rendering as NaN prices further down.
  return parsed.filter(
    (i): i is CartItem =>
      i && typeof i.id === 'string' && typeof i.qty === 'number' && Number.isFinite(i.unitPrice)
  );
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(parseStored(raw));
    } catch {
      // unreadable or corrupt storage — start empty rather than crash
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // quota exceeded or storage blocked — cart still works for this tab
    }
  }, [items, ready]);

  const add = useCallback((item: Omit<CartItem, 'qty'>, qty = 1) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.id === item.id);
      if (!existing) return [...prev, { ...item, qty: Math.min(qty, MAX_QTY) }];
      return prev.map((i) =>
        i.id === item.id ? { ...i, qty: Math.min(i.qty + qty, MAX_QTY) } : i
      );
    });
  }, []);

  const setQty = useCallback((id: string, qty: number) => {
    setItems((prev) =>
      qty <= 0
        ? prev.filter((i) => i.id !== id)
        : prev.map((i) => (i.id === id ? { ...i, qty: Math.min(qty, MAX_QTY) } : i))
    );
  }, []);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      ready,
      count: items.reduce((n, i) => n + i.qty, 0),
      total: items.reduce((sum, i) => sum + i.unitPrice * i.qty, 0),
      add,
      setQty,
      remove,
      clear,
    }),
    [items, ready, add, setQty, remove, clear]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}
