import { Component, input, output } from '@angular/core';

/**
 * One collapsible block of filters in the search sidebar.
 *
 * Collapsed by default so the column is a list of headings rather than every
 * option of every filter at once — with a dozen systems and twenty-odd brands
 * on a broad query, the expanded form was longer than the screen and buried
 * what a customer had actually chosen.
 *
 * The closed heading carries a summary of the current selection, so nothing
 * has to be opened to find out what is applied. Content stays in the DOM and
 * is hidden rather than destroyed: it keeps chip counts addressable and
 * avoids re-creating the list on every open.
 */
@Component({
  selector: 'app-filter-group',
  template: `
    <div class="filter-group">
      <button type="button" (click)="toggled.emit()" [attr.aria-expanded]="open()"
              class="w-full flex items-baseline gap-2 text-left group">
        <span class="eyebrow">{{ label() }}</span>

        @if (!open() && summary()) {
          <span class="text-[11px] text-paper truncate">{{ summary() }}</span>
        }

        <span class="ml-auto text-mute group-hover:text-paper transition-colors text-sm leading-none shrink-0"
              aria-hidden="true">{{ open() ? '−' : '+' }}</span>
      </button>

      <div class="mt-2" [class.hidden]="!open()">
        <ng-content />
      </div>
    </div>
  `,
})
export class FilterGroup {
  readonly label = input.required<string>();
  /** What is currently chosen, shown on the closed heading. Empty for none. */
  readonly summary = input<string>('');
  readonly open = input<boolean>(false);
  readonly toggled = output<void>();
}
