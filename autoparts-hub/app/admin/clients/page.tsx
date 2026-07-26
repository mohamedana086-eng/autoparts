import { prisma } from '@/lib/db';
import { updateClientAccount } from '@/app/admin/actions';

const roleLabel: Record<string, string> = {
  ADMIN: 'Admin',
  B2B: 'Trade / B2B',
  RETAIL: 'Retail',
};

export default async function AdminClientsPage() {
  const [clients, categories] = await Promise.all([
    prisma.client.findMany({ include: { category: true }, orderBy: { createdAt: 'desc' } }),
    prisma.clientCategory.findMany(),
  ]);

  return (
    <div>
      <h1 className="font-display text-2xl font-bold mb-1">Clients</h1>
      <p className="text-sm text-mute mb-6 max-w-2xl">
        Every account is listed here, including self-registered Trade / B2B applicants — they
        start on the Retail tier until you assign them a negotiated pricing category below.
      </p>

      <div className="border border-ink-line rounded-plate overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="bg-ink-panel text-mute text-xs uppercase tracking-wider text-left">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Login</th>
              <th className="px-4 py-3 font-medium">Role &amp; pricing tier</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id} className="border-t border-ink-line hover:bg-ink-panel/60">
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3 text-mute font-mono text-xs">{c.email}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] font-mono uppercase px-2 py-1 rounded-plate border ${
                    c.passwordHash ? 'border-stock text-stock' : 'border-ink-line text-mute'
                  }`}>
                    {c.passwordHash ? 'enabled' : 'no login'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <form action={updateClientAccount.bind(null, c.id)} className="flex items-center gap-2">
                    <select name="role" defaultValue={c.role} className="bg-ink border border-ink-line rounded-plate px-2 py-1 text-xs text-paper">
                      {Object.entries(roleLabel).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                    <select name="categoryId" defaultValue={c.categoryId ?? ''} className="bg-ink border border-ink-line rounded-plate px-2 py-1 text-xs text-paper">
                      <option value="">— none —</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                    <button className="text-[10px] font-mono uppercase px-2 py-1 rounded-plate border border-signal text-signal hover:bg-signal/10 transition-colors">
                      Save
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
