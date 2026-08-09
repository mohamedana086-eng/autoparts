import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  AdminCart, AdminClient, AdminCurrency, AdminNotification, AdminOrder, AdminOutlet, AdminProduct,
  AdminStats, AdminSupplier, AdminWarehouse, ClientCategory, ClientInput, ClientsResponse,
  CurrencyInput, ImageInput, MarkupRule, MarkupRulesResponse, NotificationInput,
  NotificationsResponse, OutletInput, OutletsResponse, ProductImage, ProductInput, ProductsResponse,
  StockLevel, StockRowInput, SupplierInput, SuppliersResponse, TierRef, WarehouseInput,
} from './admin.models';

/**
 * Admin API client. Every endpoint behind it is guarded server-side — the
 * route guard in this app only keeps the UI tidy, it is not the protection.
 */
@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);

  stats(): Promise<AdminStats> {
    return firstValueFrom(this.http.get<AdminStats>('/api/admin/stats'));
  }

  clients(): Promise<ClientsResponse> {
    return firstValueFrom(this.http.get<ClientsResponse>('/api/admin/clients'));
  }

  updateClient(id: string, input: ClientInput): Promise<{ client: AdminClient }> {
    return firstValueFrom(this.http.patch<{ client: AdminClient }>(`/api/admin/clients/${id}`, input));
  }

  currencies(): Promise<{ currencies: AdminCurrency[] }> {
    return firstValueFrom(this.http.get<{ currencies: AdminCurrency[] }>('/api/admin/currencies'));
  }

  createCurrency(input: CurrencyInput): Promise<{ currency: AdminCurrency }> {
    return firstValueFrom(this.http.post<{ currency: AdminCurrency }>('/api/admin/currencies', input));
  }

  updateCurrency(id: string, input: CurrencyInput): Promise<{ currency: AdminCurrency }> {
    return firstValueFrom(
      this.http.patch<{ currency: AdminCurrency }>(`/api/admin/currencies/${id}`, input)
    );
  }

  deleteCurrency(id: string): Promise<{ ok: boolean }> {
    return firstValueFrom(this.http.delete<{ ok: boolean }>(`/api/admin/currencies/${id}`));
  }

  categories(): Promise<{ categories: ClientCategory[] }> {
    return firstValueFrom(this.http.get<{ categories: ClientCategory[] }>('/api/admin/client-categories'));
  }

  createCategory(input: {
    name: string; markupPercent: number; minOrderAmount: number; shelfLifeDays: number;
  }): Promise<{ category: ClientCategory }> {
    return firstValueFrom(
      this.http.post<{ category: ClientCategory }>('/api/admin/client-categories', input)
    );
  }

  deleteCategory(id: string): Promise<{ ok: boolean }> {
    return firstValueFrom(this.http.delete<{ ok: boolean }>(`/api/admin/client-categories/${id}`));
  }

  markupRules(): Promise<MarkupRulesResponse> {
    return firstValueFrom(this.http.get<MarkupRulesResponse>('/api/admin/markup-rules'));
  }

  createRule(input: Record<string, unknown>): Promise<{ rule: MarkupRule }> {
    return firstValueFrom(this.http.post<{ rule: MarkupRule }>('/api/admin/markup-rules', input));
  }

  toggleRule(id: string, active: boolean): Promise<{ id: string; active: boolean }> {
    return firstValueFrom(
      this.http.patch<{ id: string; active: boolean }>(`/api/admin/markup-rules/${id}`, { active })
    );
  }

  deleteRule(id: string): Promise<{ ok: boolean }> {
    return firstValueFrom(this.http.delete<{ ok: boolean }>(`/api/admin/markup-rules/${id}`));
  }

  orders(): Promise<{ orders: AdminOrder[] }> {
    return firstValueFrom(this.http.get<{ orders: AdminOrder[] }>('/api/admin/orders'));
  }

  setOrderStatus(id: string, status: string): Promise<{ id: string; status: string }> {
    return firstValueFrom(
      this.http.patch<{ id: string; status: string }>(`/api/admin/orders/${id}`, { status })
    );
  }

  products(q = ''): Promise<ProductsResponse> {
    const params = q ? new HttpParams().set('q', q) : undefined;
    return firstValueFrom(this.http.get<ProductsResponse>('/api/admin/products', { params }));
  }

  createProduct(input: ProductInput): Promise<{ product: AdminProduct }> {
    return firstValueFrom(this.http.post<{ product: AdminProduct }>('/api/admin/products', input));
  }

  updateProduct(id: string, input: ProductInput): Promise<{ product: AdminProduct }> {
    return firstValueFrom(
      this.http.patch<{ product: AdminProduct }>(`/api/admin/products/${id}`, input)
    );
  }

  deleteProduct(id: string): Promise<{ ok: boolean }> {
    return firstValueFrom(this.http.delete<{ ok: boolean }>(`/api/admin/products/${id}`));
  }

  suppliers(): Promise<SuppliersResponse> {
    return firstValueFrom(this.http.get<SuppliersResponse>('/api/admin/suppliers'));
  }

  createSupplier(input: SupplierInput): Promise<{ supplier: AdminSupplier }> {
    return firstValueFrom(this.http.post<{ supplier: AdminSupplier }>('/api/admin/suppliers', input));
  }

  updateSupplier(id: string, input: SupplierInput): Promise<{ supplier: AdminSupplier }> {
    return firstValueFrom(
      this.http.patch<{ supplier: AdminSupplier }>(`/api/admin/suppliers/${id}`, input)
    );
  }

  /**
   * Sets only the rating. A body carrying nothing but the quick fields is
   * what the API reads as a classification-only edit, so clicking a star
   * cannot disturb the code or the url the supplier's page lives at.
   */
  rateSupplier(id: string, rating: number | null): Promise<{ supplier: AdminSupplier }> {
    return firstValueFrom(
      this.http.patch<{ supplier: AdminSupplier }>(`/api/admin/suppliers/${id}`, { rating })
    );
  }

  /** Sets only the return terms. Same quick-edit path as rateSupplier. */
  setSupplierReturns(
    id: string,
    acceptsReturns: boolean | null
  ): Promise<{ supplier: AdminSupplier }> {
    return firstValueFrom(
      this.http.patch<{ supplier: AdminSupplier }>(`/api/admin/suppliers/${id}`, { acceptsReturns })
    );
  }

  deleteSupplier(id: string): Promise<{ ok: boolean }> {
    return firstValueFrom(this.http.delete<{ ok: boolean }>(`/api/admin/suppliers/${id}`));
  }

  // ---------- Pictures ----------

  productImages(productId: string): Promise<{ images: ProductImage[] }> {
    return firstValueFrom(
      this.http.get<{ images: ProductImage[] }>(`/api/admin/products/${productId}/images`)
    );
  }

  /** Replaces the whole list. Array position becomes the display order. */
  saveProductImages(productId: string, images: ImageInput[]): Promise<{ images: ProductImage[] }> {
    return firstValueFrom(
      this.http.put<{ images: ProductImage[] }>(`/api/admin/products/${productId}/images`, { images })
    );
  }

  // ---------- Stock ----------

  productStock(productId: string): Promise<{ levels: StockLevel[] }> {
    return firstValueFrom(
      this.http.get<{ levels: StockLevel[] }>(`/api/admin/products/${productId}/stock`)
    );
  }

  /** Replaces this part's counts. A warehouse left out holds none. */
  saveProductStock(productId: string, levels: StockRowInput[]): Promise<{ levels: StockLevel[] }> {
    return firstValueFrom(
      this.http.put<{ levels: StockLevel[] }>(`/api/admin/products/${productId}/stock`, { levels })
    );
  }

  // ---------- Warehouses ----------

  warehouses(): Promise<{ warehouses: AdminWarehouse[] }> {
    return firstValueFrom(this.http.get<{ warehouses: AdminWarehouse[] }>('/api/admin/warehouses'));
  }

  createWarehouse(input: WarehouseInput): Promise<{ warehouse: AdminWarehouse }> {
    return firstValueFrom(
      this.http.post<{ warehouse: AdminWarehouse }>('/api/admin/warehouses', input)
    );
  }

  updateWarehouse(id: string, input: WarehouseInput): Promise<{ warehouse: AdminWarehouse }> {
    return firstValueFrom(
      this.http.patch<{ warehouse: AdminWarehouse }>(`/api/admin/warehouses/${id}`, input)
    );
  }

  deleteWarehouse(id: string): Promise<{ ok: boolean; orphanedOutlets: number }> {
    return firstValueFrom(
      this.http.delete<{ ok: boolean; orphanedOutlets: number }>(`/api/admin/warehouses/${id}`)
    );
  }

  // ---------- Outlets ----------

  outlets(): Promise<OutletsResponse> {
    return firstValueFrom(this.http.get<OutletsResponse>('/api/admin/outlets'));
  }

  createOutlet(input: OutletInput): Promise<{ outlet: AdminOutlet }> {
    return firstValueFrom(this.http.post<{ outlet: AdminOutlet }>('/api/admin/outlets', input));
  }

  updateOutlet(id: string, input: OutletInput): Promise<{ outlet: AdminOutlet }> {
    return firstValueFrom(
      this.http.patch<{ outlet: AdminOutlet }>(`/api/admin/outlets/${id}`, input)
    );
  }

  deleteOutlet(id: string): Promise<{ ok: boolean }> {
    return firstValueFrom(this.http.delete<{ ok: boolean }>(`/api/admin/outlets/${id}`));
  }

  // ---------- Open baskets ----------

  carts(): Promise<{ carts: AdminCart[] }> {
    return firstValueFrom(this.http.get<{ carts: AdminCart[] }>('/api/admin/carts'));
  }

  // ---------- Notifications ----------

  notifications(): Promise<NotificationsResponse> {
    return firstValueFrom(this.http.get<NotificationsResponse>('/api/admin/notifications'));
  }

  sendNotification(input: NotificationInput): Promise<{ notification: AdminNotification }> {
    return firstValueFrom(
      this.http.post<{ notification: AdminNotification }>('/api/admin/notifications', input)
    );
  }
}
