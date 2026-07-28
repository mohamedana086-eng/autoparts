import { NextResponse } from 'next/server';
import { destroySession } from '@/lib/auth';

// POST /api/auth/logout — clears the session cookie.
export async function POST() {
  await destroySession();
  return NextResponse.json({ ok: true });
}
