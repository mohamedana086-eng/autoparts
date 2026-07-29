import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  AdminClient, AdminOrder, AdminProduct, AdminStats, ClientCategory, MarkupRule,
  MarkupRulesResponse, ProductInput, ProductsResponse, TierRef,
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

  clients(): Promise<{ clients: AdminClient[]; categories: TierRef[] }> {
    return firstValueFrom(
      this.http.get<{ clients: AdminClient[]; categories: TierRef[] }>('/api/admin/clients')
    );
  }

  updateClient(id: string, role: string, categoryId: string | null): Promise<{ client: AdminClient }> {
    return firstValueFrom(
      this.http.patch<{ client: AdminClient }>(`/api/admin/clients/${id}`, { role, categoryId })
    );
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
}
