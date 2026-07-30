import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface OrderLine {
  partNumber: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface PlacedOrder {
  id: string;
  reference: string;
  status: string;
  createdAt: string;
  total: number;
  lines: OrderLine[];
}

export interface MyOrder {
  id: string;
  reference: string;
  status: string;
  createdAt: string;
  units: number;
  total: number;
  lines: OrderLine[];
}

@Injectable({ providedIn: 'root' })
export class OrdersService {
  private readonly http = inject(HttpClient);

  /** Only ids and quantities go up — the server prices the order itself. */
  place(items: Array<{ productId: string; quantity: number }>): Promise<{ order: PlacedOrder }> {
    return firstValueFrom(this.http.post<{ order: PlacedOrder }>('/api/orders', { items }));
  }

  mine(): Promise<{ orders: MyOrder[] }> {
    return firstValueFrom(this.http.get<{ orders: MyOrder[] }>('/api/orders'));
  }
}
