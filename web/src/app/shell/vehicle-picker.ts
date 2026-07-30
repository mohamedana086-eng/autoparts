import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  VehiclesService, type VehicleMake, type VehicleModel, type VinCandidate, type VinReading,
} from '../core/vehicles.service';

@Component({
  selector: 'app-vehicle-picker',
  template: `
    <div class="border border-ink-line rounded-plate bg-ink-panel p-5">
      <div class="flex items-center gap-4 mb-4">
        <h2 class="font-display font-semibold text-sm">Find parts for your car</h2>
        <div class="ml-auto flex text-xs">
          <button type="button" (click)="mode.set('picker')"
                  class="px-3 py-1 rounded-l-plate border transition-colors"
                  [class]="mode() === 'picker' ? tabOn : tabOff">Make &amp; model</button>
          <button type="button" (click)="mode.set('vin')"
                  class="px-3 py-1 rounded-r-plate border border-l-0 transition-colors"
                  [class]="mode() === 'vin' ? tabOn : tabOff">Chassis number</button>
        </div>
      </div>

      @if (mode() === 'picker') {
        <div class="grid sm:grid-cols-3 gap-3">
          <label class="grid gap-1 text-xs text-mute">
            Make
            <select [value]="makeId()" (change)="pickMake($any($event.target).value)"
                    class="bg-ink border border-ink-line rounded-plate px-3 py-2 text-sm text-paper">
              <option value="">— select —</option>
              @for (m of makes(); track m.id) {
                <option [value]="m.id">{{ m.name }}</option>
              }
            </select>
          </label>

          <label class="grid gap-1 text-xs text-mute">
            Model
            <select [value]="modelId()" (change)="pickModel($any($event.target).value)"
                    [disabled]="!makeId()"
                    class="bg-ink border border-ink-line rounded-plate px-3 py-2 text-sm text-paper disabled:opacity-50">
              <option value="">— select —</option>
              @for (m of models(); track m.id) {
                <option [value]="m.id">{{ m.name }} ({{ m.yearFrom }}–{{ m.yearTo ?? 'now' }})</option>
              }
            </select>
          </label>

          <label class="grid gap-1 text-xs text-mute">
            Engine
            <select [value]="variantId()" (change)="pickVariant($any($event.target).value)"
                    [disabled]="!modelId()"
                    class="bg-ink border border-ink-line rounded-plate px-3 py-2 text-sm text-paper disabled:opacity-50">
              <option value="">— select —</option>
              @for (v of variants(); track v.id) {
                <option [value]="v.id">
                  {{ v.name }}@if (v.powerKw) { · {{ v.powerKw }} kW } · {{ v.fuel }}
                </option>
              }
            </select>
          </label>
        </div>

        <button type="button" (click)="showParts(variantId())" [disabled]="!variantId()"
                class="w-full sm:w-auto mt-4 bg-signal hover:bg-signal-dim disabled:opacity-50 text-ink font-display font-bold text-sm px-6 py-2.5 rounded-plate transition-colors">
          Show parts
        </button>
      } @else {
        <form class="flex flex-wrap gap-3" (submit)="decode($event)">
          <input [value]="vin()" (input)="vin.set($any($event.target).value)"
                 placeholder="e.g. WBA3A5C50DF123456" aria-label="Chassis number (VIN)"
                 maxlength="17" autocomplete="off"
                 class="flex-1 min-w-[16rem] bg-ink border border-ink-line rounded-plate px-3 py-2 text-sm text-paper font-mono uppercase" />
          <button type="submit" [disabled]="decoding()"
                  class="bg-signal hover:bg-signal-dim disabled:opacity-60 text-ink font-display font-bold text-sm px-6 py-2 rounded-plate transition-colors">
            {{ decoding() ? 'Reading…' : 'Read VIN' }}
          </button>
        </form>

        @if (vinError()) {
          <p class="text-sm text-alert mt-3">{{ vinError() }}</p>
        }

        @if (reading(); as r) {
          <div class="mt-4 border-t border-ink-line pt-4">
            <p class="text-xs text-mute">
              <span class="font-mono text-paper">{{ r.wmi }}</span> —
              {{ r.make ? r.make.name : 'unknown manufacturer' }}
              @if (r.modelYear) {
                · model year <span class="text-paper">{{ r.modelYear }}</span>
                <span class="opacity-70">(estimated — the year letter repeats every 30 years)</span>
              }
              @if (r.checkDigitValid === false) {
                · <span class="text-alert">check digit does not match</span>
              }
            </p>

            @if (r.message) {
              <p class="text-sm text-mute mt-3">{{ r.message }}</p>
            }

            @if (r.candidates.length) {
              <p class="text-xs text-mute mt-3 mb-2">
                A VIN does not spell out the engine, so pick yours:
              </p>
              <div class="grid gap-2">
                @for (c of r.candidates; track c.variantId) {
                  <button type="button" (click)="showParts(c.variantId)"
                          class="text-left border border-ink-line rounded-plate px-3 py-2 hover:border-signal/60 hover:bg-ink-raised transition-colors">
                    <span class="text-sm">{{ c.label }}</span>
                    <span class="block text-[11px] text-mute">
                      {{ c.engineCode }} · {{ c.fuel }} · {{ c.yearFrom }}–{{ c.yearTo ?? 'now' }}
                    </span>
                  </button>
                }
              </div>
            }
          </div>
        }
      }
    </div>
  `,
})
export class VehiclePicker {
  private readonly vehicles = inject(VehiclesService);
  private readonly router = inject(Router);

  protected readonly makes = signal<VehicleMake[]>([]);
  protected readonly makeId = signal('');
  protected readonly modelId = signal('');
  protected readonly variantId = signal('');

  protected readonly mode = signal<'picker' | 'vin'>('picker');
  protected readonly vin = signal('');
  protected readonly decoding = signal(false);
  protected readonly vinError = signal<string | null>(null);
  protected readonly reading = signal<VinReading | null>(null);

  protected readonly tabOn = 'border-signal bg-signal/10 text-paper';
  protected readonly tabOff = 'border-ink-line text-mute hover:text-paper';

  protected readonly models = computed<VehicleModel[]>(
    () => this.makes().find((m) => m.id === this.makeId())?.models ?? []
  );
  protected readonly variants = computed(
    () => this.models().find((m) => m.id === this.modelId())?.variants ?? []
  );

  constructor() {
    this.vehicles.all().then((res) => this.makes.set(res.makes)).catch(() => this.makes.set([]));
  }

  protected pickMake(id: string): void {
    this.makeId.set(id);
    this.modelId.set('');
    this.variantId.set('');
  }

  protected pickModel(id: string): void {
    this.modelId.set(id);
    this.variantId.set('');
  }

  protected pickVariant(id: string): void {
    this.variantId.set(id);
  }

  protected showParts(variantId: string): void {
    if (!variantId) return;
    this.router.navigate(['/search'], { queryParams: { variant: variantId } });
  }

  protected async decode(event: Event): Promise<void> {
    event.preventDefault();
    if (this.decoding()) return;

    this.decoding.set(true);
    this.vinError.set(null);
    this.reading.set(null);
    try {
      this.reading.set(await this.vehicles.decodeVin(this.vin().trim()));
    } catch (err: any) {
      this.vinError.set(err?.error?.error ?? 'Could not read that chassis number.');
    } finally {
      this.decoding.set(false);
    }
  }
}
