import { describe, it, expect } from 'vitest';
import { TimeScale, SLOWMO, ComboCounter, comboLabel, COMBO_WINDOW } from './timeScale';

const run = (t: TimeScale, seconds: number) => { for (let i = 0; i < Math.round(seconds * 60); i++) t.update(1 / 60); };

describe('TimeScale', () => {
  it('eases into the manual slow motion and back out', () => {
    const t = new TimeScale();
    expect(t.scale).toBe(1);
    t.toggle();
    run(t, 1);
    expect(t.scale).toBeCloseTo(SLOWMO.manualScale, 2);
    t.toggle();
    run(t, 1);
    expect(t.scale).toBe(1);
  });

  it('automatic bursts last their real-time duration and override the manual scale', () => {
    const t = new TimeScale();
    t.trigger(1);
    run(t, 0.6);
    expect(t.slow).toBe(true);
    expect(t.scale).toBeLessThan(0.35);
    run(t, 1.2);
    expect(t.slow).toBe(false);
    expect(t.scale).toBeGreaterThan(0.95);
  });
});

describe('combos', () => {
  it('counts knockouts within the window and names them', () => {
    const c = new ComboCounter();
    expect(c.add(1, 0)).toBe(1);
    expect(c.add(1, 1)).toBe(2);
    expect(c.add(2, 1.5)).toBe(4);
    expect(c.add(1, 1.5 + COMBO_WINDOW + 0.1)).toBe(1);
    expect(comboLabel(1)).toBeNull();
    expect(comboLabel(2)).toBe('DUPLO NOCAUTE!');
    expect(comboLabel(3)).toBe('TRIPLO!');
    expect(comboLabel(9)).toBe('MASSACRE!');
  });
});
