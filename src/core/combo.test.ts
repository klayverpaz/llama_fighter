import { describe, it, expect } from 'vitest';
import { ComboCounter, comboLabel, COMBO_WINDOW } from './combo';

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
