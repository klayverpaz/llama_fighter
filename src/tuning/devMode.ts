import { DEFAULT_TUNING, applyTuning, snapshotTuning, type Tuning, type TuningGroup } from './tuning';

/** What DevMode needs from localStorage (any accessor may throw: private mode, blocked storage). */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const VALUES_KEY = 'kb-dev-tuning';
const ON_KEY = 'kb-dev-on';

/**
 * Dev-build balancing switch. Off: the game runs on tuning.json. On: it runs on the dev values, which
 * are kept (and stored) while off, so switching back on restores the last tweaks.
 */
export class DevMode {
  private saved: Tuning;
  private enabled = false;

  constructor(private readonly store: KeyValueStore | null) {
    this.saved = structuredClone(DEFAULT_TUNING);
    const raw = this.read(VALUES_KEY);
    if (raw) {
      try {
        // Run the stored values through applyTuning's filter so stale or broken keys fall back to defaults.
        const parsed: unknown = JSON.parse(raw);
        const values = structuredClone(DEFAULT_TUNING);
        applyTuning(parsed, values as unknown as TuningGroup);
        this.saved = values;
      } catch { /* corrupt entry: keep the defaults */ }
    }
    if (this.read(ON_KEY) === '1') this.setOn(true);
  }

  get on(): boolean {
    return this.enabled;
  }

  setOn(on: boolean): void {
    if (on === this.enabled) return;
    if (on) {
      applyTuning(this.saved);
    } else {
      this.saved = snapshotTuning();
      applyTuning(DEFAULT_TUNING);
    }
    this.enabled = on;
    this.write(ON_KEY, on ? '1' : '0');
    this.persist();
  }

  /** Call after editing a live value so the tweak survives reloads. */
  changed(): void {
    if (this.enabled) this.persist();
  }

  /** Throw away the dev tweaks: the dev values become tuning.json's again. */
  reset(): void {
    this.saved = structuredClone(DEFAULT_TUNING);
    if (this.enabled) applyTuning(DEFAULT_TUNING);
    this.persist();
  }

  /** The values the dev panel is editing (the live ones while on), as tuning.json-shaped JSON. */
  dump(): string {
    return JSON.stringify(this.enabled ? snapshotTuning() : this.saved, null, 2) + '\n';
  }

  private persist(): void {
    this.write(VALUES_KEY, JSON.stringify(this.enabled ? snapshotTuning() : this.saved));
  }

  private read(key: string): string | null {
    try { return this.store?.getItem(key) ?? null; } catch { return null; }
  }

  private write(key: string, value: string): void {
    try { this.store?.setItem(key, value); } catch { /* storage unavailable: tweaks last this session */ }
  }
}
