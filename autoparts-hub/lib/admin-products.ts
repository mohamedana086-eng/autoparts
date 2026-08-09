import 'server-only';

/**
 * Shared shapes and validation for the admin product endpoints.
 *
 * These live here rather than in the route file because Next only allows a
 * route module to export its handlers and a fixed set of config names —
 * exporting helpers from one makes the generated route types fail to build.
 */

export interface ProductInput {
  partNumber: string;
  name: string;
  description: string | null;
  manufacturerId: string;
  vehicleSystemId: string;
  supplierId: string | null;
  basePrice: number;
  /**
   * Null when the form left it blank, which is how a new part asks to inherit
   * its supplier's default lead time. The column itself is never null — the
   * caller resolves this before writing.
   */
  stockDays: number | null;
}

/** Validates a create/update body, returning either the values or a message. */
export function readProductInput(body: Record<string, unknown>):
  | { ok: true; value: ProductInput }
  | { ok: false; error: string } {
  const partNumber = String(body.partNumber ?? '').trim();
  const name = String(body.name ?? '').trim();
  const manufacturerId = String(body.manufacturerId ?? '').trim();
  const vehicleSystemId = String(body.vehicleSystemId ?? '').trim();

  if (!partNumber) return { ok: false, error: 'Part number is required.' };
  if (!name) return { ok: false, error: 'Name is required.' };
  if (!manufacturerId) return { ok: false, error: 'Pick a manufacturer.' };
  if (!vehicleSystemId) return { ok: false, error: 'Pick a vehicle system.' };

  const basePrice = Number(body.basePrice);
  if (!Number.isFinite(basePrice) || basePrice < 0) {
    return { ok: false, error: 'Purchase price must be a number of zero or more.' };
  }

  // Blank means "use the supplier's default", which the route resolves.
  const blankStockDays =
    body.stockDays === undefined || body.stockDays === null || body.stockDays === '';
  const stockDays = blankStockDays ? null : Number(body.stockDays);
  if (stockDays !== null && (!Number.isInteger(stockDays) || stockDays < 0)) {
    return { ok: false, error: 'Delivery days must be a whole number of zero or more.' };
  }

  const description = String(body.description ?? '').trim();
  const supplierId = String(body.supplierId ?? '').trim();

  return {
    ok: true,
    value: {
      partNumber,
      name,
      description: description || null,
      manufacturerId,
      vehicleSystemId,
      supplierId: supplierId || null,
      basePrice,
      stockDays,
    },
  };
}

export interface ImageInput {
  url: string;
  alt: string | null;
}

/**
 * Validates the whole picture list for one part, in display order.
 *
 * Submitted as an ordered set rather than one image at a time because order
 * is the only thing that says which picture leads — see ProductImage in the
 * schema. Reordering is then the same request as adding, and there is no
 * moment where two images both claim to be first.
 */
export function readImageRows(body: Record<string, unknown>):
  | { ok: true; value: ImageInput[] }
  | { ok: false; error: string } {
  const raw = body.images;
  if (!Array.isArray(raw)) return { ok: false, error: 'Expected a list of images.' };
  if (raw.length > 12) return { ok: false, error: 'A part can carry at most 12 pictures.' };

  const rows: ImageInput[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      return { ok: false, error: 'Every image must be an object.' };
    }
    const row = entry as Record<string, unknown>;
    const url = String(row.url ?? '').trim();
    if (!url) return { ok: false, error: 'Every image needs a url.' };

    // http(s) or a site-relative path. Anything else — data:, javascript:,
    // blob: — ends up in an <img src> on a public page, so it is refused here
    // rather than sanitised at each of the places that render it.
    const allowed = /^https?:\/\//i.test(url) || url.startsWith('/');
    if (!allowed) {
      return { ok: false, error: 'An image url must start with http://, https:// or /.' };
    }
    if (url.length > 2048) return { ok: false, error: 'That image url is too long.' };

    const alt = String(row.alt ?? '').trim();
    rows.push({ url, alt: alt || null });
  }

  return { ok: true, value: rows };
}

export function serialiseImage(i: {
  id: string; url: string; alt: string | null; sortOrder: number;
}) {
  return { id: i.id, url: i.url, alt: i.alt, sortOrder: i.sortOrder };
}

export function serialiseProduct(p: {
  id: string; partNumber: string; name: string; description: string | null;
  basePrice: number; stockDays: number; manufacturerId: string; vehicleSystemId: string;
  supplierId?: string | null;
  manufacturer?: { name: string }; vehicleSystem?: { name: string };
  supplier?: { name: string } | null;
  images?: { url: string }[];
  stock?: { quantity: number; reserved: number }[];
  _count?: { interchanges: number; images?: number };
}) {
  const onHand = (p.stock ?? []).reduce((sum, s) => sum + s.quantity, 0);
  const reserved = (p.stock ?? []).reduce((sum, s) => sum + s.reserved, 0);

  return {
    id: p.id,
    partNumber: p.partNumber,
    name: p.name,
    description: p.description,
    basePrice: p.basePrice,
    stockDays: p.stockDays,
    manufacturerId: p.manufacturerId,
    manufacturerName: p.manufacturer?.name ?? null,
    vehicleSystemId: p.vehicleSystemId,
    systemName: p.vehicleSystem?.name ?? null,
    supplierId: p.supplierId ?? null,
    supplierName: p.supplier?.name ?? null,
    interchangeCount: p._count?.interchanges ?? 0,
    imageCount: p._count?.images ?? 0,
    /** The lowest-ordered picture, for the thumbnail in the list. */
    primaryImageUrl: p.images?.[0]?.url ?? null,
    /**
     * Summed across every warehouse. Null when the caller did not ask for
     * stock, which is not the same as a part nobody holds any of — the list
     * must be able to tell "none in stock" from "not counted here".
     */
    stockOnHand: p.stock ? onHand : null,
    stockAvailable: p.stock ? onHand - reserved : null,
  };
}
