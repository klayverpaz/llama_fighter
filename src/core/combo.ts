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
