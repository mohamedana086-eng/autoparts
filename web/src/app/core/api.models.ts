/** Shapes returned by the Next.js API under /api. */

export interface VehicleSystem {
  id: string;
  name: string;
  slug: string;
  icon: string;
}

export type MatchedOn =
  | 'part-number'
  | 'name'
  | 'manufacturer'
  | 'interchange-oem'
  | 'interchange-aftermarket'
  | 'description';

/** Which kind of number a search was answered from. */
export type MatchIn = 'part-number' | 'oem' | 'aftermarket';

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

/** A part's leading picture. Order decides which one that is — see the schema. */
export interface ProductImageRef {
  url: string;
  /** Null falls back to the part's name wherever it is rendered. */
  alt: string | null;
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
  /** Null when nobody has added a picture of this part. */
  image?: ProductImageRef | null;
  /**
   * Units that can be sold today, across warehouses that can be picked from.
   *
   * Null is not zero: it means nobody has counted this part into a warehouse,
   * so there is no figure to show and the part sells on its lead time the way
   * the whole catalogue did before stock was tracked. Zero means someone
   * counted and there are none.
   */
  available?: number | null;
  /** Who the part is bought from, and how they rate. Null when unsourced. */
  supplier?: SupplierRef | null;
  /** Why this row came back, so the UI can explain non-obvious hits. */
  matchedOn?: MatchedOn;
  /** The cross-reference that matched, on either interchange kind. */
  matchedVia?: string | null;
  /** Whose number `matchedVia` is — the vehicle maker on an OE hit. */
  matchedViaManufacturer?: string | null;
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
  /**
   * Which kinds of number the results are restricted to. Empty means look
   * everywhere, names and brands included — which is not the same as all
   * three selected, since that still drops results found only by name.
   */
  matchIn: MatchIn[];
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
    /** Which kind of number found each result. Empty without a query. */
    matchIn: { name: MatchIn; count: number }[];
  };
  products: ProductSummary[];
}

export interface Interchange {
  id: string;
  partNumber: string;
  manufacturer: string;
  /** Equivalent outright, as opposed to a close substitute. */
  exactMatch: boolean;
  /** The vehicle maker's own number, as opposed to another brand's. */
  isOEM: boolean;
}

export interface ProductDetail extends ProductSummary {
  description: string | null;
  interchanges: Interchange[];
  supplier: SupplierRef | null;
  /**
   * Every picture of the part, in the order they were arranged. Empty where
   * nobody has added one. The first leads, the same rule search follows.
   */
  images: ProductImageRef[];
}

export interface ProductResponse {
  tierName: string;
  isLoggedIn: boolean;
  product: ProductDetail;
}

export interface SessionUser {
  id: string;
  name: string;
  role: 'ADMIN' | 'SALES' | 'B2B' | 'RETAIL';
  tierName: string;
}

/**
 * One line of the basket the API keeps for the signed-in account.
 *
 * `unitPrice` is resolved fresh on every read from the caller's own tier — the
 * server stores ids and quantities only. It is here so a basket restored on a
 * new device can be rendered as a basket rather than a list of part numbers.
 */
export interface SavedBasketLine {
  productId: string;
  partNumber: string;
  name: string;
  manufacturer: string;
  stockDays: number;
  unitPrice: number;
  quantity: number;
}

export interface SavedBasket {
  /** Null when the account has never had one. */
  updatedAt: string | null;
  items: SavedBasketLine[];
}

/** order | stock | account | system — narrowed by the API, free text here. */
export type NotificationType = string;

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  /** A path on this site, or null when there is nowhere to go. */
  link: string | null;
  /** When it was read, or null while unread. */
  readAt: string | null;
  createdAt: string;
}

export interface NotificationsResponse {
  unread: number;
  notifications: AppNotification[];
}
