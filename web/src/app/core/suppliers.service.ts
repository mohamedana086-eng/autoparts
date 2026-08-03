import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface SupplierSummary {
  id: string;
  code: string;
  slug: string;
  name: string;
  description: string | null;
  /** What the trading relationship is: official / reliable / standard. */
  reliability: string;
  /** How well they perform, 1–5, or null when nobody has rated them yet. */
  rating: number | null;
  /** Whether they take stock back. Null when the terms are not established,
   *  which is not the same as knowing they refuse. */
  acceptsReturns: boolean | null;
  productCount: number;
}

export interface SupplierDetail extends SupplierSummary {
  fastestDelivery: number | null;
  systems: { slug: string; name: string; count: number }[];
  brands: { name: string; count: number }[];
}

@Injectable({ providedIn: 'root' })
export class SuppliersService {
  private readonly http = inject(HttpClient);

  all(): Promise<{ suppliers: SupplierSummary[] }> {
    return firstValueFrom(this.http.get<{ suppliers: SupplierSummary[] }>('/api/suppliers'));
  }

  one(slug: string): Promise<{ supplier: SupplierDetail }> {
    return firstValueFrom(this.http.get<{ supplier: SupplierDetail }>(`/api/suppliers/${slug}`));
  }
}
