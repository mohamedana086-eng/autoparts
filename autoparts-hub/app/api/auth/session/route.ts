import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/auth/session — who the caller is, plus the tier their prices use.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ user: null });

  const category = session.categoryId
    ? await prisma.clientCategory.findUnique({ where: { id: session.categoryId } })
    : null;

  return NextResponse.json({
    user: {
      id: session.userId,
      name: session.name,
      role: session.role,
      tierName: category?.name ?? 'Retail',
    },
  });
}
