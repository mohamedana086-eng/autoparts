import { Component, inject, signal } from '@angular/core';
import { AdminService } from '../core/admin.service';
import type { MarkupRule, TierRef } from '../core/admin.models';

@Component({
  selector: 'app-admin-markup-rules',
  template: `
    <h1 class="font-display text-2xl font-bold mb-1">Markup rules</h1>
    <p class="text-sm text-mute mb-6 max-w-2xl">
      A rule matches when every filter you set applies (blank filters mean "any").
      When several rules match the same product, the most specific one wins — see the
      priority column to break ties. This is the same logic as the source system's
      "Complex markup" screen.
    </p>

    @if (error()) {
      <div class="note note-alert p-4 mb-4">{{ error() }}</div>
    }

    @if (loading()) {
      <div class="panel h-40 animate-pulse mb-8"></div>
    } @else {
      <div class="border border-ink-line rounded-plate overflow-x-auto mb-8">
        <table class="w-full text-sm min-w-[900px]">
          <thead>
            <tr class="bg-ink-panel text-mute text-xs uppercase tracking-wider text-left">
              <th class="px-4 py-3 font-medium">Label</th>
              <th class="px-4 py-3 font-medium">Category</th>
              <th class="px-4 py-3 font-medium">Supplier</th>
              <th class="px-4 py-3 font-medium">Manufacturer</th>
              <th class="px-4 py-3 font-medium">System</th>
              <th class="px-4 py-3 font-medium">Price band</th>
              <th class="px-4 py-3 font-medium">Adjustment</th>
              <th class="px-4 py-3 font-medium">Active</th>
              <th class="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            @for (r of rules(); track r.id) {
              <tr class="border-t border-ink-line hover:bg-ink-panel/60">
                <td class="px-4 py-3 font-medium">{{ r.label }}</td>
                <td class="px-4 py-3 text-mute">{{ r.clientCategoryName ?? 'any' }}</td>
                <td class="px-4 py-3 text-mute">{{ r.supplierName ?? 'any' }}</td>
                <td class="px-4 py-3 text-mute">{{ r.manufacturerName ?? 'any' }}</td>
                <td class="px-4 py-3 text-mute">{{ r.vehicleSystemSlug ?? 'any' }}</td>
                <td class="px-4 py-3 font-mono text-xs text-mute">{{ band(r) }}</td>
                <td class="px-4 py-3 font-mono text-signal">{{ adjustment(r) }}</td>
                <td class="px-4 py-3">
                  <button type="button" (click)="toggle(r)" [disabled]="busyId() === r.id"
                          class="text-[10px] font-mono uppercase px-2 py-1 rounded-plate border disabled:opacity-50"
                          [class]="r.active ? 'border-stock text-stock' : 'border-ink-line text-mute'">
                    {{ r.active ? 'active' : 'off' }}
                  </button>
                </td>
                <td class="px-4 py-3 text-right">
                  <button type="button" (click)="remove(r)" [disabled]="busyId() === r.id"
                          class="text-mute hover:text-alert disabled:opacity-50 transition-colors text-xs uppercase font-mono"
                          [attr.aria-label]="'Delete ' + r.label">Delete</button>
                </td>
              </tr>
            }
            @if (rules().length === 0) {
              <tr><td colspan="9" class="px-4 py-8 text-center text-mute text-sm">No markup rules yet.</td></tr>
            }
          </tbody>
        </table>
      </div>
    }

    <div class="panel p-6">
      <h2 class="font-display font-semibold mb-4">New markup rule</h2>
      <form class="grid md:grid-cols-3 gap-4" (submit)="create($event)">
        <label class="grid gap-1 text-xs text-mute md:col-span-2">
          Label
          <input required placeholder="e.g. BMW cooling parts — Price 9 club"
                 [value]="label()" (input)="label.set($any($event.target).value)"
                 class="field" />
        </label>
        <label class="grid gap-1 text-xs text-mute">
          Priority (higher wins ties)
          <input type="number" [value]="priority()" (input)="priority.set($any($event.target).value)"
                 class="field" />
        </label>

        <label class="grid gap-1 text-xs text-mute">
          Client category
          <select [value]="clientCategoryId()" (change)="clientCategoryId.set($any($event.target).value)"
                  class="field">
            <option value="">— any —</option>
            @for (c of categories(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }
          </select>
        </label>
        <label class="grid gap-1 text-xs text-mute">
          Supplier
          <select [value]="supplierId()" (change)="supplierId.set($any($event.target).value)"
                  class="field">
            <option value="">— any —</option>
            @for (s of suppliers(); track s.id) { <option [value]="s.id">{{ s.name }}</option> }
          </select>
        </label>
        <label class="grid gap-1 text-xs text-mute">
          Vehicle system
          <select [value]="vehicleSystemSlug()" (change)="vehicleSystemSlug.set($any($event.target).value)"
                  class="field">
            <option value="">— any —</option>
            @for (s of systems(); track s.slug) { <option [value]="s.slug">{{ s.name }}</option> }
          </select>
        </label>

        <label class="grid gap-1 text-xs text-mute">
          Manufacturer name
          <input placeholder="e.g. BMW" [value]="manufacturerName()" (input)="manufacturerName.set($any($event.target).value)"
                 class="field" />
        </label>
        <label class="grid gap-1 text-xs text-mute">
          Part number prefix
          <input placeholder="e.g. 1713" [value]="partNumberPrefix()" (input)="partNumberPrefix.set($any($event.target).value)"
                 class="field" />
        </label>
        <div></div>

        <label class="grid gap-1 text-xs text-mute">
          Purchase price from (€)
          <input type="number" step="0.01" [value]="purchasePriceFrom()" (input)="purchasePriceFrom.set($any($event.target).value)"
                 class="field" />
        </label>
        <label class="grid gap-1 text-xs text-mute">
          Purchase price to (€)
          <input type="number" step="0.01" [value]="purchasePriceTo()" (input)="purchasePriceTo.set($any($event.target).value)"
                 class="field" />
        </label>
        <div></div>

        <label class="grid gap-1 text-xs text-mute">
          Adjustment type
          <select [value]="type()" (change)="type.set($any($event.target).value)"
                  class="field">
            <option value="PERCENT">Percent (+%)</option>
            <option value="AMOUNT">Flat amount (+€)</option>
            <option value="FIXED">Fixed price (=€)</option>
          </select>
        </label>
        <label class="grid gap-1 text-xs text-mute">
          Value
          <input type="number" step="0.01" required [value]="value()" (input)="value.set($any($event.target).value)"
                 class="field" />
        </label>

        <button type="submit" [disabled]="creating()"
                class="md:col-span-3 mt-2 btn-primary py-2.5">
          {{ creating() ? 'Creating…' : 'Create rule' }}
        </button>
      </form>
    </div>
  `,
})
export class AdminMarkupRulesPage {
  private readonly admin = inject(AdminService);

  protected readonly rules = signal<MarkupRule[]>([]);
  protected readonly categories = signal<TierRef[]>([]);
  protected readonly suppliers = signal<TierRef[]>([]);
  protected readonly systems = signal<{ slug: string; name: string }[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly creating = signal(false);
  protected readonly busyId = signal<string | null>(null);

  protected readonly label = signal('');
  protected readonly priority = signal('0');
  protected readonly clientCategoryId = signal('');
  protected readonly supplierId = signal('');
  protected readonly vehicleSystemSlug = signal('');
  protected readonly manufacturerName = signal('');
  protected readonly partNumberPrefix = signal('');
  protected readonly purchasePriceFrom = signal('');
  protected readonly purchasePriceTo = signal('');
  protected readonly type = signal('PERCENT');
  protected readonly value = signal('');

  constructor() {
    this.load();
  }

  private load(): void {
    this.admin
      .markupRules()
      .then((res) => {
        this.rules.set(res.rules);
        this.categories.set(res.categories);
        this.suppliers.set(res.suppliers);
        this.systems.set(res.systems);
        this.loading.set(false);
      })
      .catch(() => {
        this.error.set('Could not load markup rules.');
        this.loading.set(false);
      });
  }

  protected band(r: MarkupRule): string {
    if (r.purchasePriceFrom == null && r.purchasePriceTo == null) return 'any';
    return `€${r.purchasePriceFrom ?? 0}–${r.purchasePriceTo ?? '∞'}`;
  }

  protected adjustment(r: MarkupRule): string {
    if (r.type === 'PERCENT') return `+${r.value}%`;
    if (r.type === 'AMOUNT') return `+€${r.value}`;
    return `= €${r.value}`;
  }

  protected async toggle(rule: MarkupRule): Promise<void> {
    this.busyId.set(rule.id);
    this.error.set(null);
    try {
      const res = await this.admin.toggleRule(rule.id, !rule.active);
      this.rules.update((list) => list.map((r) => (r.id === rule.id ? { ...r, active: res.active } : r)));
    } catch (err: any) {
      this.error.set(err?.error?.error ?? 'Could not change that rule.');
    } finally {
      this.busyId.set(null);
    }
  }

  protected async remove(rule: MarkupRule): Promise<void> {
    this.busyId.set(rule.id);
    this.error.set(null);
    try {
      await this.admin.deleteRule(rule.id);
      this.rules.update((list) => list.filter((r) => r.id !== rule.id));
    } catch (err: any) {
      this.error.set(err?.error?.error ?? 'Could not delete that rule.');
    } finally {
      this.busyId.set(null);
    }
  }

  protected async create(event: Event): Promise<void> {
    event.preventDefault();
    if (this.creating()) return;

    this.creating.set(true);
    this.error.set(null);
    try {
      await this.admin.createRule({
        label: this.label().trim(),
        priority: this.priority(),
        clientCategoryId: this.clientCategoryId(),
        supplierId: this.supplierId(),
        vehicleSystemSlug: this.vehicleSystemSlug(),
        manufacturerName: this.manufacturerName(),
        partNumberPrefix: this.partNumberPrefix(),
        purchasePriceFrom: this.purchasePriceFrom(),
        purchasePriceTo: this.purchasePriceTo(),
        type: this.type(),
        value: this.value(),
      });
      this.label.set('');
      this.value.set('');
      this.manufacturerName.set('');
      this.partNumberPrefix.set('');
      this.purchasePriceFrom.set('');
      this.purchasePriceTo.set('');
      this.load();
    } catch (err: any) {
      this.error.set(err?.error?.error ?? 'Could not create that rule.');
    } finally {
      this.creating.set(false);
    }
  }
}
