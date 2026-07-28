'use client';

import Link from 'next/link';
import { ShoppingCart } from 'lucide-react';
import { useCart } from './cart-store';

export function CartBadge() {
  const { count, ready } = useCart();
  const showCount = ready && count > 0;

  return (
    <Link
      href="/cart"
      className="hover:text-paper transition-colors flex items-center gap-1.5"
      aria-label={showCount ? `Cart, ${count} item${count === 1 ? '' : 's'}` : 'Cart'}
    >
      <span className="relative">
        <ShoppingCart size={18} />
        {showCount && (
          <span className="absolute -top-1.5 -right-2 bg-signal text-ink text-[10px] font-mono font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </span>
      <span className="hidden lg:inline">Cart</span>
    </Link>
  );
}
