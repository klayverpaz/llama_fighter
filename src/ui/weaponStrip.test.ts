import { describe, expect, it } from 'vitest';
import { weaponStrip } from './weaponStrip';

const shown = (cycle: string[], current: string) => weaponStrip(cycle, current).map((s) => `${s.offset}:${s.weapon}`);

describe('weaponStrip', () => {
  it('shows the previous, the selected and the next two', () => {
    expect(shown(['a', 'b', 'c', 'd', 'e', 'f'], 'c')).toEqual(['-1:b', '0:c', '1:d', '2:e']);
  });

  it('wraps around both ends of the cycle', () => {
    expect(shown(['a', 'b', 'c', 'd', 'e'], 'a')).toEqual(['-1:e', '0:a', '1:b', '2:c']);
    expect(shown(['a', 'b', 'c', 'd', 'e'], 'e')).toEqual(['-1:d', '0:e', '1:a', '2:b']);
  });

  it('never repeats a weapon when few are owned', () => {
    expect(shown(['a'], 'a')).toEqual(['0:a']);
    expect(shown(['a', 'b'], 'a')).toEqual(['0:a', '1:b']);
    expect(shown(['a', 'b', 'c'], 'b')).toEqual(['-1:a', '0:b', '1:c']);
    expect(shown(['a', 'b', 'c', 'd'], 'b')).toEqual(['-1:a', '0:b', '1:c', '2:d']);
  });

  it('is empty without weapons', () => {
    expect(weaponStrip([], 'a')).toEqual([]);
  });
});
