import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
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
    sort?: string | null;
    limit?: number;
  }): Observable<SearchResponse> {
    let params = new HttpParams();
    if (opts.q) params = params.set('q', opts.q);
    if (opts.system) params = params.set('system', opts.system);
    if (opts.manufacturer) params = params.set('manufacturer', opts.manufacturer);
    if (opts.sort && opts.sort !== 'relevance') params = params.set('sort', opts.sort);
    if (opts.limit) params = params.set('limit', String(opts.limit));
    return this.http.get<SearchResponse>('/api/catalog/search', { params });
  }

  /** Small, ranked slice for the header's type-ahead. */
  suggest(q: string): Observable<SearchResponse> {
    return this.search({ q, limit: 6 });
  }

  product(id: string): Observable<ProductResponse> {
    return this.http.get<ProductResponse>(`/api/catalog/products/${id}`);
  }
}
