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
  const p = (z: number) => new Vector3(0, 0.96, z);

  it('blocks a step that ends inside a standing target and moves closer', () => {
    expect(blockedByTarget(p(0.8), p(0.9), [at(0, 1.0)])).toBe(true);
  });

  it('never blocks retreating, even while still inside the block distance', () => {
    expect(blockedByTarget(p(0.6), p(0.5), [at(0, 1.0)])).toBe(false);
    expect(blockedByTarget(p(0.6), p(0.55), [at(0, 1.0)])).toBe(false);
  });

  it('ignores downed and distant targets', () => {
    expect(blockedByTarget(p(0.8), p(0.9), [at(0, 1.0, false)])).toBe(false);
    expect(blockedByTarget(p(0.8), p(0.9), [at(0, 2.0)])).toBe(false);
  });
});
