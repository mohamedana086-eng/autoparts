import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { tierName } from '@/lib/clients';

// GET /api/auth/session — who the caller is, plus the tier their prices use.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ user: null });

  const tier = session.categoryId ? await tierName(session.categoryId) : null;

  return NextResponse.json({
    user: {
      id: session.userId,
      name: session.name,
      role: session.role,
      tierName: tier ?? 'Retail',
    },
  });
}
