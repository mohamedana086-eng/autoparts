import { HttpClient } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import type { AppNotification, NotificationsResponse } from './api.models';

/**
 * What the signed-in account has been told.
 *
 * Fetched once when a session appears and after that only when something acts
 * on it. There is no polling: an admin sending a notice is not an event the
 * customer is waiting on, and a request every few seconds from every open tab
 * costs more than the freshness is worth. A page load picks up anything new.
 */
@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private readonly _items = signal<AppNotification[]>([]);
  private readonly _loaded = signal(false);

  readonly items = this._items.asReadonly();
  readonly loaded = this._loaded.asReadonly();

  /** Counted from the list rather than kept as its own number, so marking one
   *  read cannot leave the badge disagreeing with what is on screen. */
  readonly unread = computed(() => this._items().filter((n) => n.readAt === null).length);

  private loadedForUserId: string | null = null;

  constructor() {
    effect(() => {
      const id = this.auth.user()?.id ?? null;
      if (id === this.loadedForUserId) return;
      this.loadedForUserId = id;

      if (id) void this.refresh();
      else this.forget();
    });
  }

  async refresh(): Promise<void> {
    try {
      const res = await firstValueFrom(this.http.get<NotificationsResponse>('/api/notifications'));
      this._items.set(res.notifications);
    } catch {
      this._items.set([]);
    } finally {
      this._loaded.set(true);
    }
  }

  /**
   * Marks one read.
   *
   * Applied here first so the row stops looking unread the moment it is
   * opened. The endpoint treats an already-read notification as a success, so
   * the only thing a failure means is that the server never heard — and the
   * next refresh puts the row back as unread, which is the honest answer.
   */
  async markRead(id: string): Promise<void> {
    const already = this._items().find((n) => n.id === id)?.readAt;
    if (already) return;

    const readAt = new Date().toISOString();
    this._items.update((prev) => prev.map((n) => (n.id === id ? { ...n, readAt } : n)));

    try {
      await firstValueFrom(this.http.patch<{ ok: boolean }>(`/api/notifications/${id}`, {}));
    } catch {
      await this.refresh();
    }
  }

  async markAllRead(): Promise<void> {
    if (this.unread() === 0) return;

    const readAt = new Date().toISOString();
    this._items.update((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt })));

    try {
      await firstValueFrom(this.http.post<{ ok: boolean; marked: number }>('/api/notifications', {}));
    } catch {
      await this.refresh();
    }
  }

  private forget(): void {
    this._items.set([]);
    this._loaded.set(false);
  }
}
