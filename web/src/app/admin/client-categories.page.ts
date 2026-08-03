import { Component, inject, signal } from '@angular/core';
import { AdminService } from '../core/admin.service';
import type { ClientCategory } from '../core/admin.models';

@Component({
  selector: 'app-admin-client-categories',
  template: `
    <h1 class="font-display text-2xl font-bold mb-1">Client categories</h1>
    <p class="text-sm text-mute mb-6">
      Each client belongs to one category, which sets the default markup applied when no
      more specific markup rule matches.
    </p>

    @if (error()) {
      <div class="note note-alert p-4 mb-4">{{ error() }}</div>
    }

    @if (loading()) {
      <div class="panel h-40 animate-pulse mb-8"></div>
    } @else {
      <div class="border border-ink-line rounded-plate overflow-x-auto mb-8">
        <table class="w-full text-sm min-w-[640px]">
          <thead>
            <tr class="bg-ink-panel text-mute text-xs uppercase tracking-wider text-left">
              <th class="px-4 py-3 font-medium">Category</th>
              <th class="px-4 py-3 font-medium">Markup %</th>
              <th class="px-4 py-3 font-medium">Min. order</th>
              <th class="px-4 py-3 font-medium">Shelf life (days)</th>
              <th class="px-4 py-3 font-medium">Clients</th>
              <th class="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            @for (c of categories(); track c.id) {
              <tr class="border-t border-ink-line hover:bg-ink-panel/60">
                <td class="px-4 py-3 font-medium">{{ c.name }}</td>
                <td class="px-4 py-3 font-mono text-signal">{{ c.markupPercent }}%</td>
                <td class="px-4 py-3 font-mono">€{{ c.minOrderAmount.toFixed(2) }}</td>
                <td class="px-4 py-3 font-mono">{{ c.shelfLifeDays }}</td>
                <td class="px-4 py-3 font-mono">{{ c.clientCount }}</td>
                <td class="px-4 py-3 text-right">
                  <button type="button" (click)="remove(c)" [disabled]="deletingId() === c.id"
                          class="text-mute hover:text-alert disabled:opacity-50 transition-colors text-xs uppercase font-mono"
                          [attr.aria-label]="'Delete ' + c.name">
                    {{ deletingId() === c.id ? '…' : 'Delete' }}
                  </button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }

    <div class="panel p-6 max-w-xl">
      <h2 class="font-display font-semibold mb-4">Add category</h2>
      <form class="grid grid-cols-2 gap-4" (submit)="create($event)">
        <label class="grid gap-1 text-xs text-mute col-span-2">
          Name
          <input required placeholder="e.g. Price 11"
                 [value]="name()" (input)="name.set($any($event.target).value)"
                 class="field" />
        </label>
        <label class="grid gap-1 text-xs text-mute">
          Markup %
          <input type="number" step="0.01" required
                 [value]="markupPercent()" (input)="markupPercent.set($any($event.target).value)"
                 class="field" />
        </label>
        <label class="grid gap-1 text-xs text-mute">
          Min. order (€)
          <input type="number" step="0.01"
                 [value]="minOrderAmount()" (input)="minOrderAmount.set($any($event.target).value)"
                 class="field" />
        </label>
        <label class="grid gap-1 text-xs text-mute">
          Shelf life (days)
          <input type="number"
                 [value]="shelfLifeDays()" (input)="shelfLifeDays.set($any($event.target).value)"
                 class="field" />
        </label>
        <button type="submit" [disabled]="creating()"
                class="col-span-2 mt-2 btn-primary py-2.5">
          {{ creating() ? 'Adding…' : 'Add category' }}
        </button>
      </form>
    </div>
  `,
})
export class AdminClientCategoriesPage {
  private readonly admin = inject(AdminService);

  protected readonly categories = signal<ClientCategory[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly creating = signal(false);
  protected readonly deletingId = signal<string | null>(null);

  protected readonly name = signal('');
  protected readonly markupPercent = signal('');
  protected readonly minOrderAmount = signal('0');
  protected readonly shelfLifeDays = signal('1');

  constructor() {
    this.load();
  }

  private load(): void {
    this.admin
      .categories()
      .then((res) => {
        this.categories.set(res.categories);
        this.loading.set(false);
      })
      .catch(() => {
        this.error.set('Could not load categories.');
        this.loading.set(false);
      });
  }

  protected async create(event: Event): Promise<void> {
    event.preventDefault();
    if (this.creating()) return;

    this.creating.set(true);
    this.error.set(null);
    try {
      await this.admin.createCategory({
        name: this.name().trim(),
        markupPercent: Number(this.markupPercent()),
        minOrderAmount: Number(this.minOrderAmount()),
        shelfLifeDays: Number(this.shelfLifeDays()),
      });
      this.name.set('');
      this.markupPercent.set('');
      this.minOrderAmount.set('0');
      this.shelfLifeDays.set('1');
      this.load();
    } catch (err: any) {
      this.error.set(err?.error?.error ?? 'Could not add that category.');
    } finally {
      this.creating.set(false);
    }
  }

  protected async remove(category: ClientCategory): Promise<void> {
    this.deletingId.set(category.id);
    this.error.set(null);
    try {
      await this.admin.deleteCategory(category.id);
      this.categories.update((list) => list.filter((c) => c.id !== category.id));
    } catch (err: any) {
      // The API explains why a tier in use cannot go — surface that verbatim.
      this.error.set(err?.error?.error ?? 'Could not delete that category.');
    } finally {
      this.deletingId.set(null);
    }
  }
}
