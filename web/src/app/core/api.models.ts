/** Shapes returned by the Next.js API under /api. */

export interface VehicleSystem {
  id: string;
  name: string;
  slug: string;
  icon: string;
}

export type MatchedOn = 'part-number' | 'name' | 'manufacturer' | 'interchange' | 'description';

export type SearchSort = 'relevance' | 'price-asc' | 'price-desc' | 'delivery';

export interface SupplierRef {
  slug: string;
  name: string;
  /** 1–5, or null when nobody has rated them yet. */
  rating: number | null;
  /** official | reliable | standard — what the trading relationship is. */
  reliability?: string;
  /** Whether they take stock back. Null when the terms are not established. */
  acceptsReturns?: boolean | null;
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
  /** Who the part is bought from, and how they rate. Null when unsourced. */
  supplier?: SupplierRef | null;
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

/** How many results come from suppliers on exactly this rating. `rating: null`
 *  is the unrated ones, which no minimum ever includes. */
export interface SupplierRatingFacet {
  rating: number | null;
  count: number;
}

export interface SearchResponse {
  query: string;
  systemName: string | null;
  system: string | null;
  manufacturer: string | null;
  variant: string | null;
  variantLabel: string | null;
  supplier: string | null;
  supplierName: string | null;
  /** Minimum supplier rating in force, or null for no minimum. */
  minRating: number | null;
  /** Supplier reliability in force, or null for any. */
  reliability: string | null;
  /** True when narrowed to suppliers known to take stock back. */
  returns: boolean;
  minPrice: number | null;
  maxPrice: number | null;
  sort: SearchSort;
  /** True when nothing matched as typed and these are close matches. */
  fuzzy: boolean;
  tierName: string;
  isLoggedIn: boolean;
  count: number;
  priceRange: { min: number; max: number } | null;
  facets: {
    systems: SystemFacet[];
    manufacturers: BrandFacet[];
    supplierRatings: SupplierRatingFacet[];
    /** Ordered official → reliable → standard; zero-count entries omitted. */
    reliabilities: { name: string; count: number }[];
    /** Results from a supplier known to take stock back. */
    returns: number;
  };
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
  supplier: SupplierRef | null;
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
