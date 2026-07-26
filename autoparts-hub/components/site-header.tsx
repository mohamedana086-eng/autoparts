import Link from 'next/link';
import { Search, ShoppingCart, User, Wrench, LogOut } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { logoutAction } from '@/app/(auth)/actions';

export async function SiteHeader() {
  const session = await getSession();

  return (
    <header className="border-b border-ink-line bg-ink/95 backdrop-blur sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-col md:flex-row md:items-center gap-3 md:gap-6">
        {/* Row 1 on mobile: logo + icon-only actions. On desktop this is just the left/right ends. */}
        <div className="flex items-center justify-between md:justify-start md:contents">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-plate bg-signal flex items-center justify-center shrink-0">
              <Wrench size={16} strokeWidth={2.5} className="text-ink" />
            </div>
            <span className="font-display font-bold text-lg tracking-tight whitespace-nowrap">
              AutoParts<span className="text-signal">Hub</span>
            </span>
          </Link>

          <nav className="flex items-center gap-4 sm:gap-5 text-sm text-mute shrink-0 md:order-3">
            {session?.role === 'ADMIN' && (
              <Link href="/admin" className="hover:text-paper transition-colors hidden sm:inline">Admin</Link>
            )}

            {session ? (
              <>
                <span className="hidden lg:inline text-paper text-xs">Hi, {session.name.split(' ')[0]}</span>
                <form action={logoutAction}>
                  <button className="hover:text-paper transition-colors flex items-center gap-1.5" aria-label="Sign out">
                    <LogOut size={18} />
                    <span className="hidden lg:inline">Sign out</span>
                  </button>
                </form>
              </>
            ) : (
              <Link href="/login" className="hover:text-paper transition-colors flex items-center gap-1.5">
                <User size={18} />
                <span className="hidden lg:inline">Sign in</span>
              </Link>
            )}

            <button className="hover:text-paper transition-colors flex items-center gap-1.5" aria-label="Cart">
              <ShoppingCart size={18} />
              <span className="hidden lg:inline">Cart</span>
            </button>
          </nav>
        </div>

        {/* Row 2 on mobile, middle column on desktop: search bar gets its own full-width row so it never overflows */}
        <form action="/search" className="flex w-full md:flex-1 md:max-w-xl md:order-2">
          <div className="relative flex-1 min-w-0">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
            <input
              name="q"
              placeholder="Part number, e.g. 17138616418"
              className="w-full bg-ink-panel border border-ink-line rounded-l-plate pl-9 pr-3 py-2 text-sm font-mono placeholder:font-body placeholder:text-mute focus:outline-none focus:ring-1 focus:ring-signal"
            />
          </div>
          <button
            type="submit"
            className="bg-signal hover:bg-signal-dim transition-colors text-ink font-display font-bold text-sm px-5 rounded-r-plate shrink-0"
          >
            Find
          </button>
        </form>
      </div>
    </header>
  );
}
