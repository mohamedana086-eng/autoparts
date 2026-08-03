import { Component, input } from '@angular/core';

/**
 * A supplier's performance rating as stars.
 *
 * One component rather than the same markup in four templates, because the
 * accessible name is the part that is easy to get subtly wrong: the stars
 * themselves are decoration and must be hidden, and the rating has to reach a
 * screen reader as words. Doing that with `aria-label` on a plain `<span>`
 * relies on labelling an element with no role, which browsers expose
 * inconsistently — so the name is real text in an `sr-only` span instead,
 * which is announced everywhere.
 *
 *   <app-supplier-rating [rating]="s.rating" [name]="s.name" />
 *
 * `rating` may be null: unrated is a real state and different from a bad
 * rating, so it says so rather than rendering an empty row of stars.
 */
@Component({
  selector: 'app-supplier-rating',
  template: `
    @if (rating(); as value) {
      <span class="inline-flex items-baseline gap-1 leading-none">
        <span aria-hidden="true">
          <span class="text-signal">{{ filled(value) }}</span><span
            class="text-ink-line">{{ empty(value) }}</span>
        </span>
        <span class="sr-only">{{ label() }} rated {{ value }} out of {{ max }}</span>
      </span>
    } @else if (showUnrated()) {
      <span class="text-[11px] text-mute">Unrated</span>
    }
  `,
})
export class SupplierRating {
  readonly rating = input<number | null>(null);
  /** Whose rating it is. Named in the accessible text so a page listing
   *  several suppliers does not announce five identical ratings. */
  readonly name = input<string>('');
  /** Off where an empty slot reads as clutter rather than as information. */
  readonly showUnrated = input<boolean>(true);

  protected readonly max = 5;

  protected label(): string {
    return this.name().trim() || 'Supplier';
  }

  protected filled(value: number): string {
    return '★'.repeat(Math.max(0, Math.min(this.max, value)));
  }

  protected empty(value: number): string {
    return '★'.repeat(Math.max(0, this.max - value));
  }
}
