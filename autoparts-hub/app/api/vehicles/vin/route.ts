import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { parseVin } from '@/lib/vin';

// GET /api/vehicles/vin?vin=WBA3A5C50DF123456
//
// Answers with the make and model year the VIN itself carries, plus the
// vehicles we hold for that make that were built in that year. The model and
// engine are not readable from a VIN without a licensed database, so the
// customer picks from those candidates rather than being told a single answer.
export async function GET(req: NextRequest) {
  const raw = new URL(req.url).searchParams.get('vin') ?? '';

  const parsed = parseVin(raw);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const reading = parsed.value;

  const make = await prisma.vehicleMake.findFirst({
    where: { wmiCodes: { has: reading.wmi } },
  });

  if (!make) {
    return NextResponse.json({
      vin: reading.vin,
      wmi: reading.wmi,
      modelYear: reading.modelYear,
      modelYearIsEstimate: reading.modelYearIsEstimate,
      checkDigitValid: reading.checkDigitValid,
      make: null,
      candidates: [],
      message: `We do not carry parts for the manufacturer behind ${reading.wmi} yet.`,
    });
  }

  const models = await prisma.vehicleModel.findMany({
    where: { makeId: make.id },
    include: { variants: { orderBy: { name: 'asc' } } },
    orderBy: { name: 'asc' },
  });

  const year = reading.modelYear;

  // Keep the variants whose production years cover the VIN's model year. With
  // no year to go on, offer the make's whole range rather than nothing.
  const candidates = models.flatMap((model) =>
    model.variants
      .filter((v) => year === null || (v.yearFrom <= year && (v.yearTo ?? 9999) >= year))
      .map((v) => ({
        variantId: v.id,
        modelId: model.id,
        label: `${make.name} ${model.name} ${v.name}`,
        engineCode: v.engineCode,
        fuel: v.fuel,
        yearFrom: v.yearFrom,
        yearTo: v.yearTo,
      }))
  );

  return NextResponse.json({
    vin: reading.vin,
    wmi: reading.wmi,
    modelYear: year,
    modelYearIsEstimate: reading.modelYearIsEstimate,
    checkDigitValid: reading.checkDigitValid,
    make: { id: make.id, name: make.name },
    candidates,
    message:
      candidates.length === 0
        ? `${make.name} is the manufacturer, but we hold no ${year ?? ''} models for it.`
        : null,
  });
}
