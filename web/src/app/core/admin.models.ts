export interface AdminStats {
  products: number;
  clients: number;
  activeRules: number;
  orders: number;
}

export interface AdminClient {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'B2B' | 'RETAIL';
  city: string | null;
  hasLogin: boolean;
  categoryId: string | null;
  categoryName: string | null;
}

export interface TierRef {
  id: string;
  name: string;
}

export interface ClientCategory {
  id: string;
  name: string;
  markupPercent: number;
  minOrderAmount: number;
  shelfLifeDays: number;
  clientCount: number;
}

export type MarkupType = 'PERCENT' | 'AMOUNT' | 'FIXED';

export interface MarkupRule {
  id: string;
  label: string;
  priority: number;
  clientCategoryId: string | null;
  clientCategoryName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  manufacturerName: string | null;
  vehicleSystemSlug: string | null;
  partNumberPrefix: string | null;
  purchasePriceFrom: number | null;
  purchasePriceTo: number | null;
  type: MarkupType;
  value: number;
  active: boolean;
}

export interface MarkupRulesResponse {
  rules: MarkupRule[];
  categories: TierRef[];
  suppliers: TierRef[];
  systems: { slug: string; name: string }[];
}

export interface AdminOrder {
  id: string;
  reference: string;
  clientName: string;
  status: string;
  createdAt: string;
  units: number;
  total: number;
}

export const ORDER_STATUSES = ['order_is_sent', 'processing', 'shipped', 'paid'] as const;

export interface AdminProduct {
  id: string;
  partNumber: string;
  name: string;
  description: string | null;
  basePrice: number;
  stockDays: number;
  manufacturerId: string;
  manufacturerName: string | null;
  vehicleSystemId: string;
  systemName: string | null;
  interchangeCount: number;
}

export interface ProductInput {
  partNumber: string;
  name: string;
  description: string;
  manufacturerId: string;
  vehicleSystemId: string;
  basePrice: number;
  stockDays: number;
}

export interface ProductsResponse {
  products: AdminProduct[];
  manufacturers: TierRef[];
  systems: TierRef[];
}
