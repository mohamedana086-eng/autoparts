/** Shapes returned by the Next.js API under /api. */

export interface VehicleSystem {
  id: string;
  name: string;
  slug: string;
  icon: string;
}

export type MatchedOn = 'part-number' | 'name' | 'manufacturer' | 'interchange' | 'description';

export type SearchSort = 'relevance' | 'price-asc' | 'price-desc' | 'delivery';

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
  /** Why this row came back, so the UI can explain non-obvious hits. */
  matchedOn?: MatchedOn;
  /** The cross-reference that matched, when matchedOn is 'interchange'. */
  matchedVia?: string | null;
}

export interface BrandFacet {
  name: string;
  count: number;
}

export interface SystemFacet {
  slug: string;
  name: string;
  count: number;
}

export interface SearchResponse {
  query: string;
  systemName: string | null;
  system: string | null;
  manufacturer: string | null;
  variant: string | null;
  variantLabel: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  sort: SearchSort;
  /** True when nothing matched as typed and these are close matches. */
  fuzzy: boolean;
  tierName: string;
  isLoggedIn: boolean;
  count: number;
  priceRange: { min: number; max: number } | null;
  facets: { systems: SystemFacet[]; manufacturers: BrandFacet[] };
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
