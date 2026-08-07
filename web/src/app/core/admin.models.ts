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
  role: 'ADMIN' | 'SALES' | 'B2B' | 'RETAIL';
  city: string | null;
  hasLogin: boolean;
  categoryId: string | null;
  categoryName: string | null;
  /** Off the marked-up price. See the order of operations in the API. */
  discountPercent: number;
  currencyId: string | null;
  currencyCode: string | null;
  salesManagerId: string | null;
  salesManagerName: string | null;
}

/** What the client editor's selects need alongside the accounts themselves. */
export interface ClientsResponse {
  clients: AdminClient[];
  categories: TierRef[];
  currencies: TierRef[];
  salesManagers: TierRef[];
}

export interface ClientInput {
  role: string;
  categoryId: string | null;
  discountPercent: number;
  currencyId: string | null;
  salesManagerId: string | null;
}

export interface AdminCurrency {
  id: string;
  code: string;
  name: string;
  symbol: string;
  /** Units of this currency per one unit of the base. 1 on the base. */
  rate: number;
  /** The currency purchase prices are kept in. Exactly one, and not editable. */
  isBase: boolean;
  active: boolean;
  clientCount: number;
}

export interface CurrencyInput {
  code: string;
  name: string;
  symbol: string;
  rate: number;
  active: boolean;
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

/** What the trading relationship is. Distinct from `rating`, which is how
 *  well they actually perform. */
export const RELIABILITIES = ['official', 'reliable', 'standard'] as const;

export type Reliability = (typeof RELIABILITIES)[number];

export const MIN_RATING = 1;
export const MAX_RATING = 5;

export interface AdminSupplier {
  id: string;
  code: string;
  slug: string;
  name: string;
  description: string | null;
  reliability: string;
  /** 1–5, or null when nobody has rated them yet. */
  rating: number | null;
  /** Whether they take stock back. Null when the terms are not established. */
  acceptsReturns: boolean | null;
  productCount: number;
}

export interface SupplierInput {
  name: string;
  code: string;
  slug: string;
  description: string;
  reliability: string;
  /** Null clears the rating back to unrated. */
  rating: number | null;
  /** Null clears the return terms back to not-established. */
  acceptsReturns: boolean | null;
}
