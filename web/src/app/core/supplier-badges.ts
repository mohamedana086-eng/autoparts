import { Component, input } from '@angular/core';

const RELIABILITY_STYLE: Record<string, string> = {
  official: 'border-stock text-stock',
  dealer: 'border-stock/60 text-stock',
  reliable: 'border-signal text-signal',
  standard: 'border-ink-line text-mute',
};

/**
 * A supplier's classification: what the trading relationship is, and whether
 * they take stock back.
 *
 * Two independent facts, deliberately not one. An official distributor can
 * refuse returns and a standard wholesaler can accept them, so they are shown
 * side by side rather than collapsed into a single label.
 *
 * The style table lived in three templates before this; keeping it in one
 * place is the point, so a supplier does not read as "official" in one colour
 * on the directory and another on their own page.
 */
@Component({
  selector: 'app-supplier-badges',
  template: `
    <span class="inline-flex flex-wrap items-baseline gap-1.5">
      <span class="font-mono text-[10px] uppercase px-2 py-0.5 rounded-plate border"
            [class]="reliabilityStyle()">{{ reliability() }}</span>

      @if (acceptsReturns() === true) {
        <span class="font-mono text-[10px] uppercase px-2 py-0.5 rounded-plate border border-stock text-stock">
          returns
        </span>
      } @else if (acceptsReturns() === false && showNoReturns()) {
        <span class="font-mono text-[10px] uppercase px-2 py-0.5 rounded-plate border border-ink-line text-mute">
          no returns
        </span>
      }
    </span>
  `,
})
export class SupplierBadges {
  readonly reliability = input<string>('standard');
  /** Null means the terms are not established — nothing is shown, because
   *  neither "returns" nor "no returns" would be true. */
  readonly acceptsReturns = input<boolean | null>(null);
  /**
   * Whether a known "no" is worth the space. On a supplier's own page and in
   * the admin it is real information a buyer wants before ordering; on a
   * dense results row it is one chip too many.
   */
  readonly showNoReturns = input<boolean>(true);

  protected reliabilityStyle(): string {
    return RELIABILITY_STYLE[this.reliability()] ?? RELIABILITY_STYLE['standard'];
  }
}
