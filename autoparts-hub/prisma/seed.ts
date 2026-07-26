import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // --- Vehicle systems (matches the FastClick-style category tree) ---
  const systems = await Promise.all(
    [
      ['Brake System', 'brake-system', 'Disc'],
      ['Drive System', 'drive-system', 'Cog'],
      ['Steering', 'steering', 'Navigation'],
      ['Wheels', 'wheels', 'CircleDot'],
      ['Filter', 'filter', 'Filter'],
      ['Cooling System', 'cooling-system', 'Thermometer'],
      ['Ignition and Glow', 'ignition-glow', 'Zap'],
      ['Fuel System', 'fuel-system', 'Fuel'],
      ['Air Conditioning', 'air-conditioning', 'Wind'],
      ['Electrics', 'electrics', 'Cable'],
      ['Lights', 'lights', 'Lightbulb'],
      ['Body', 'body', 'Car'],
    ].map(([name, slug, icon], i) =>
      prisma.vehicleSystem.create({ data: { name, slug, icon, order: i } })
    )
  );

  // --- Manufacturers ---
  const [bmw, nissan, toyota, hyundai, metalcaucho] = await Promise.all(
    ['BMW', 'NISSAN', 'TOYOTA', 'HYUNDAI', 'METALCAUCHO'].map((name) =>
      prisma.manufacturer.create({ data: { name, isOEM: name !== 'METALCAUCHO' } })
    )
  );

  // --- Suppliers ---
  const [ib16, np20, br02] = await Promise.all(
    [
      ['IB16 Parts', 'IB16', 'official'],
      ['NP20 Distribution', 'NP20', 'reliable'],
      ['BR02 Supply', 'BR02', 'standard'],
    ].map(([name, code, reliability]) =>
      prisma.supplier.create({ data: { name, code, reliability } })
    )
  );

  // --- Client categories (mirrors "Price 1".."Price 10", Retail) ---
  const categoryDefs = [
    { name: 'Retail', markupPercent: 65.65, minOrderAmount: 0, shelfLifeDays: 1 },
    { name: 'Price 1', markupPercent: 4.0, minOrderAmount: 200, shelfLifeDays: 1 },
    { name: 'Price 2', markupPercent: 5.0, minOrderAmount: 200, shelfLifeDays: 1 },
    { name: 'Price 3', markupPercent: 6.0, minOrderAmount: 200, shelfLifeDays: 1 },
    { name: 'Price 5', markupPercent: 10.0, minOrderAmount: 200, shelfLifeDays: 1 },
    { name: 'Price 9', markupPercent: 23.0, minOrderAmount: 200, shelfLifeDays: 1 },
    { name: 'Price 10', markupPercent: 26.0, minOrderAmount: 200, shelfLifeDays: 7 },
  ];
  const categories = await Promise.all(
    categoryDefs.map((c) => prisma.clientCategory.create({ data: c }))
  );
  const retail = categories[0];
  const price9 = categories.find((c) => c.name === 'Price 9')!;

  // --- Accounts: one of each of the 3 roles, all with working logins ---
  const adminPassword = await bcrypt.hash('admin123', 10);
  const b2bPassword = await bcrypt.hash('trade123', 10);
  const retailPassword = await bcrypt.hash('retail123', 10);

  await prisma.client.create({
    data: {
      name: 'Site Admin',
      email: 'admin@autopartshub.com',
      passwordHash: adminPassword,
      role: 'ADMIN',
      categoryId: null,
    },
  });

  await prisma.client.create({
    data: {
      name: 'PROTOGEROS ILIAS STEFANOS',
      email: 'protogeros@example.com',
      passwordHash: b2bPassword,
      role: 'B2B',
      city: 'Athens',
      categoryId: price9.id,
    },
  });
  await prisma.client.create({
    data: {
      name: 'Mohamed N.',
      email: 'walk-in@example.com',
      passwordHash: retailPassword,
      role: 'RETAIL',
      city: 'Warszawa',
      categoryId: retail.id,
    },
  });

  // --- Products ---
  const cooling = systems.find((s) => s.slug === 'cooling-system')!;
  const brake = systems.find((s) => s.slug === 'brake-system')!;
  const filter = systems.find((s) => s.slug === 'filter')!;

  const products = await Promise.all([
    prisma.product.create({
      data: {
        partNumber: '17138616418',
        name: 'Expansion Tank, coolant',
        description: 'Coolant expansion tank, OE fitment',
        manufacturerId: bmw.id,
        vehicleSystemId: cooling.id,
        basePrice: 42.75,
        stockDays: 8,
      },
    }),
    prisma.product.create({
      data: {
        partNumber: '25401EB30B',
        name: 'Glass lifter switch unit',
        manufacturerId: nissan.id,
        vehicleSystemId: systems.find((s) => s.slug === 'body')!.id,
        basePrice: 24.10,
        stockDays: 2,
      },
    }),
    prisma.product.create({
      data: {
        partNumber: '1603147030',
        name: 'Thermostat',
        manufacturerId: toyota.id,
        vehicleSystemId: cooling.id,
        basePrice: 52.30,
        stockDays: 1,
      },
    }),
    prisma.product.create({
      data: {
        partNumber: '2565002821',
        name: 'Thermostat and housing',
        manufacturerId: hyundai.id,
        vehicleSystemId: cooling.id,
        basePrice: 18.20,
        stockDays: 3,
      },
    }),
    prisma.product.create({
      data: {
        partNumber: '03302',
        name: 'Expansion tank cap',
        manufacturerId: metalcaucho.id,
        vehicleSystemId: cooling.id,
        basePrice: 8.40,
        stockDays: 1,
      },
    }),
  ]);

  // --- Complex markup rules (mirrors the "Complex markup" screen) ---
  await prisma.markupRule.createMany({
    data: [
      {
        label: 'BMW cooling parts — Price 9 club',
        priority: 10,
        clientCategoryId: price9.id,
        manufacturerName: 'BMW',
        vehicleSystemSlug: 'cooling-system',
        type: 'PERCENT',
        value: 18,
      },
      {
        label: 'Low-value aftermarket parts (<€10) — flat +€2',
        priority: 5,
        purchasePriceFrom: 0,
        purchasePriceTo: 10,
        type: 'AMOUNT',
        value: 2,
      },
      {
        label: 'IB16 supplier standing discount',
        priority: 3,
        supplierId: ib16.id,
        type: 'PERCENT',
        value: 12,
      },
    ],
  });

  console.log(`Seeded ${products.length} products, ${categories.length} client categories.`);
  console.log('Login accounts:');
  console.log('  Admin:  admin@autopartshub.com / admin123');
  console.log('  B2B:    protogeros@example.com / trade123');
  console.log('  Retail: walk-in@example.com / retail123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
