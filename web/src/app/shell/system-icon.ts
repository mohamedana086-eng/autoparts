import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Renders the icon a VehicleSystem row names in its `icon` column.
 *
 * The names are Lucide's (Disc, Cog, Thermometer …), matching what the seed
 * writes and what the Next app drew. Drawn inline rather than pulled from
 * lucide-angular, which currently peers on Angular 13–21 and so will not
 * install against 22. Anything unrecognised falls back to the cog, so a new
 * system row renders something sensible instead of a gap.
 */
@Component({
  selector: 'app-system-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"
         aria-hidden="true" focusable="false">
      @switch (name()) {
        @case ('Disc') {
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="2" />
        }
        @case ('Navigation') {
          <polygon points="3 11 22 2 13 21 11 13 3 11" />
        }
        @case ('CircleDot') {
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="1" fill="currentColor" />
        }
        @case ('Filter') {
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        }
        @case ('Thermometer') {
          <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z" />
        }
        @case ('Zap') {
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        }
        @case ('Fuel') {
          <line x1="3" y1="22" x2="15" y2="22" />
          <line x1="4" y1="9" x2="14" y2="9" />
          <path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18" />
          <path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0V9.83a2 2 0 0 0-.59-1.42L18 5" />
        }
        @case ('Wind') {
          <path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2" />
          <path d="M9.6 4.6A2 2 0 1 1 11 8H2" />
          <path d="M12.6 19.4A2 2 0 1 0 14 16H2" />
        }
        @case ('Cable') {
          <path d="M7 3v5" />
          <path d="M13 3v5" />
          <path d="M5 8h10v3a5 5 0 0 1-10 0z" />
          <path d="M10 16v5" />
        }
        @case ('Lightbulb') {
          <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
          <path d="M9 18h6" />
          <path d="M10 22h4" />
        }
        @case ('Car') {
          <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
          <circle cx="7" cy="17" r="2" />
          <path d="M9 17h6" />
          <circle cx="17" cy="17" r="2" />
        }
        @default {
          <!-- Cog, and anything not listed above -->
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3" /><path d="M12 19v3" />
          <path d="M2 12h3" /><path d="M19 12h3" />
          <path d="M4.9 4.9 7 7" /><path d="M17 17l2.1 2.1" />
          <path d="M19.1 4.9 17 7" /><path d="M7 17l-2.1 2.1" />
        }
      }
    </svg>
  `,
})
export class SystemIcon {
  readonly name = input<string>('Cog');
  readonly size = input<number>(22);
}
