import { describe, it, expect } from 'vitest';
import { steer, yawToward, ringPositions, shouldRecover, NPC_TUNING } from './npcBrain';

const origin = { x: 0, z: 0 };

describe('yawToward', () => {
  it('is 0 toward +Z and +pi/2 toward +X', () => {
    expect(yawToward(origin, { x: 0, z: 5 })).toBeCloseTo(0, 6);
    expect(yawToward(origin, { x: 5, z: 0 })).toBeCloseTo(Math.PI / 2, 6);
  });
});

describe('steer', () => {
  it('chases the player at full speed when far', () => {
    const r = steer({ self: origin, player: { x: 0, z: 10 }, others: [], state: 'chase' });
    expect(r.state).toBe('chase');
    expect(r.velocity.z).toBeCloseTo(NPC_TUNING.speed, 6);
    expect(r.velocity.x).toBeCloseTo(0, 6);
    expect(r.yaw).toBeCloseTo(0, 6);
  });

  it('switches to hold inside the hold distance and stops', () => {
    const r = steer({ self: origin, player: { x: 0, z: NPC_TUNING.holdDistance - 0.05 }, others: [], state: 'chase' });
    expect(r.state).toBe('hold');
    expect(Math.hypot(r.velocity.x, r.velocity.z)).toBeCloseTo(0, 6);
  });

  it('stays in hold until the player is past the resume distance', () => {
    const near = steer({ self: origin, player: { x: 0, z: NPC_TUNING.resumeDistance - 0.1 }, others: [], state: 'hold' });
    expect(near.state).toBe('hold');
    const far = steer({ self: origin, player: { x: 0, z: NPC_TUNING.resumeDistance + 0.1 }, others: [], state: 'hold' });
    expect(far.state).toBe('chase');
  });

  it('keeps facing the player while holding', () => {
    const r = steer({ self: origin, player: { x: 0.5, z: 0.5 }, others: [], state: 'hold' });
    expect(r.yaw).toBeCloseTo(Math.PI / 4, 6);
  });

  it('is pushed away from a neighbour inside the separation radius', () => {
    const r = steer({ self: origin, player: { x: 0, z: 10 }, others: [{ x: 0.3, z: 0 }], state: 'chase' });
    expect(r.velocity.x).toBeLessThan(0);
    const none = steer({ self: origin, player: { x: 0, z: 10 }, others: [{ x: 3, z: 0 }], state: 'chase' });
    expect(none.velocity.x).toBeCloseTo(0, 6);
  });

  it('a close neighbour wins over chasing: net velocity points away from it', () => {
    const r = steer({ self: origin, player: { x: 10, z: 0 }, others: [{ x: 0.2, z: 0 }], state: 'chase' });
    expect(r.state).toBe('chase');
    expect(r.velocity.x).toBeLessThan(0);
    expect(Math.hypot(r.velocity.x, r.velocity.z)).toBeLessThanOrEqual(NPC_TUNING.speed + 1e-9);
  });

  it('backs away from the player when holding inside the minimum distance', () => {
    const r = steer({ self: origin, player: { x: 0, z: 0.5 }, others: [], state: 'hold' });
    expect(r.state).toBe('hold');
    expect(r.velocity.z).toBeLessThan(0);
    expect(r.velocity.x).toBeCloseTo(0, 6);
    expect(r.yaw).toBeCloseTo(0, 6);
  });

  it('holds still between the minimum and hold distances', () => {
    const r = steer({ self: origin, player: { x: 0, z: (NPC_TUNING.minPlayerDistance + NPC_TUNING.holdDistance) / 2 }, others: [], state: 'hold' });
    expect(Math.hypot(r.velocity.x, r.velocity.z)).toBeCloseTo(0, 6);
  });
});

describe('ringPositions', () => {
  it('returns count positions with radii in [minR, maxR]', () => {
    const ps = ringPositions(7, 6, 10);
    expect(ps).toHaveLength(7);
    for (const p of ps) {
      const r = Math.hypot(p.x, p.z);
      expect(r).toBeGreaterThanOrEqual(6 - 1e-9);
      expect(r).toBeLessThanOrEqual(10 + 1e-9);
    }
    expect(ringPositions(0)).toEqual([]);
  });
});

describe('shouldRecover', () => {
  it('waits at least 4 s, then needs the body to settle', () => {
    expect(shouldRecover(3.9, 0)).toBe(false);
    expect(shouldRecover(4.1, 0.2)).toBe(true);
    expect(shouldRecover(4.1, 2.0)).toBe(false);
  });

  it('gives up waiting for settle after 8 s', () => {
    expect(shouldRecover(8.1, 5.0)).toBe(true);
  });
});
