'use server';

import { prisma } from '@/lib/db';
import { hashPassword, verifyPassword, createSession, destroySession } from '@/lib/auth';
import { redirect } from 'next/navigation';

export interface AuthFormState {
  error?: string;
}

export async function registerAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const name = String(formData.get('name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const role = String(formData.get('role') ?? 'RETAIL') as 'B2B' | 'RETAIL';
  const city = String(formData.get('city') ?? '').trim() || null;

  if (!name || !email || !password) return { error: 'Please fill in all fields.' };
  if (password.length < 6) return { error: 'Password must be at least 6 characters.' };
  if (role !== 'B2B' && role !== 'RETAIL') return { error: 'Invalid account type.' };

  const existing = await prisma.client.findUnique({ where: { email } });
  if (existing) return { error: 'An account with this email already exists.' };

  // New accounts start on the Retail tier. B2B applicants are flagged for
  // an admin to review and move onto a negotiated pricing tier from
  // /admin/clients — they still get a working account in the meantime.
  const retailCategory = await prisma.clientCategory.findFirst({ where: { name: 'Retail' } });

  const passwordHash = await hashPassword(password);
  const client = await prisma.client.create({
    data: { name, email, city, role, passwordHash, categoryId: retailCategory?.id ?? null },
  });

  await createSession({ id: client.id, role: client.role, categoryId: client.categoryId, name: client.name });
  redirect(client.role === 'ADMIN' ? '/admin' : '/');
}

export async function loginAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) return { error: 'Please enter your email and password.' };

  const client = await prisma.client.findUnique({ where: { email } });
  if (!client || !client.passwordHash) return { error: 'Invalid email or password.' };

  const valid = await verifyPassword(password, client.passwordHash);
  if (!valid) return { error: 'Invalid email or password.' };

  await createSession({ id: client.id, role: client.role, categoryId: client.categoryId, name: client.name });
  redirect(client.role === 'ADMIN' ? '/admin' : '/');
}

export async function logoutAction() {
  await destroySession();
  redirect('/login');
}
