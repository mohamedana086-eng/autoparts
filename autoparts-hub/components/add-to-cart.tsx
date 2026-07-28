'use client';

import { useEffect, useState } from 'react';
import { Check, ShoppingCart } from 'lucide-react';
import { useCart, type CartItem } from './cart-store';

export function AddToCart({ item }: { item: Omit<CartItem, 'qty'> }) {
  const { add } = useCart();
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (!added) return;
    const t = window.setTimeout(() => setAdded(false), 1600);
    return () => window.clearTimeout(t);
  }, [added]);

  return (
    <button
      type="button"
      onClick={() => {
        add(item);
        setAdded(true);
      }}
      className="w-full mt-6 bg-signal hover:bg-signal-dim text-ink font-display font-bold py-3 rounded-plate transition-colors flex items-center justify-center gap-2"
    >
      {added ? (
        <><Check size={16} /> Added to cart</>
      ) : (
        <><ShoppingCart size={16} /> Add to cart</>
      )}
    </button>
  );
}
