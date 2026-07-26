import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LayoutDashboard, Users, SlidersHorizontal, Package, ClipboardList, UserCog } from 'lucide-react';
import { getSession } from '@/lib/auth';

const navItems = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/clients', label: 'Clients', icon: UserCog },
  { href: '/admin/client-categories', label: 'Client categories', icon: Users },
  { href: '/admin/markup-rules', label: 'Markup rules', icon: SlidersHorizontal },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    redirect('/login?next=/admin');
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 grid md:grid-cols-[220px_1fr] gap-8">
      <aside>
        <p className="font-display font-bold text-sm mb-4 text-mute uppercase tracking-widest">Admin panel</p>
        <nav className="grid gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2.5 px-3 py-2 rounded-plate text-sm text-mute hover:text-paper hover:bg-ink-panel transition-colors"
            >
              <item.icon size={16} />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-8 grid gap-1 text-xs text-mute">
          <p className="uppercase tracking-widest font-display font-bold mb-1">Reference</p>
          <span className="flex items-center gap-2"><Package size={13} /> Product catalog</span>
          <span className="flex items-center gap-2"><ClipboardList size={13} /> Orders</span>
        </div>
      </aside>
      <section>{children}</section>
    </div>
  );
}
