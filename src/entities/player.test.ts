import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import { pickTarget, blockedByTarget, PLAYER_TUNING } from './player';

const at = (x: number, z: number, standing = true, id = `${x},${z}`) => ({ id, position: new Vector3(x, 0.96, z), standing });

describe('pickTarget', () => {
  it('returns the nearest standing target within lock-on range', () => {
    const t = pickTarget(new Vector3(0, 0.96, 0), [at(0, 2), at(1, 0), at(0, -0.5, false)]);
    expect(t?.id).toBe('1,0');
  });

  it('ignores targets beyond range and downed targets', () => {
    expect(pickTarget(new Vector3(), [at(0, PLAYER_TUNING.lockOnRange + 0.1), at(0.3, 0, false)])).toBeNull();
  });
});

describe('blockedByTarget', () => {
  it('blocks a step that ends inside a standing target', () => {
    const next = new Vector3(0, 0.96, 0.8);
    expect(blockedByTarget(next, [at(0, 1.0)])).toBe(true);
    expect(blockedByTarget(next, [at(0, 1.0, false)])).toBe(false);
    expect(blockedByTarget(next, [at(0, 2.0)])).toBe(false);
  });
});
