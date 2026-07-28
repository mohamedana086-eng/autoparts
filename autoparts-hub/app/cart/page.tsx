'use client';

import Link from 'next/link';
import { Minus, Plus, Trash2, Clock } from 'lucide-react';
import { useCart } from '@/components/cart-store';

export default function CartPage() {
  const { items, count, total, ready, setQty, remove, clear } = useCart();

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <div className="flex items-baseline justify-between mb-8">
        <h1 className="font-display text-2xl font-bold">Your cart</h1>
        {ready && count > 0 && (
          <span className="text-xs text-mute font-mono">
            {count} item{count === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {!ready ? (
        <div className="grid gap-3" aria-hidden>
          {[0, 1].map((i) => (
            <div key={i} className="border border-ink-line rounded-plate bg-ink-panel h-24 animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="border border-dashed border-ink-line rounded-plate p-12 text-center">
          <p className="text-mute text-sm">Your cart is empty.</p>
          <Link
            href="/"
            className="inline-block mt-4 text-signal hover:underline text-sm"
          >
            Browse the catalog
          </Link>
        </div>
      ) : (
        <>
          <div className="grid gap-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="border border-ink-line rounded-plate bg-ink-panel p-4 grid grid-cols-1 sm:grid-cols-[auto_1fr_auto] gap-4 items-center"
              >
                <Link href={`/product/${item.id}`} className="plate relative rounded-plate px-4 py-2 w-fit">
                  <p className="text-[9px] text-mute uppercase tracking-wider">{item.manufacturer}</p>
                  <p className="font-mono font-semibold text-sm">{item.partNumber}</p>
                </Link>

                <div className="min-w-0">
                  <Link href={`/product/${item.id}`} className="font-medium hover:text-signal transition-colors">
                    {item.name}
                  </Link>
                  <p className="text-xs text-mute mt-1 flex items-center gap-1">
                    <Clock size={12} /> {item.stockDays} day{item.stockDays === 1 ? '' : 's'} delivery
                  </p>
                  <p className="text-xs text-mute mt-1 font-mono">€{item.unitPrice.toFixed(2)} each</p>
                </div>

                <div className="flex items-center gap-4 justify-between sm:justify-end">
                  <div className="flex items-center border border-ink-line rounded-plate">
                    <button
                      type="button"
                      onClick={() => setQty(item.id, item.qty - 1)}
                      className="px-2 py-1.5 text-mute hover:text-paper transition-colors"
                      aria-label={`Decrease quantity of ${item.name}`}
                    >
                      <Minus size={14} />
                    </button>
                    <span className="font-mono text-sm w-8 text-center" aria-live="polite">
                      {item.qty}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQty(item.id, item.qty + 1)}
                      className="px-2 py-1.5 text-mute hover:text-paper transition-colors"
                      aria-label={`Increase quantity of ${item.name}`}
                    >
                      <Plus size={14} />
                    </button>
                  </div>

                  <p className="font-mono font-bold text-signal w-20 text-right">
                    €{(item.unitPrice * item.qty).toFixed(2)}
                  </p>

                  <button
                    type="button"
                    onClick={() => remove(item.id)}
                    className="text-mute hover:text-alert transition-colors"
                    aria-label={`Remove ${item.name} from cart`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="border border-ink-line rounded-plate bg-ink-panel mt-6 p-5">
            <div className="flex items-baseline justify-between">
              <span className="font-display font-semibold">Total</span>
              <span className="font-mono text-2xl font-bold text-signal">€{total.toFixed(2)}</span>
            </div>
            <p className="text-[11px] text-mute mt-2">
              Prices are the ones quoted for your tier when each part was added. Submitting
              orders is not wired up yet — this cart is saved in your browser only.
            </p>
          </div>

          <div className="flex items-center justify-between mt-6">
            <Link href="/" className="text-sm text-signal hover:underline">
              Continue shopping
            </Link>
            <button
              type="button"
              onClick={clear}
              className="text-xs text-mute hover:text-alert transition-colors"
            >
              Clear cart
            </button>
          </div>
        </>
      )}
    </div>
  );
}
