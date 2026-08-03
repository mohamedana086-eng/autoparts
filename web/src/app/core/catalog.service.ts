import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import type { ProductResponse, SearchResponse, VehicleSystem } from './api.models';

@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly http = inject(HttpClient);

  systems(): Observable<{ systems: VehicleSystem[] }> {
    return this.http.get<{ systems: VehicleSystem[] }>('/api/systems');
  }

  search(opts: {
    q?: string | null;
    system?: string | null;
    manufacturer?: string | null;
    variant?: string | null;
    supplier?: string | null;
    sort?: string | null;
    minRating?: string | null;
    reliability?: string | null;
    returns?: string | null;
    minPrice?: string | null;
    maxPrice?: string | null;
    limit?: number;
  }): Observable<SearchResponse> {
    let params = new HttpParams();
    if (opts.q) params = params.set('q', opts.q);
    if (opts.system) params = params.set('system', opts.system);
    if (opts.manufacturer) params = params.set('manufacturer', opts.manufacturer);
    if (opts.variant) params = params.set('variant', opts.variant);
    if (opts.supplier) params = params.set('supplier', opts.supplier);
    if (opts.sort && opts.sort !== 'relevance') params = params.set('sort', opts.sort);
    if (opts.minRating) params = params.set('minRating', opts.minRating);
    if (opts.reliability) params = params.set('reliability', opts.reliability);
    if (opts.returns) params = params.set('returns', opts.returns);
    if (opts.minPrice) params = params.set('minPrice', opts.minPrice);
    if (opts.maxPrice) params = params.set('maxPrice', opts.maxPrice);
    if (opts.limit) params = params.set('limit', String(opts.limit));
    return this.http.get<SearchResponse>('/api/catalog/search', { params });
  }

  /** Small, ranked slice for the header's type-ahead. */
  suggest(q: string): Observable<SearchResponse> {
    return this.search({ q, limit: 6 });
  }

  /** Promise form, for callers that just need the result once. */
  searchOnce(opts: Parameters<CatalogService['search']>[0]): Promise<SearchResponse> {
    return firstValueFrom(this.search(opts));
  }

  product(id: string): Observable<ProductResponse> {
    return this.http.get<ProductResponse>(`/api/catalog/products/${id}`);
  }
}
