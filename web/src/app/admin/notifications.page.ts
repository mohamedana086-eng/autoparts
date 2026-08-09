import { Component, inject, signal } from '@angular/core';
import { AdminService } from '../core/admin.service';
import { NOTIFICATION_TYPES } from '../core/admin.models';
import type { AdminNotification, NotificationInput, TierRef } from '../core/admin.models';

const BLANK: NotificationInput = { clientId: '', type: 'system', title: '', body: '', link: '' };

@Component({
  selector: 'app-admin-notifications',
  template: `
    <h1 class="font-display text-2xl font-bold mb-1">Notifications</h1>
    <p class="text-sm text-mute mb-6 max-w-2xl">
      Messages waiting in an account's own list. Staff accounts are addressed the same way
      customers are, so an operational note and an order update use one channel.
    </p>

    @if (error()) {
      <div class="note note-alert p-3 mb-4">{{ error() }}</div>
    }
    @if (notice()) {
      <div class="note note-stock p-3 mb-4">{{ notice() }}</div>
    }

    <div class="border border-ink-line rounded-plate bg-ink-panel p-6 mb-6">
      <h2 class="font-display font-semibold mb-4">Send one</h2>
      <form class="grid md:grid-cols-4 gap-4" (submit)="send($event)">
        <label class="grid gap-1 text-xs text-mute md:col-span-2">
          To
          <select required [value]="form().clientId"
                  (change)="patch('clientId', $any($event.target).value)" class="field">
            <option value="">— pick an account —</option>
            @for (r of recipients(); track r.id) {
              <option [value]="r.id" [selected]="form().clientId === r.id">{{ r.name }}</option>
            }
          </select>
        </label>
        <label class="grid gap-1 text-xs text-mute">
          Type
          <select [value]="form().type" (change)="patch('type', $any($event.target).value)"
                  class="field">
            @for (t of types; track t) {
              <option [value]="t" [selected]="form().type === t">{{ t }}</option>
            }
          </select>
        </label>
        <label class="grid gap-1 text-xs text-mute">
          Link
          <input placeholder="/orders" [value]="form().link"
                 (input)="patch('link', $any($event.target).value)" class="field font-mono" />
          <span class="text-[11px] text-mute">A path on this site, or leave it blank.</span>
        </label>

        <label class="grid gap-1 text-xs text-mute md:col-span-4">
          Title
          <input required maxlength="200" [value]="form().title"
                 (input)="patch('title', $any($event.target).value)" class="field" />
        </label>
        <label class="grid gap-1 text-xs text-mute md:col-span-4">
          Message
          <input [value]="form().body" (input)="patch('body', $any($event.target).value)"
                 class="field" />
        </label>

        <div class="md:col-span-4 flex gap-3 mt-1">
          <button type="submit" [disabled]="sending()" class="btn-primary text-sm px-5 py-2">
            {{ sending() ? 'Sending…' : 'Send' }}
          </button>
        </div>
      </form>
    </div>

    @if (loading()) {
      <div class="panel h-40 animate-pulse"></div>
    } @else {
      <div class="table-wrap">
        <table class="w-full text-sm min-w-[820px]">
          <thead>
            <tr class="table-head">
              <th class="px-4 py-3 font-medium">Sent</th>
              <th class="px-4 py-3 font-medium">To</th>
              <th class="px-4 py-3 font-medium">Type</th>
              <th class="px-4 py-3 font-medium">Title</th>
              <th class="px-4 py-3 font-medium">Link</th>
              <th class="px-4 py-3 font-medium">Read</th>
            </tr>
          </thead>
          <tbody>
            @for (n of notifications(); track n.id) {
              <tr class="table-row">
                <td class="px-4 py-3 text-mute text-xs font-mono">{{ n.createdAt.slice(0, 10) }}</td>
                <td class="px-4 py-3">{{ n.clientName }}</td>
                <td class="px-4 py-3 text-xs font-mono text-mute">{{ n.type }}</td>
                <td class="px-4 py-3">
                  {{ n.title }}
                  @if (n.body) {
                    <span class="block text-xs text-mute">{{ n.body }}</span>
                  }
                </td>
                <td class="px-4 py-3 text-xs font-mono text-mute">{{ n.link || '—' }}</td>
                <td class="px-4 py-3 text-xs">
                  @if (n.readAt) {
                    <span class="text-mute font-mono">{{ n.readAt.slice(0, 10) }}</span>
                  } @else {
                    <span class="text-signal">Unread</span>
                  }
                </td>
              </tr>
            }
            @if (notifications().length === 0) {
              <tr>
                <td colspan="6" class="px-4 py-8 text-center text-mute text-sm">
                  Nothing has been sent yet.
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class AdminNotificationsPage {
  private readonly admin = inject(AdminService);

  protected readonly types = NOTIFICATION_TYPES;

  protected readonly notifications = signal<AdminNotification[]>([]);
  protected readonly recipients = signal<TierRef[]>([]);
  protected readonly loading = signal(true);
  protected readonly sending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly form = signal<NotificationInput>({ ...BLANK });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.admin
      .notifications()
      .then((res) => {
        this.notifications.set(res.notifications);
        this.recipients.set(res.recipients);
        this.loading.set(false);
      })
      .catch(() => {
        this.error.set('Could not load notifications.');
        this.loading.set(false);
      });
  }

  protected patch<K extends keyof NotificationInput>(key: K, value: string): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  protected async send(event: Event): Promise<void> {
    event.preventDefault();
    if (this.sending()) return;

    this.sending.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const res = await this.admin.sendNotification(this.form());
      // Prepended rather than reloading: the list is newest-first, so the row
      // belongs exactly where the response goes.
      this.notifications.update((list) => [res.notification, ...list]);
      this.notice.set(`Sent to ${res.notification.clientName}.`);
      this.form.set({ ...BLANK });
    } catch (err: any) {
      this.error.set(err?.error?.error ?? 'Could not send that.');
    } finally {
      this.sending.set(false);
    }
  }
}
