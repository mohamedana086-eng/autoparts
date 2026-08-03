/**
 * Turning TecDoc records into our own.
 * ------------------------------------
 * Pure functions only — no Prisma, no network. That is what lets the import
 * job be checked against a fixture: every judgement call about how a TecDoc
 * article becomes one of our products is made here, where it can be read and
 * corrected without a subscription or a database.
 *
 * Anything this file cannot map confidently it declines to map, returning
 * null with a reason, so the import reports a skipped article rather than
 * inventing a classification for it.
 */
// Relative, not the `@/` alias: this module is reached from prisma/ by tsx,
// which does not resolve the Next path alias.
import { normalisePartNumber } from '../part-number';

import type {
  TecDocArticle,
  TecDocArticleAttribute,
  TecDocArticleNumber,
  TecDocLinkedVehicle,
  TecDocModelSeries,
  TecDocVehicleType,
} from './types';

// ---------- Vehicle systems ----------

/** The twelve slugs seeded by `prisma/seed.ts`. */
export const SYSTEM_SLUGS = [
  'brake-system',
  'drive-system',
  'steering',
  'wheels',
  'filter',
  'cooling-system',
  'ignition-glow',
  'fuel-system',
  'air-conditioning',
  'electrics',
  'lights',
  'body',
] as const;

export type SystemSlug = (typeof SYSTEM_SLUGS)[number];

/**
 * TecDoc classifies parts far more finely than our twelve systems, so an
 * article's assembly-group and generic-article wording is matched against
 * these patterns instead. First match wins, which is why the order is not
 * alphabetical: "cabin air filter" has to reach `filter` before `air
 * conditioning` sees it, and a "brake wear sensor" has to reach
 * `brake-system` before `electrics` does.
 *
 * Once you have real assembly-group node ids from your subscription, prefer
 * pinning them in ASSEMBLY_GROUP_OVERRIDES below — an id is exact where a
 * keyword is a guess.
 */
const SYSTEM_PATTERNS: Array<[SystemSlug, RegExp]> = [
  ['filter', /\bfilter/i],
  // `\bbrak` rather than `\bbrake`: TecDoc's assembly group is called
  // "Braking System", which the stricter form does not match — the group
  // name is often the only wording an article has.
  ['brake-system', /\bbrak|caliper|\babs\b/i],
  [
    'drive-system',
    /\bclutch|gearbox|transmission|drive ?shaft|propshaft|cv joint|joint kit|differential|flywheel|axle drive/i,
  ],
  ['steering', /\bsteering|tie rod|track rod|\brack\b|drag link/i],
  ['wheels', /\bwheel|\bhub\b|bearing kit|\btyre|\btire|wheel stud|wheel nut/i],
  ['air-conditioning', /air.?condition|\ba\/?c\b|climate|\bcabin\b|refrigerant|evaporator|condenser/i],
  ['cooling-system', /cooling|radiator|thermostat|water pump|coolant|expansion tank|\bfan\b|intercooler/i],
  ['ignition-glow', /ignition|spark plug|glow plug|ignition coil|distributor/i],
  ['fuel-system', /\bfuel|injector|carburett|fuel pump|fuel tank|\blambda\b/i],
  ['lights', /\blight|\blamp|\bbulb|headl|tail ?l|indicator|xenon|\bled\b|reflector/i],
  [
    'electrics',
    /electric|\bsensor|alternator|starter|battery|\bswitch|\brelay|wiring|\becu\b|control unit|\bhorn\b/i,
  ],
  ['body', /\bbody|bumper|mirror|\bdoor|window|wiper|bonnet|\bwing\b|glass|\bseal\b|trim|grille/i],
];

/**
 * Assembly-group node ids pinned to a system, checked before the patterns.
 * Empty until you read the real ids out of your subscription's group tree —
 * `getAssemblyGroups` returns them, and pinning the dozen or so roots you
 * actually stock removes the guesswork for everything beneath them.
 */
export const ASSEMBLY_GROUP_OVERRIDES: Record<number, SystemSlug> = {};

/**
 * Which of our systems an article belongs to, judged from its assembly-group
 * node ids first and its wording second. Null when nothing matches, so the
 * caller can report it rather than dumping the article into a default
 * system where nobody browsing that system would expect it.
 */
export function resolveSystemSlug(
  assemblyGroupNodeIds: number[],
  wording: string[]
): SystemSlug | null {
  for (const nodeId of assemblyGroupNodeIds) {
    const pinned = ASSEMBLY_GROUP_OVERRIDES[nodeId];
    if (pinned) return pinned;
  }

  const haystack = wording.filter(Boolean).join(' ');
  if (!haystack.trim()) return null;

  for (const [slug, pattern] of SYSTEM_PATTERNS) {
    if (pattern.test(haystack)) return slug;
  }

  return null;
}

// ---------- Articles ----------

export interface MappedInterchange {
  targetPartNo: string;
  targetManufacturer: string;
  /** True for OE numbers — the vehicle maker's own, not a competitor's. */
  exactMatch: boolean;
}

export interface MappedProduct {
  partNumber: string;
  name: string;
  description: string | null;
  manufacturerName: string;
  isOEM: boolean;
  systemSlug: SystemSlug;
  stockDays: number;
  interchanges: MappedInterchange[];
  /** TecDoc's own id, needed to ask for this article's vehicle links. */
  tecDocArticleId: number | null;
}

export interface SkippedArticle {
  articleNumber: string;
  reason: string;
}

export type MapResult =
  | { ok: true; product: MappedProduct }
  | { ok: false; skipped: SkippedArticle };

/**
 * TecDoc carries no delivery lead time — that is a property of who you buy
 * from, not of the catalogue. Imported articles get this until a supplier
 * feed says otherwise.
 */
const DEFAULT_STOCK_DAYS = 3;

const NUMBER_TYPE_OWN = 0;
const NUMBER_TYPE_OE = 1;
const NUMBER_TYPE_COMPARABLE = 3;

/** "Width [mm]: 155" lines, folded into one paragraph. */
function describeAttributes(attributes: TecDocArticleAttribute[]): string {
  return attributes
    .filter((a) => a.attrName && a.attrValue)
    .map((a) => {
      const unit = a.attrUnit ? ` ${a.attrUnit}` : '';
      return `${a.attrName}: ${a.attrValue}${unit}`;
    })
    .join(' · ');
}

function mapInterchanges(
  numbers: TecDocArticleNumber[],
  ownNumber: string
): MappedInterchange[] {
  const ownNormalised = normalisePartNumber(ownNumber);
  const seen = new Set<string>();
  const out: MappedInterchange[] = [];

  for (const entry of numbers) {
    if (!entry.articleNumber) continue;

    const type = entry.numberType ?? NUMBER_TYPE_OWN;
    if (type !== NUMBER_TYPE_OE && type !== NUMBER_TYPE_COMPARABLE) continue;

    // A cross-reference to itself tells a customer nothing.
    const normalised = normalisePartNumber(entry.articleNumber);
    if (!normalised || normalised === ownNormalised) continue;

    // The same OE number often arrives once per vehicle maker spelling.
    const manufacturer = (entry.mfrName ?? '').trim().toUpperCase() || 'UNKNOWN';
    const key = `${normalised}|${manufacturer}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      targetPartNo: entry.articleNumber.trim(),
      targetManufacturer: manufacturer,
      exactMatch: type === NUMBER_TYPE_OE,
    });
  }

  return out;
}

/**
 * One TecDoc article as one of our products, or a reason it was left out.
 *
 * `isOEMBrand` comes from the brand list rather than the article: whether a
 * brand is a vehicle maker's own is a fact about the brand, and an article
 * carrying OE cross-references is evidence of the opposite — that is what
 * aftermarket parts do. Matches the seed, where METALCAUCHO is not OEM and
 * BMW is.
 */
export function mapArticle(article: TecDocArticle, isOEMBrand = false): MapResult {
  const partNumber = (article.articleNumber ?? '').trim();
  if (!partNumber) {
    return { ok: false, skipped: { articleNumber: '(blank)', reason: 'no article number' } };
  }

  const manufacturerName = (article.mfrName ?? '').trim().toUpperCase();
  if (!manufacturerName) {
    return { ok: false, skipped: { articleNumber: partNumber, reason: 'no brand name' } };
  }

  const groups = article.assemblyGroups ?? [];
  const systemSlug = resolveSystemSlug(
    groups.map((g) => g.assemblyGroupNodeId).filter((id): id is number => typeof id === 'number'),
    [
      article.articleName ?? '',
      article.genericArticleDescription ?? '',
      ...groups.map((g) => g.assemblyGroupName ?? ''),
      ...groups.map((g) => g.genericArticleDescription ?? ''),
    ]
  );

  if (!systemSlug) {
    return {
      ok: false,
      skipped: {
        articleNumber: partNumber,
        reason: `no vehicle system matched "${article.articleName ?? article.genericArticleDescription ?? ''}"`,
      },
    };
  }

  const name = (article.articleName ?? article.genericArticleDescription ?? '').trim();
  if (!name) {
    return { ok: false, skipped: { articleNumber: partNumber, reason: 'no article name' } };
  }

  const description = describeAttributes(article.articleAttributes ?? []);

  return {
    ok: true,
    product: {
      partNumber,
      name,
      description: description || null,
      manufacturerName,
      isOEM: isOEMBrand,
      systemSlug,
      stockDays: DEFAULT_STOCK_DAYS,
      interchanges: mapInterchanges(article.articleNumbers ?? [], partNumber),
      tecDocArticleId: typeof article.articleId === 'number' ? article.articleId : null,
    },
  };
}

// ---------- Vehicles ----------

/** TecDoc writes construction dates as `YYYYMM`; only the year is modelled. */
export function tecDocYear(value: number | undefined): number | null {
  if (typeof value !== 'number' || value <= 0) return null;
  const year = value > 9999 ? Math.floor(value / 100) : value;
  return year >= 1900 && year <= 2100 ? year : null;
}

/** Our `fuel` column is a lowercase union; TecDoc's wording is free text. */
export function normaliseFuel(fuelType: string | undefined): string {
  const value = (fuelType ?? '').toLowerCase();
  if (/electric/.test(value)) return 'electric';
  if (/hybrid/.test(value)) return 'hybrid';
  if (/diesel/.test(value)) return 'diesel';
  if (/petrol|gasoline|benzin/.test(value)) return 'petrol';
  return 'diesel';
}

export interface MappedModel {
  tecDocModelId: number;
  name: string;
  yearFrom: number;
  yearTo: number | null;
}

export interface MappedVariant {
  tecDocVehicleId: number;
  tecDocModelId: number;
  name: string;
  engineCode: string | null;
  powerKw: number | null;
  fuel: string;
  yearFrom: number;
  yearTo: number | null;
}

/**
 * A model series, or null when it carries no usable start year — `yearFrom`
 * is required on our side and guessing one would misfilter the vehicle
 * picker.
 */
export function mapModel(series: TecDocModelSeries): MappedModel | null {
  const name = (series.modelName ?? '').trim();
  const yearFrom = tecDocYear(series.yearOfConstructionFrom);
  if (!name || yearFrom === null) return null;

  return {
    tecDocModelId: series.modelId,
    name,
    yearFrom,
    yearTo: tecDocYear(series.yearOfConstructionTo),
  };
}

/** An engine variant, or null when it is missing a name, model or start year. */
export function mapVariant(type: TecDocVehicleType): MappedVariant | null {
  const name = (type.typeName ?? '').trim();
  const yearFrom = tecDocYear(type.yearOfConstructionFrom);
  if (!name || yearFrom === null || typeof type.modelId !== 'number') return null;

  return {
    tecDocVehicleId: type.vehicleId,
    tecDocModelId: type.modelId,
    name,
    engineCode: type.engineCodes?.[0]?.trim() || null,
    powerKw: typeof type.powerKw === 'number' ? type.powerKw : null,
    fuel: normaliseFuel(type.fuelType),
    yearFrom,
    yearTo: tecDocYear(type.yearOfConstructionTo),
  };
}

export interface MappedFitment {
  tecDocVehicleId: number;
  note: string | null;
}

export function mapFitments(links: TecDocLinkedVehicle[]): MappedFitment[] {
  const seen = new Set<number>();
  const out: MappedFitment[] = [];

  for (const link of links) {
    if (typeof link.vehicleId !== 'number' || seen.has(link.vehicleId)) continue;
    seen.add(link.vehicleId);
    out.push({
      tecDocVehicleId: link.vehicleId,
      note: (link.linkingTargetInfo ?? '').trim() || null,
    });
  }

  return out;
}
