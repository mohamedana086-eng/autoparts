import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyPassword, createSession, toRole } from '@/lib/auth';

// POST /api/auth/login { email, password }
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');

  if (!email || !password) {
    return NextResponse.json({ error: 'Please enter your email and password.' }, { status: 400 });
  }

  const client = await prisma.client.findUnique({ where: { email } });

  // Same message either way, so this cannot be used to enumerate accounts.
  if (!client || !client.passwordHash || !(await verifyPassword(password, client.passwordHash))) {
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
  }

  await createSession(client);

  return NextResponse.json({
    user: { id: client.id, name: client.name, email: client.email, role: toRole(client.role) },
  });
}
