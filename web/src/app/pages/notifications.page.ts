import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NotificationsService } from '../core/notifications.service';
import { AuthService } from '../core/auth.service';
import type { AppNotification } from '../core/api.models';

const TYPE_STYLE: Record<string, string> = {
  order: 'border-signal text-signal',
  stock: 'border-stock text-stock',
  account: 'border-ink-line text-paper',
  system: 'border-ink-line text-mute',
};

@Component({
  selector: 'app-notifications',
  imports: [RouterLink],
  template: `
    <div class="max-w-3xl mx-auto px-6 py-10">
      <div class="flex flex-wrap items-baseline justify-between gap-3 mb-1">
        <h1 class="font-display text-2xl font-bold">Notifications</h1>
        @if (notifications.unread() > 0) {
          <button type="button" (click)="markAllRead()" class="link-signal text-sm">
            Mark all as read
          </button>
        }
      </div>
      <p class="text-sm text-mute mb-8">
        Order updates, stock news and messages from the team, newest first.
      </p>

      @if (!auth.isLoggedIn() && auth.loaded()) {
        <div class="border border-dashed border-ink-line rounded-plate p-12 text-center">
          <p class="text-mute text-sm">
            <a routerLink="/login" class="link-signal">Sign in</a> to see your notifications.
          </p>
        </div>
      } @else if (!notifications.loaded()) {
        <div class="grid gap-3">
          @for (n of [0, 1, 2]; track n) {
            <div class="panel h-20 animate-pulse"></div>
          }
        </div>
      } @else if (notifications.items().length === 0) {
        <div class="border border-dashed border-ink-line rounded-plate p-12 text-center">
          <p class="text-mute text-sm">Nothing yet. We will tell you here when there is.</p>
        </div>
      } @else {
        <div class="grid gap-3">
          @for (n of notifications.items(); track n.id) {
            <!-- The whole row is the control: an unread notice with a link
                 should not need two separate clicks to read it and follow it. -->
            <button type="button" (click)="open(n)"
                    class="panel p-4 text-left w-full transition-colors hover:bg-ink-raised"
                    [class.border-signal]="n.readAt === null">
              <div class="flex items-baseline gap-3">
                @if (n.readAt === null) {
                  <span class="w-1.5 h-1.5 rounded-full bg-signal shrink-0 mt-1.5"
                        aria-label="Unread"></span>
                }
                <div class="flex-1 min-w-0">
                  <div class="flex flex-wrap items-baseline gap-2">
                    <p class="font-semibold text-sm" [class.text-mute]="n.readAt !== null">
                      {{ n.title }}
                    </p>
                    <span class="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded-plate border"
                          [class]="typeClass(n.type)">
                      {{ n.type }}
                    </span>
                  </div>
                  @if (n.body) {
                    <p class="text-sm text-mute mt-1 leading-relaxed">{{ n.body }}</p>
                  }
                  <p class="text-xs text-mute mt-2 font-mono">
                    {{ n.createdAt.slice(0, 10) }}
                    @if (n.link) { <span class="text-signal ml-2">Open →</span> }
                  </p>
                </div>
              </div>
            </button>
          }
        </div>
      }
    </div>
  `,
})
export class NotificationsPage {
  protected readonly notifications = inject(NotificationsService);
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected typeClass(type: string): string {
    return TYPE_STYLE[type] ?? TYPE_STYLE['system'];
  }

  protected markAllRead(): void {
    void this.notifications.markAllRead();
  }

  /**
   * Reading one and following it are the same action.
   *
   * The link is navigated with the router rather than assigned to the address
   * bar: the API only ever stores a path on this site, and routing keeps it
   * that way even if one ever slipped through as something else.
   */
  protected open(n: AppNotification): void {
    void this.notifications.markRead(n.id);
    if (n.link) this.router.navigateByUrl(n.link);
  }
}
