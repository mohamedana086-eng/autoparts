/**
 * Import the catalogue from TecDoc.
 * ---------------------------------
 * Replaces the hand-seeded sample data with real articles, vehicles and
 * fitment from a TecAlliance subscription.
 *
 *   npm run db:import:tecdoc -- --fixture=prisma/fixtures/tecdoc-sample.json
 *   npm run db:import:tecdoc -- --brand=BOSCH --limit=500
 *   npm run db:import:tecdoc -- --brand=BOSCH --limit=500 --apply
 *
 * Dry run unless `--apply` is passed: it reads the catalogue, maps it,
 * reports exactly what it would change, and writes nothing. Run it that way
 * first — against the deployed database this is the job with the most reach.
 *
 * Idempotent like the seed scripts: rows are matched on TecDoc's own id
 * where there is one and on the unique key otherwise, so re-running updates
 * in place instead of duplicating.
 *
 * WHAT THIS DOES NOT DO — pricing. TecDoc is a catalogue: articles, brands,
 * vehicle linkage, OE and competitor references. It carries no purchase
 * price, and `Product.basePrice` is defined as the supplier purchase price
 * that the whole markup engine multiplies up. So:
 *
 *   - a newly imported article lands with basePrice 0 and is not sellable
 *     until a supplier price list gives it a real one;
 *   - an existing product's basePrice is never touched by this job, so a
 *     price already negotiated survives every re-import.
 *
 * The closing report counts how many products are still waiting on a price.
 */
import { PrismaClient } from '@prisma/client';

import {
  TecDocClient,
  TecDocError,
  tecDocFromEnv,
  tecDocFromFixture,
} from '../lib/tecdoc/client';
import {
  mapArticle,
  mapFitments,
  mapModel,
  mapVariant,
  type MappedProduct,
} from '../lib/tecdoc/map';
import type {
  TecDocArticle,
  TecDocBrand,
  TecDocLinkedVehiclesResponse,
  TecDocModelSeries,
  TecDocVehicleManufacturer,
  TecDocVehicleType,
} from '../lib/tecdoc/types';

const prisma = new PrismaClient();

/**
 * The web-service function names, in one place. TecAlliance renames these
 * between major versions of the endpoint; when a call 404s or comes back
 * empty for a query you know has results, this block is the first thing to
 * check against your subscription's documentation.
 */
const FN = {
  brands: 'getBrands',
  articles: 'getArticles',
  vehicleManufacturers: 'getManufacturers',
  modelSeries: 'getModelSeries',
  vehicleTypes: 'getVehicleIdsByCriteria',
  linkedVehicles: 'getLinkedVehiclesByArticle',
} as const;

const PER_PAGE = 100;

// ---------- Options ----------

interface Options {
  apply: boolean;
  fixture: string | null;
  brands: string[];
  limit: number | null;
  vehicles: boolean;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    apply: false,
    fixture: null,
    brands: [],
    limit: null,
    vehicles: false,
  };

  for (const arg of argv) {
    if (arg === '--apply') options.apply = true;
    else if (arg === '--vehicles') options.vehicles = true;
    else if (arg.startsWith('--fixture=')) options.fixture = arg.slice('--fixture='.length);
    else if (arg.startsWith('--brand=')) options.brands.push(arg.slice('--brand='.length).toUpperCase());
    else if (arg.startsWith('--limit=')) options.limit = Number(arg.slice('--limit='.length));
    else if (arg === '--help' || arg === '-h') {
      console.log(USAGE);
      process.exit(0);
    } else {
      console.error(`Unknown option: ${arg}\n`);
      console.error(USAGE);
      process.exit(1);
    }
  }

  if (options.limit !== null && !Number.isInteger(options.limit)) {
    console.error('--limit must be a whole number');
    process.exit(1);
  }

  return options;
}

const USAGE = `
Import the catalogue from TecDoc.

  npm run db:import:tecdoc -- [options]

  --apply           Write to the database. Without it this is a dry run.
  --fixture=PATH    Read canned responses from a JSON file instead of the
                    live service. No credentials needed.
  --brand=NAME      Only import this brand. Repeatable. Default: every brand
                    the subscription exposes, which is a lot — start narrow.
  --limit=N         Stop after N articles.
  --vehicles        Also import the vehicle tree and article-to-vehicle
                    fitment. Slower: one extra call per article.
  --help            This message.

Needs TECDOC_API_KEY and TECDOC_PROVIDER_ID in the environment unless
--fixture is given. Prices are not imported — see the note at the top of
this file.
`.trim();

// ---------- Report ----------

interface Report {
  articlesSeen: number;
  productsCreated: number;
  productsUpdated: number;
  interchangesWritten: number;
  makesCreated: number;
  modelsCreated: number;
  variantsCreated: number;
  fitmentsCreated: number;
  skipped: Map<string, number>;
  collisions: Array<{ partNumber: string; incoming: string; existing: string }>;
}

function emptyReport(): Report {
  return {
    articlesSeen: 0,
    productsCreated: 0,
    productsUpdated: 0,
    interchangesWritten: 0,
    makesCreated: 0,
    modelsCreated: 0,
    variantsCreated: 0,
    fitmentsCreated: 0,
    skipped: new Map(),
    collisions: [],
  };
}

function noteSkip(report: Report, reason: string): void {
  // Reasons carry the offending article's wording, which would make for one
  // line per article. Bucket on the leading phrase instead.
  const bucket = reason.split(' "')[0];
  report.skipped.set(bucket, (report.skipped.get(bucket) ?? 0) + 1);
}

// ---------- Lookups ----------

/**
 * Vehicle systems and parts brands, held in memory for the run. The systems
 * are a fixed twelve; the brands grow as articles arrive, so misses are
 * created on demand.
 */
class Lookups {
  private systems = new Map<string, string>();
  private manufacturers = new Map<string, string>();

  async load(): Promise<void> {
    for (const system of await prisma.vehicleSystem.findMany()) {
      this.systems.set(system.slug, system.id);
    }
    for (const manufacturer of await prisma.manufacturer.findMany()) {
      this.manufacturers.set(manufacturer.name, manufacturer.id);
    }
  }

  systemId(slug: string): string | null {
    return this.systems.get(slug) ?? null;
  }

  /** In a dry run an unknown brand has no id yet; the caller only needs to
   *  know it resolved, so a placeholder stands in for the reporting pass. */
  async manufacturerId(name: string, isOEM: boolean, apply: boolean): Promise<string> {
    const known = this.manufacturers.get(name);
    if (known) return known;

    if (!apply) {
      this.manufacturers.set(name, `(new) ${name}`);
      return `(new) ${name}`;
    }

    const created = await prisma.manufacturer.upsert({
      where: { name },
      update: {},
      create: { name, isOEM },
    });
    this.manufacturers.set(name, created.id);
    return created.id;
  }
}

// ---------- Products ----------

/**
 * One mapped article, written or counted.
 *
 * A part number is unique across our whole catalogue, but TecDoc's are only
 * unique per brand — two brands can legitimately ship the same number. When
 * an incoming article collides with a different brand's existing row it is
 * reported and skipped rather than overwriting a product that other brands'
 * customers may already have ordered.
 */
async function importProduct(
  product: MappedProduct,
  lookups: Lookups,
  options: Options,
  report: Report
): Promise<string | null> {
  const systemId = lookups.systemId(product.systemSlug);
  if (!systemId) {
    noteSkip(report, `vehicle system ${product.systemSlug} missing — run db:seed first`);
    return null;
  }

  const manufacturerId = await lookups.manufacturerId(
    product.manufacturerName,
    product.isOEM,
    options.apply
  );

  const existing = await prisma.product.findFirst({
    where: product.tecDocArticleId
      ? { OR: [{ tecDocId: product.tecDocArticleId }, { partNumber: product.partNumber }] }
      : { partNumber: product.partNumber },
    include: { manufacturer: true },
  });

  if (existing && existing.manufacturer.name !== product.manufacturerName) {
    report.collisions.push({
      partNumber: product.partNumber,
      incoming: product.manufacturerName,
      existing: existing.manufacturer.name,
    });
    return null;
  }

  // Catalogue facts only. basePrice, currency and supplierId are deliberately
  // absent: they are commercial decisions this job has no source for, and
  // overwriting them would undo pricing work on every re-import.
  const catalogueFields = {
    name: product.name,
    description: product.description,
    manufacturerId,
    vehicleSystemId: systemId,
    tecDocId: product.tecDocArticleId,
  };

  if (!options.apply) {
    if (existing) report.productsUpdated++;
    else report.productsCreated++;
    report.interchangesWritten += product.interchanges.length;
    return existing?.id ?? null;
  }

  let id: string;
  if (existing) {
    await prisma.product.update({ where: { id: existing.id }, data: catalogueFields });
    id = existing.id;
    report.productsUpdated++;
  } else {
    const created = await prisma.product.create({
      data: {
        ...catalogueFields,
        partNumber: product.partNumber,
        basePrice: 0, // no price in TecDoc — a supplier feed sets this
        stockDays: product.stockDays,
      },
    });
    id = created.id;
    report.productsCreated++;
  }

  // Cross-references are replaced wholesale: TecDoc dropping a reference is
  // as meaningful as it adding one, and there is no stable id to diff on.
  await prisma.interchange.deleteMany({ where: { sourceId: id } });
  if (product.interchanges.length > 0) {
    await prisma.interchange.createMany({
      data: product.interchanges.map((x) => ({
        sourceId: id,
        targetPartNo: x.targetPartNo,
        targetManufacturer: x.targetManufacturer,
        exactMatch: x.exactMatch,
      })),
    });
    report.interchangesWritten += product.interchanges.length;
  }

  return id;
}

// ---------- Vehicles ----------

/**
 * The vehicle tree, make by make. Returns TecDoc vehicle id -> our variant
 * id, which is what fitment links are resolved through.
 *
 * Note that imported makes get an empty `wmiCodes`. TecDoc does not publish
 * WMI prefixes, and they are what `lib/vin.ts` reads a chassis number with —
 * so VIN lookup keeps working for the hand-seeded makes and stays silent for
 * imported ones until the codes are filled in.
 */
async function importVehicles(
  client: TecDocClient,
  options: Options,
  report: Report
): Promise<Map<number, string>> {
  const variantIdByTecDocId = new Map<number, string>();

  const manufacturersResponse = await client.call<{ manufacturers?: TecDocVehicleManufacturer[] }>(
    FN.vehicleManufacturers
  );
  const manufacturers = manufacturersResponse.manufacturers ?? [];

  for (const manufacturer of manufacturers) {
    const name = (manufacturer.manufacturerName ?? '').trim().toUpperCase();
    if (!name) continue;

    let makeId: string | null = null;
    if (options.apply) {
      const existing = await prisma.vehicleMake.findFirst({
        where: { OR: [{ tecDocId: manufacturer.manufacturerId }, { name }] },
      });
      if (existing) {
        makeId = existing.id;
        if (existing.tecDocId === null) {
          await prisma.vehicleMake.update({
            where: { id: existing.id },
            data: { tecDocId: manufacturer.manufacturerId },
          });
        }
      } else {
        const created = await prisma.vehicleMake.create({
          data: { name, wmiCodes: [], tecDocId: manufacturer.manufacturerId },
        });
        makeId = created.id;
        report.makesCreated++;
      }
    } else {
      report.makesCreated++;
    }

    const seriesResponse = await client.call<{ modelSeries?: TecDocModelSeries[] }>(
      FN.modelSeries,
      { manufacturerId: manufacturer.manufacturerId }
    );

    for (const series of seriesResponse.modelSeries ?? []) {
      const model = mapModel(series);
      if (!model) continue;

      let modelId: string | null = null;
      if (options.apply && makeId) {
        const existing = await prisma.vehicleModel.findFirst({
          where: {
            OR: [{ tecDocId: model.tecDocModelId }, { makeId, name: model.name }],
          },
        });
        if (existing) {
          modelId = existing.id;
          await prisma.vehicleModel.update({
            where: { id: existing.id },
            data: {
              yearFrom: model.yearFrom,
              yearTo: model.yearTo,
              tecDocId: model.tecDocModelId,
            },
          });
        } else {
          const created = await prisma.vehicleModel.create({
            data: {
              makeId,
              name: model.name,
              yearFrom: model.yearFrom,
              yearTo: model.yearTo,
              tecDocId: model.tecDocModelId,
            },
          });
          modelId = created.id;
          report.modelsCreated++;
        }
      } else {
        report.modelsCreated++;
      }

      const typesResponse = await client.call<{ data?: TecDocVehicleType[] }>(FN.vehicleTypes, {
        modelId: model.tecDocModelId,
        manufacturerId: manufacturer.manufacturerId,
      });

      for (const type of typesResponse.data ?? []) {
        const variant = mapVariant(type);
        if (!variant) continue;

        if (!options.apply || !modelId) {
          report.variantsCreated++;
          // A dry run creates nothing, so there is no row id to map a fitment
          // onto. Without a placeholder every fitment would report as
          // pointing at a vehicle outside the import, which is an artefact of
          // the dry run rather than anything true about the data.
          variantIdByTecDocId.set(variant.tecDocVehicleId, '(dry-run)');
          continue;
        }

        const existing = await prisma.vehicleVariant.findFirst({
          where: {
            OR: [{ tecDocId: variant.tecDocVehicleId }, { modelId, name: variant.name }],
          },
        });

        const data = {
          engineCode: variant.engineCode,
          powerKw: variant.powerKw,
          fuel: variant.fuel,
          yearFrom: variant.yearFrom,
          yearTo: variant.yearTo,
          tecDocId: variant.tecDocVehicleId,
        };

        if (existing) {
          await prisma.vehicleVariant.update({ where: { id: existing.id }, data });
          variantIdByTecDocId.set(variant.tecDocVehicleId, existing.id);
        } else {
          const created = await prisma.vehicleVariant.create({
            data: { ...data, modelId, name: variant.name },
          });
          variantIdByTecDocId.set(variant.tecDocVehicleId, created.id);
          report.variantsCreated++;
        }
      }
    }
  }

  return variantIdByTecDocId;
}

/** The vehicles one article fits, as `Fitment` rows. */
async function importFitments(
  client: TecDocClient,
  articleId: number,
  productId: string,
  variantIdByTecDocId: Map<number, string>,
  options: Options,
  report: Report
): Promise<void> {
  const response = await client.call<TecDocLinkedVehiclesResponse>(FN.linkedVehicles, {
    articleId,
  });

  for (const fitment of mapFitments(response.linkedVehicles ?? [])) {
    const variantId = variantIdByTecDocId.get(fitment.tecDocVehicleId);
    if (!variantId) {
      // The article fits a vehicle outside the imported tree — expected when
      // --vehicles was limited, and not worth a line each.
      noteSkip(report, 'fitment refers to a vehicle not imported');
      continue;
    }

    if (!options.apply) {
      report.fitmentsCreated++;
      continue;
    }

    await prisma.fitment.upsert({
      where: { productId_variantId: { productId, variantId } },
      update: { note: fitment.note },
      create: { productId, variantId, note: fitment.note },
    });
    report.fitmentsCreated++;
  }
}

// ---------- Run ----------

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const client = options.fixture ? tecDocFromFixture(options.fixture) : tecDocFromEnv();
  const report = emptyReport();

  console.log(
    options.apply
      ? '--- TecDoc import: WRITING to the database ---'
      : '--- TecDoc import: dry run, nothing will be written (pass --apply to write) ---'
  );
  if (options.fixture) console.log(`source: fixture ${options.fixture}`);

  const lookups = new Lookups();
  await lookups.load();

  const variantIdByTecDocId = options.vehicles
    ? await importVehicles(client, options, report)
    : new Map<number, string>();

  // Which brands to pull. TecDoc keys articles by brandNo, so a --brand name
  // has to be resolved against the brand list first.
  const brandsResponse = await client.call<{ brands?: TecDocBrand[] }>(FN.brands);
  const allBrands = brandsResponse.brands ?? [];

  const brands =
    options.brands.length > 0
      ? allBrands.filter((b) =>
          options.brands.includes((b.mfrName ?? b.brandName ?? '').trim().toUpperCase())
        )
      : allBrands;

  if (options.brands.length > 0 && brands.length === 0) {
    console.error(
      `None of ${options.brands.join(', ')} are in the brand list ` +
        `(${allBrands.length} brands available).`
    );
    process.exitCode = 1;
    return;
  }

  console.log(`brands to import: ${brands.length}`);

  outer: for (const brand of brands) {
    const isOEMBrand = brand.isOe === true;

    for await (const page of client.paged<TecDocArticle>(
      FN.articles,
      { brandNo: brand.brandNo, includeAll: true },
      (envelope) => (envelope as { articles?: TecDocArticle[] }).articles,
      PER_PAGE
    )) {
      for (const article of page) {
        if (options.limit !== null && report.articlesSeen >= options.limit) break outer;
        report.articlesSeen++;

        const mapped = mapArticle(article, isOEMBrand);
        if (!mapped.ok) {
          noteSkip(report, mapped.skipped.reason);
          continue;
        }

        const productId = await importProduct(mapped.product, lookups, options, report);

        if (options.vehicles && mapped.product.tecDocArticleId !== null) {
          if (productId || !options.apply) {
            await importFitments(
              client,
              mapped.product.tecDocArticleId,
              productId ?? '(dry-run)',
              variantIdByTecDocId,
              options,
              report
            );
          }
        }
      }
    }
  }

  printReport(report, options);
}

function printReport(report: Report, options: Options): void {
  const verb = options.apply ? '' : ' (would be)';

  console.log('');
  console.log(`articles read:        ${report.articlesSeen}`);
  console.log(`products created${verb}: ${report.productsCreated}`);
  console.log(`products updated${verb}: ${report.productsUpdated}`);
  console.log(`cross-references${verb}: ${report.interchangesWritten}`);

  if (options.vehicles) {
    console.log(`makes${verb}:            ${report.makesCreated}`);
    console.log(`models${verb}:           ${report.modelsCreated}`);
    console.log(`variants${verb}:         ${report.variantsCreated}`);
    console.log(`fitments${verb}:         ${report.fitmentsCreated}`);
  }

  if (report.skipped.size > 0) {
    console.log('');
    console.log('skipped:');
    for (const [reason, count] of [...report.skipped].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(count).padStart(6)}  ${reason}`);
    }
  }

  if (report.collisions.length > 0) {
    console.log('');
    console.log(
      `part-number collisions: ${report.collisions.length} — the same number ` +
        `on two brands. Left untouched:`
    );
    for (const collision of report.collisions.slice(0, 20)) {
      console.log(
        `  ${collision.partNumber}  incoming ${collision.incoming}, already held by ${collision.existing}`
      );
    }
    if (report.collisions.length > 20) {
      console.log(`  ... and ${report.collisions.length - 20} more`);
    }
  }
}

/** How much of the catalogue cannot be sold yet for want of a price. */
async function printPricingGap(): Promise<void> {
  const unpriced = await prisma.product.count({ where: { basePrice: { lte: 0 } } });
  if (unpriced === 0) return;

  console.log('');
  console.log(
    `${unpriced} products have no purchase price. TecDoc does not carry one — ` +
      `load a supplier price list before these can be sold.`
  );
}

main()
  .then(printPricingGap)
  .catch((e) => {
    if (e instanceof TecDocError) {
      console.error(`\nTecDoc call failed: ${e.message}`);
      if (e.status === 401 || e.status === 403) {
        console.error('Check TECDOC_API_KEY and TECDOC_PROVIDER_ID.');
      }
    } else {
      console.error(e);
    }
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
