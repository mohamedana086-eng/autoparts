import { NextResponse } from 'next/server';
import { sql } from '@/lib/sql';

/**
 * Read at request time, not at build time.
 *
 * This handler takes nothing from the request — no cookie, no query string —
 * so Next reasons that its answer cannot vary and prerenders it into the
 * bundle. That is true of the handler and false of the database it reads: a
 * system added or renamed in the admin would never appear, because the
 * deployed response was decided when the build ran and nothing re-runs it.
 *
 * Every other route here is dynamic by accident, having touched a cookie or a
 * search param. These three ask for nothing, so they have to say so.
 */
export const dynamic = 'force-dynamic';

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
