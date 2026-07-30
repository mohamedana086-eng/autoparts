/**
 * Supplier pages, and which supplier each part comes from.
 * --------------------------------------------------------
 * Idempotent: upserts by unique key and only fills a product's supplier when
 * it has none, so re-running never reshuffles sourcing that has been set by
 * hand. Safe on the deployed database.
 *
 *   npm run db:suppliers
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface SupplierSeed {
  code: string;
  name: string;
  slug: string;
  reliability: string;
  description: string;
  /** Parts brands this supplier stocks. Drives the assignment below. */
  brands: string[];
}

const SUPPLIERS: SupplierSeed[] = [
  {
    code: 'IB16',
    name: 'IB16 Parts',
    slug: 'ib16-parts',
    reliability: 'official',
    description:
      'Official distributor for the German programme — Bosch, Hella, Mahle and Febi. ' +
      'Stock is held locally, so most lines ship the same day.',
    brands: ['BOSCH', 'HELLA', 'MAHLE', 'FEBI BILSTEIN', 'MANN-FILTER'],
  },
  {
    code: 'NP20',
    name: 'NP20 Distribution',
    slug: 'np20-distribution',
    reliability: 'reliable',
    description:
      'Braking and chassis specialist carrying Brembo, TRW, ATE and SKF. ' +
      'Deeper range on older platforms than most of the market.',
    brands: ['BREMBO', 'TRW', 'ATE', 'SKF', 'LUK', 'SACHS'],
  },
  {
    code: 'BR02',
    name: 'BR02 Supply',
    slug: 'br02-supply',
    reliability: 'standard',
    description:
      'General aftermarket wholesaler — ignition, cooling, lighting and service items ' +
      'from Valeo, Denso, NGK, Gates, Osram and Philips.',
    brands: ['VALEO', 'DENSO', 'NGK', 'GATES', 'OSRAM', 'PHILIPS', 'METALCAUCHO'],
  },
];

/** Where a vehicle maker's own-brand parts are sourced. */
const OE_SUPPLIER_CODE = 'IB16';

async function main() {
  for (const s of SUPPLIERS) {
    await prisma.supplier.upsert({
      where: { code: s.code },
      update: {
        name: s.name,
        slug: s.slug,
        reliability: s.reliability,
        description: s.description,
      },
      create: {
        code: s.code,
        name: s.name,
        slug: s.slug,
        reliability: s.reliability,
        description: s.description,
      },
    });
  }

  const suppliers = await prisma.supplier.findMany();
  const byCode = new Map(suppliers.map((s) => [s.code, s]));

  const brandToSupplier = new Map<string, string>();
  for (const s of SUPPLIERS) {
    const row = byCode.get(s.code);
    if (!row) continue;
    for (const brand of s.brands) brandToSupplier.set(brand, row.id);
  }

  const fallback = byCode.get(OE_SUPPLIER_CODE)?.id ?? suppliers[0]?.id;

  // Only parts with no supplier yet, so a correction made in the admin stands.
  const unsourced = await prisma.product.findMany({
    where: { supplierId: null },
    include: { manufacturer: true },
  });

  let assigned = 0;
  for (const product of unsourced) {
    const supplierId = brandToSupplier.get(product.manufacturer.name) ?? fallback;
    if (!supplierId) continue;
    await prisma.product.update({ where: { id: product.id }, data: { supplierId } });
    assigned++;
  }

  console.log(`suppliers: ${await prisma.supplier.count()}`);
  console.log(`products sourced this run: ${assigned}`);
  for (const s of await prisma.supplier.findMany({
    include: { _count: { select: { products: true } } },
    orderBy: { code: 'asc' },
  })) {
    console.log(`  ${s.code.padEnd(6)} ${String(s._count.products).padStart(3)} parts  /${s.slug}`);
  }
  console.log(`unsourced remaining: ${await prisma.product.count({ where: { supplierId: null } })}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
