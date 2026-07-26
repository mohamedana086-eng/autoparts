'use server';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';

export async function createClientCategory(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim();
  const markupPercent = Number(formData.get('markupPercent') ?? 0);
  const minOrderAmount = Number(formData.get('minOrderAmount') ?? 0);
  const shelfLifeDays = Number(formData.get('shelfLifeDays') ?? 1);

  if (!name) return;

  await prisma.clientCategory.create({
    data: { name, markupPercent, minOrderAmount, shelfLifeDays },
  });
  revalidatePath('/admin/client-categories');
}

export async function deleteClientCategory(id: string) {
  await prisma.clientCategory.delete({ where: { id } });
  revalidatePath('/admin/client-categories');
}

export async function updateClientAccount(id: string, formData: FormData) {
  const role = String(formData.get('role') ?? 'RETAIL') as 'ADMIN' | 'B2B' | 'RETAIL';
  const categoryId = String(formData.get('categoryId') ?? '') || null;

  await prisma.client.update({
    where: { id },
    data: { role, categoryId },
  });
  revalidatePath('/admin/clients');
}
export async function createMarkupRule(formData: FormData) {
  const label = String(formData.get('label') ?? '').trim();
  if (!label) return;

  const opt = (key: string) => {
    const v = String(formData.get(key) ?? '').trim();
    return v.length > 0 ? v : null;
  };
  const optNum = (key: string) => {
    const v = formData.get(key);
    return v === null || v === '' ? null : Number(v);
  };

  await prisma.markupRule.create({
    data: {
      label,
      priority: Number(formData.get('priority') ?? 0),
      clientCategoryId: opt('clientCategoryId'),
      supplierId: opt('supplierId'),
      manufacturerName: opt('manufacturerName'),
      vehicleSystemSlug: opt('vehicleSystemSlug'),
      partNumberPrefix: opt('partNumberPrefix'),
      purchasePriceFrom: optNum('purchasePriceFrom'),
      purchasePriceTo: optNum('purchasePriceTo'),
      type: (String(formData.get('type') ?? 'PERCENT')) as any,
      value: Number(formData.get('value') ?? 0),
    },
  });
  revalidatePath('/admin/markup-rules');
}

export async function toggleMarkupRule(id: string, active: boolean) {
  await prisma.markupRule.update({ where: { id }, data: { active } });
  revalidatePath('/admin/markup-rules');
}

export async function deleteMarkupRule(id: string) {
  await prisma.markupRule.delete({ where: { id } });
  revalidatePath('/admin/markup-rules');
}
