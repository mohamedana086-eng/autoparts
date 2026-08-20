import { NextResponse } from 'next/server';
import { listSuppliers } from '@/lib/suppliers';

/**
 * Read at request time — see the note in app/api/systems/route.ts.
 *
 * This one carried the sharpest version of the problem: the directory counts
 * how many parts each supplier sources, so a prerendered copy states a figure
 * that was true the day of the deploy and is quietly wrong from then on.
 */
export const dynamic = 'force-dynamic';

// GET /api/suppliers — everyone we buy from, for the directory page.
export async function GET() {
  return NextResponse.json({ suppliers: await listSuppliers() });
}
