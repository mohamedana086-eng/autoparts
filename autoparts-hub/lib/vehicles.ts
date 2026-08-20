import 'server-only';
import { sql } from '@/lib/sql';

/**
 * The make / model / variant tree the vehicle picker walks.
 *
 * Read as three flat lists and assembled here rather than as nested joins:
 * a join would repeat every make once per variant and have to be folded back
 * together anyway, and three ordered reads are easier to see the cost of.
 */

export interface MakeRow {
  id: string;
  name: string;
}

export interface ModelRow {
  id: string;
  makeId: string;
  name: string;
  yearFrom: number;
  yearTo: number | null;
}

export interface VariantRow {
  id: string;
  modelId: string;
  name: string;
  engineCode: string | null;
  powerKw: number | null;
  fuel: string;
  yearFrom: number;
  yearTo: number | null;
}

export interface VehicleTree {
  id: string;
  name: string;
  models: (Omit<ModelRow, 'makeId'> & { variants: Omit<VariantRow, 'modelId'>[] })[];
}

export async function vehicleTree(): Promise<VehicleTree[]> {
  const [makes, models, variants] = await Promise.all([
    sql<MakeRow>`SELECT "id", "name" FROM "VehicleMake" ORDER BY "name" ASC`,
    sql<ModelRow>`
      SELECT "id", "makeId", "name", "yearFrom", "yearTo"
      FROM "VehicleModel" ORDER BY "name" ASC
    `,
    sql<VariantRow>`
      SELECT "id", "modelId", "name", "engineCode", "powerKw", "fuel", "yearFrom", "yearTo"
      FROM "VehicleVariant" ORDER BY "name" ASC
    `,
  ]);

  const variantsByModel = new Map<string, Omit<VariantRow, 'modelId'>[]>();
  for (const { modelId, ...v } of variants) {
    const list = variantsByModel.get(modelId);
    if (list) list.push(v);
    else variantsByModel.set(modelId, [v]);
  }

  const modelsByMake = new Map<string, VehicleTree['models']>();
  for (const { makeId, ...m } of models) {
    const entry = { ...m, variants: variantsByModel.get(m.id) ?? [] };
    const list = modelsByMake.get(makeId);
    if (list) list.push(entry);
    else modelsByMake.set(makeId, [entry]);
  }

  return makes.map((make) => ({ ...make, models: modelsByMake.get(make.id) ?? [] }));
}

/** Makes a VIN's world-manufacturer prefix can name. */
export async function makesByWmi(prefix: string): Promise<{ id: string; name: string }[]> {
  return sql<{ id: string; name: string }>`
    SELECT "id", "name" FROM "VehicleMake" WHERE ${prefix} = ANY("wmiCodes")
  `;
}
