import 'server-only';

/**
 * Shared shapes and validation for warehouses, stock levels and outlets.
 *
 * Here rather than in the route files for the same reason as
 * `admin-products.ts`: Next only lets a route module export its handlers, so
 * a helper exported from one breaks the generated route types.
 */

export interface WarehouseInput {
  code: string;
  name: string;
  city: string | null;
  address: string | null;
  active: boolean;
  priority: number;
}

export interface OutletInput {
  code: string;
  name: string;
  city: string | null;
  address: string | null;
  phone: string | null;
  warehouseId: string | null;
  active: boolean;
}

/** One warehouse's holding of one part, as the stock editor submits it. */
export interface StockRowInput {
  warehouseId: string;
  quantity: number;
  reserved: number;
  binLocation: string | null;
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** Codes are typed by hand and compared by eye, so they are stored uppercase. */
function readCode(raw: unknown): string {
  return String(raw ?? '').trim().toUpperCase();
}

function optional(raw: unknown): string | null {
  const value = String(raw ?? '').trim();
  return value || null;
}

export function readWarehouseInput(body: Record<string, unknown>): Result<WarehouseInput> {
  const code = readCode(body.code);
  const name = String(body.name ?? '').trim();

  if (!code) return { ok: false, error: 'A warehouse code is required.' };
  if (!name) return { ok: false, error: 'A warehouse name is required.' };

  // Blank means "leave it where it is", which for a new row is the default.
  const priority = body.priority === undefined || body.priority === null || body.priority === ''
    ? 0
    : Number(body.priority);
  if (!Number.isInteger(priority)) {
    return { ok: false, error: 'Priority must be a whole number.' };
  }

  return {
    ok: true,
    value: {
      code,
      name,
      city: optional(body.city),
      address: optional(body.address),
      active: body.active !== false,
      priority,
    },
  };
}

export function readOutletInput(body: Record<string, unknown>): Result<OutletInput> {
  const code = readCode(body.code);
  const name = String(body.name ?? '').trim();

  if (!code) return { ok: false, error: 'An outlet code is required.' };
  if (!name) return { ok: false, error: 'An outlet name is required.' };

  return {
    ok: true,
    value: {
      code,
      name,
      city: optional(body.city),
      address: optional(body.address),
      phone: optional(body.phone),
      warehouseId: optional(body.warehouseId),
      active: body.active !== false,
    },
  };
}

/**
 * Validates the whole stock table for one part.
 *
 * Submitted as a set rather than row by row: the editor shows every warehouse
 * at once, and one request that either takes all the counts or none of them
 * cannot leave a part half-recounted.
 */
export function readStockRows(body: Record<string, unknown>): Result<StockRowInput[]> {
  const raw = body.levels;
  if (!Array.isArray(raw)) return { ok: false, error: 'Expected a list of stock levels.' };

  const rows: StockRowInput[] = [];
  const seen = new Set<string>();

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      return { ok: false, error: 'Every stock level must be an object.' };
    }
    const row = entry as Record<string, unknown>;
    const warehouseId = String(row.warehouseId ?? '').trim();
    if (!warehouseId) return { ok: false, error: 'Every stock level needs a warehouse.' };

    // The database refuses a duplicate pair anyway; catching it here names the
    // warehouse instead of surfacing a constraint violation.
    if (seen.has(warehouseId)) {
      return { ok: false, error: 'A warehouse appears twice. Each may hold one count.' };
    }
    seen.add(warehouseId);

    const quantity = Number(row.quantity ?? 0);
    const reserved = Number(row.reserved ?? 0);

    if (!Number.isInteger(quantity) || quantity < 0) {
      return { ok: false, error: 'Quantity must be a whole number of zero or more.' };
    }
    if (!Number.isInteger(reserved) || reserved < 0) {
      return { ok: false, error: 'Reserved must be a whole number of zero or more.' };
    }
    // Mirrors the CHECK constraint, so the admin gets a sentence rather than a
    // database error. Promising more than is on the shelf is the mistake this
    // catches, and it is the easy one to make by editing quantity downwards.
    if (reserved > quantity) {
      return { ok: false, error: 'Reserved cannot exceed the quantity on the shelf.' };
    }

    rows.push({ warehouseId, quantity, reserved, binLocation: optional(row.binLocation) });
  }

  return { ok: true, value: rows };
}

export function serialiseWarehouse(w: {
  id: string; code: string; name: string; city: string | null; address: string | null;
  active: boolean; priority: number;
  stock?: { quantity: number; reserved: number }[];
  _count?: { outlets: number; stock: number };
}) {
  const quantity = (w.stock ?? []).reduce((sum, s) => sum + s.quantity, 0);
  const reserved = (w.stock ?? []).reduce((sum, s) => sum + s.reserved, 0);

  return {
    id: w.id,
    code: w.code,
    name: w.name,
    city: w.city,
    address: w.address,
    active: w.active,
    priority: w.priority,
    outletCount: w._count?.outlets ?? 0,
    /** Distinct parts held here, not units. */
    skuCount: w._count?.stock ?? 0,
    totalQuantity: quantity,
    totalReserved: reserved,
  };
}

export function serialiseOutlet(o: {
  id: string; code: string; name: string; city: string | null; address: string | null;
  phone: string | null; warehouseId: string | null; active: boolean;
  warehouse?: { name: string; code: string } | null;
}) {
  return {
    id: o.id,
    code: o.code,
    name: o.name,
    city: o.city,
    address: o.address,
    phone: o.phone,
    warehouseId: o.warehouseId,
    warehouseName: o.warehouse?.name ?? null,
    warehouseCode: o.warehouse?.code ?? null,
    active: o.active,
  };
}

export function serialiseStockLevel(s: {
  id: string; warehouseId: string; quantity: number; reserved: number;
  binLocation: string | null; updatedAt: Date;
  warehouse?: { name: string; code: string };
}) {
  return {
    id: s.id,
    warehouseId: s.warehouseId,
    warehouseName: s.warehouse?.name ?? null,
    warehouseCode: s.warehouse?.code ?? null,
    quantity: s.quantity,
    reserved: s.reserved,
    /** What can still be sold. Derived, never stored — see the schema. */
    available: s.quantity - s.reserved,
    binLocation: s.binLocation,
    updatedAt: s.updatedAt.toISOString(),
  };
}
