import { NextResponse } from 'next/server';
import { vehicleTree } from '@/lib/vehicles';

/** Read at request time — see the note in app/api/systems/route.ts. */
export const dynamic = 'force-dynamic';

// GET /api/vehicles — the whole make/model/variant tree for the picker.
// Small enough to send in one go; paginate here if the list ever grows.
export async function GET() {
  return NextResponse.json({ makes: await vehicleTree() });
}
