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

/** One part on an order, as the admin list reports it. */
export interface AdminOrderLine {
  productId: string;
  partNumber: string;
  name: string;
  manufacturer: string;
  /** The vehicle system it belongs to — what kind of part this is. */
  system: string;
  quantity: number;
  /** Base currency, matching `AdminOrder.total` rather than the quoted sum. */
  unitPrice: number;
  lineTotal: number;
}

export interface AdminOrder {
  id: string;
  reference: string;
  clientName: string;
  status: string;
  createdAt: string;
  units: number;
  /** Distinct parts. `units` alone cannot tell four of one from one of four. */
  lineCount: number;
  total: number;
  lines: AdminOrderLine[];
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
  supplierId: string | null;
  supplierName: string | null;
  interchangeCount: number;
  imageCount: number;
  /** The leading picture, for the list thumbnail. Null when there are none. */
  primaryImageUrl: string | null;
  /** Summed across warehouses. Null means the caller did not ask for stock —
   *  not the same as holding none. */
  stockOnHand: number | null;
  stockAvailable: number | null;
}

export interface ProductInput {
  partNumber: string;
  name: string;
  description: string;
  manufacturerId: string;
  vehicleSystemId: string;
  supplierId: string | null;
  basePrice: number;
  /** Blank on a new part means "use the supplier's default lead time". */
  stockDays: string;
}

export interface ProductsResponse {
  products: AdminProduct[];
  manufacturers: TierRef[];
  systems: TierRef[];
  suppliers: TierRef[];
  /** Active warehouses, so the stock editor has somewhere to put a first count. */
  warehouses: TierRef[];
}

// ---------- Pictures ----------

export interface ProductImage {
  id: string;
  url: string;
  alt: string | null;
  sortOrder: number;
}

/** What the editor submits. Position in the array is the display order. */
export interface ImageInput {
  url: string;
  alt: string;
}

// ---------- Inventory ----------

export interface AdminWarehouse {
  id: string;
  code: string;
  name: string;
  city: string | null;
  address: string | null;
  active: boolean;
  /** Which warehouse is drawn from first when nothing says which. Higher wins. */
  priority: number;
  outletCount: number;
  /** Distinct parts held here, not units. */
  skuCount: number;
  totalQuantity: number;
  totalReserved: number;
}

export interface WarehouseInput {
  code: string;
  name: string;
  city: string;
  address: string;
  active: boolean;
  priority: number;
}

export interface StockLevel {
  id: string;
  warehouseId: string;
  warehouseName: string | null;
  warehouseCode: string | null;
  quantity: number;
  reserved: number;
  /** quantity − reserved. Derived by the API, never stored. */
  available: number;
  binLocation: string | null;
  updatedAt: string;
}

/** One row of the stock editor. Sent as a set — see the API. */
export interface StockRowInput {
  warehouseId: string;
  quantity: number;
  reserved: number;
  binLocation: string;
}

export interface AdminOutlet {
  id: string;
  code: string;
  name: string;
  city: string | null;
  address: string | null;
  phone: string | null;
  warehouseId: string | null;
  warehouseName: string | null;
  warehouseCode: string | null;
  active: boolean;
}

export interface OutletInput {
  code: string;
  name: string;
  city: string;
  address: string;
  phone: string;
  warehouseId: string | null;
  active: boolean;
}

export interface OutletsResponse {
  outlets: AdminOutlet[];
  warehouses: TierRef[];
}

// ---------- Open baskets ----------

export interface AdminCartItem {
  productId: string;
  partNumber: string;
  name: string;
  quantity: number;
}

export interface AdminCart {
  id: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  updatedAt: string;
  units: number;
  /** Purchase cost of the lines, not what the customer would be quoted. */
  cost: number;
  items: AdminCartItem[];
}

// ---------- Notifications ----------

export const NOTIFICATION_TYPES = ['system', 'order', 'stock', 'account'] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface AdminNotification {
  id: string;
  clientId: string;
  clientName: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationInput {
  clientId: string;
  type: string;
  title: string;
  body: string;
  /** A path on this site. The API refuses anything off-site. */
  link: string;
}

export interface NotificationsResponse {
  notifications: AdminNotification[];
  recipients: TierRef[];
}

/** What the trading relationship is. Distinct from `rating`, which is how
 *  well they actually perform. */
/** Mirrors lib/supplier-classification.ts on the API. Strongest first. */
export const RELIABILITIES = ['official', 'dealer', 'reliable', 'standard'] as const;

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
  country: string | null;
  /** Warranty in months. Null means none agreed. */
  guaranteeMonths: number | null;
  /** Lead time inherited by new parts that leave theirs blank. */
  defaultStockDays: number | null;
  /** What they invoice in. Reference only — does not affect pricing. */
  purchaseCurrencyId: string | null;
  purchaseCurrencyCode: string | null;
  productCount: number;
}

export interface SuppliersResponse {
  suppliers: AdminSupplier[];
  currencies: TierRef[];
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
  country: string;
  /** Empty string clears it. */
  guaranteeMonths: string;
  defaultStockDays: string;
  purchaseCurrencyId: string | null;
}
