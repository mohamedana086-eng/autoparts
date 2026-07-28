import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword, createSession, toRole } from '@/lib/auth';

// POST /api/auth/register { name, email, password, role, city }
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const name = String(body.name ?? '').trim();
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  const role = String(body.role ?? 'RETAIL');
  const city = String(body.city ?? '').trim() || null;

  if (!name || !email || !password) {
    return NextResponse.json({ error: 'Please fill in all fields.' }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 });
  }
  // Self-registration cannot mint an admin, whatever the request body says.
  if (role !== 'B2B' && role !== 'RETAIL') {
    return NextResponse.json({ error: 'Invalid account type.' }, { status: 400 });
  }

  const existing = await prisma.client.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 });
  }

  // New accounts start on the Retail tier. B2B applicants are reviewed by an
  // admin from /admin/clients and moved onto a negotiated tier later.
  const retail = await prisma.clientCategory.findFirst({ where: { name: 'Retail' } });

  const client = await prisma.client.create({
    data: {
      name,
      email,
      city,
      role,
      passwordHash: await hashPassword(password),
      categoryId: retail?.id ?? null,
    },
  });

  await createSession(client);

  return NextResponse.json({
    user: { id: client.id, name: client.name, email: client.email, role: toRole(client.role) },
  }, { status: 201 });
}
