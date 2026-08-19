import { NextResponse } from 'next/server';
import { vehicleTree } from '@/lib/vehicles';

// GET /api/vehicles — the whole make/model/variant tree for the picker.
// Small enough to send in one go; paginate here if the list ever grows.
export async function GET() {
  return NextResponse.json({ makes: await vehicleTree() });
}
