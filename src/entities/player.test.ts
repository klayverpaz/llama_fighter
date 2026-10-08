import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import { pickTarget, blockedByTarget, turnTowardAim, PLAYER_TUNING } from './player';
import { STRIKES } from '../combat/strikes';
import { wrapAngle } from '../core/math';

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

describe('turnTowardAim', () => {
  const dt = 1 / 60;

  it('never flips a target behind the player in a single tick', () => {
    const after = turnTowardAim(0, Math.PI - 0.01, dt);
    expect(Math.abs(after)).toBeLessThan(Math.PI / 2);
    expect(Math.abs(after)).toBeGreaterThan(0.5);
  });

  it('mostly finishes a 180° turn within the jab startup', () => {
    let yaw = 0;
    const aim = Math.PI - 0.01;
    for (let t = 0; t < STRIKES.jab.startup; t += dt) yaw = turnTowardAim(yaw, aim, dt);
    expect(Math.abs(wrapAngle(aim - yaw))).toBeLessThan(0.2);
  });

  it('takes the short way around', () => {
    expect(turnTowardAim(3, -3, dt)).toBeGreaterThan(3);
  });
});
