import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface VehicleVariant {
  id: string;
  name: string;
  engineCode: string | null;
  powerKw: number | null;
  fuel: string;
  yearFrom: number;
  yearTo: number | null;
}

export interface VehicleModel {
  id: string;
  name: string;
  yearFrom: number;
  yearTo: number | null;
  variants: VehicleVariant[];
}

export interface VehicleMake {
  id: string;
  name: string;
  models: VehicleModel[];
}

export interface VinCandidate {
  variantId: string;
  modelId: string;
  label: string;
  engineCode: string | null;
  fuel: string;
  yearFrom: number;
  yearTo: number | null;
}

export interface VinReading {
  vin: string;
  wmi: string;
  modelYear: number | null;
  modelYearIsEstimate: boolean;
  checkDigitValid: boolean | null;
  make: { id: string; name: string } | null;
  candidates: VinCandidate[];
  message: string | null;
}

@Injectable({ providedIn: 'root' })
export class VehiclesService {
  private readonly http = inject(HttpClient);

  private cached: Promise<{ makes: VehicleMake[] }> | null = null;

  /** The tree is small and never changes mid-session, so fetch it once. */
  all(): Promise<{ makes: VehicleMake[] }> {
    this.cached ??= firstValueFrom(this.http.get<{ makes: VehicleMake[] }>('/api/vehicles'));
    return this.cached;
  }

  decodeVin(vin: string): Promise<VinReading> {
    const params = new HttpParams().set('vin', vin);
    return firstValueFrom(this.http.get<VinReading>('/api/vehicles/vin', { params }));
  }
}
