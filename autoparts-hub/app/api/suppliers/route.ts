import { NextResponse } from 'next/server';
import { listSuppliers } from '@/lib/suppliers';

// GET /api/suppliers — everyone we buy from, for the directory page.
export async function GET() {
  return NextResponse.json({ suppliers: await listSuppliers() });
}
