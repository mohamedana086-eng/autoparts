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
  basePrice: number;
  stockDays: number;
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

  const stockDays = Number(body.stockDays);
  if (!Number.isInteger(stockDays) || stockDays < 0) {
    return { ok: false, error: 'Delivery days must be a whole number of zero or more.' };
  }

  const description = String(body.description ?? '').trim();

  return {
    ok: true,
    value: {
      partNumber,
      name,
      description: description || null,
      manufacturerId,
      vehicleSystemId,
      basePrice,
      stockDays,
    },
  };
}

export function serialiseProduct(p: {
  id: string; partNumber: string; name: string; description: string | null;
  basePrice: number; stockDays: number; manufacturerId: string; vehicleSystemId: string;
  manufacturer?: { name: string }; vehicleSystem?: { name: string };
  _count?: { interchanges: number };
}) {
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
    interchangeCount: p._count?.interchanges ?? 0,
  };
}
