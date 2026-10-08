/** Bullet time: a manual toggle plus short automatic bursts (multi-knockouts), eased in and out. */
export const SLOWMO = {
  manualScale: 0.3,
  autoScale: 0.22,
  /** How fast the time scale eases toward its target (per real second). */
  ease: 7,
};

export class TimeScale {
  manual = false;
  private autoLeft = 0;
  private current = 1;

  /** Simulation seconds per real second right now. */
  get scale(): number {
    return this.current;
  }

  /** True while any slow motion is wanted (for the HUD/audio). */
  get slow(): boolean {
    return this.manual || this.autoLeft > 0;
  }

  toggle(): void {
    this.manual = !this.manual;
  }

  /** Automatic slow motion for `seconds` of real time (extends, never shortens). */
  trigger(seconds: number): void {
    this.autoLeft = Math.max(this.autoLeft, seconds);
  }

  /** Advance by real (wall-clock) seconds. */
  update(realDt: number): void {
    this.autoLeft = Math.max(0, this.autoLeft - realDt);
    const target = this.autoLeft > 0 ? SLOWMO.autoScale : this.manual ? SLOWMO.manualScale : 1;
    this.current += (target - this.current) * (1 - Math.exp(-SLOWMO.ease * realDt));
    if (Math.abs(this.current - target) < 1e-3) this.current = target;
  }
}

/** Knockouts close together in game time become combos. */
export const COMBO_WINDOW = 2.5;

export function comboLabel(count: number): string | null {
  if (count < 2) return null;
  if (count === 2) return 'DUPLO NOCAUTE!';
  if (count === 3) return 'TRIPLO!';
  if (count === 4) return 'QUÁDRUPLO!';
  return 'MASSACRE!';
}

export class ComboCounter {
  private times: number[] = [];

  /** Record `n` knockouts at game time `t`; returns the running combo size. */
  add(n: number, t: number): number {
    for (let i = 0; i < n; i++) this.times.push(t);
    this.times = this.times.filter((x) => t - x <= COMBO_WINDOW);
    return this.times.length;
  }
}
