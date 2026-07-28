/** Shapes returned by the Next.js API under /api. */

export interface VehicleSystem {
  id: string;
  name: string;
  slug: string;
  icon: string;
}

export interface ProductSummary {
  id: string;
  partNumber: string;
  name: string;
  manufacturer: string;
  system: string;
  systemSlug: string;
  stockDays: number;
  price: number;
  appliedRule: string | null;
}

export interface SearchResponse {
  query: string;
  systemName: string | null;
  tierName: string;
  isLoggedIn: boolean;
  count: number;
  products: ProductSummary[];
}

export interface Interchange {
  id: string;
  partNumber: string;
  manufacturer: string;
  exactMatch: boolean;
}

export interface ProductDetail extends ProductSummary {
  description: string | null;
  interchanges: Interchange[];
}

export interface ProductResponse {
  tierName: string;
  isLoggedIn: boolean;
  product: ProductDetail;
}

export interface SessionUser {
  id: string;
  name: string;
  role: 'ADMIN' | 'B2B' | 'RETAIL';
  tierName: string;
}
