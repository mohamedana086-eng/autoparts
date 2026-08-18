import { NextResponse } from 'next/server';
import { sql } from '@/lib/sql';

/** The columns this route reads. Written out because the query decides them,
 *  and a row shape nobody declared is one nobody can check. */
interface SystemRow {
  id: string;
  name: string;
  slug: string;
  icon: string;
}

// GET /api/systems — vehicle system tree for the storefront's browse grid.
export async function GET() {
  const systems = await sql<SystemRow>`
    SELECT "id", "name", "slug", "icon"
    FROM "VehicleSystem"
    ORDER BY "order" ASC
  `;

  return NextResponse.json({ systems });
}
