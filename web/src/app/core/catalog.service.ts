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

  search(q: string, system?: string | null): Observable<SearchResponse> {
    let params = new HttpParams();
    if (q) params = params.set('q', q);
    if (system) params = params.set('system', system);
    return this.http.get<SearchResponse>('/api/catalog/search', { params });
  }

  product(id: string): Observable<ProductResponse> {
    return this.http.get<ProductResponse>(`/api/catalog/products/${id}`);
  }
}
