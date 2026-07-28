import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { SessionUser } from './api.models';

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  role: 'RETAIL' | 'B2B';
  city?: string;
}

/**
 * Session state for the app shell.
 *
 * The session itself lives in an httpOnly cookie set by the API, so it is
 * never readable here — this only mirrors who the API says we are.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  private readonly _user = signal<SessionUser | null>(null);
  private readonly _loaded = signal(false);

  readonly user = this._user.asReadonly();
  readonly loaded = this._loaded.asReadonly();
  readonly isLoggedIn = computed(() => this._user() !== null);
  readonly isAdmin = computed(() => this._user()?.role === 'ADMIN');

  async refresh(): Promise<void> {
    try {
      const res = await firstValueFrom(this.http.get<{ user: SessionUser | null }>('/api/auth/session'));
      this._user.set(res.user);
    } catch {
      this._user.set(null);
    } finally {
      this._loaded.set(true);
    }
  }

  async login(email: string, password: string): Promise<void> {
    const res = await firstValueFrom(
      this.http.post<{ user: SessionUser }>('/api/auth/login', { email, password })
    );
    this._user.set(res.user);
    await this.refresh();
  }

  async register(input: RegisterInput): Promise<void> {
    const res = await firstValueFrom(
      this.http.post<{ user: SessionUser }>('/api/auth/register', input)
    );
    this._user.set(res.user);
    await this.refresh();
  }

  async logout(): Promise<void> {
    await firstValueFrom(this.http.post<{ ok: boolean }>('/api/auth/logout', {}));
    this._user.set(null);
  }
}
