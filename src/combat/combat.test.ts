import { describe, it, expect } from 'vitest';
import { STRIKES, STRIKE_NAMES, KEY_TO_STRIKE, strikeDuration, NPC_MAX_HP } from './strikes';
import { createAttackState, canAttack, startAttack, tickAttack, recordHit } from './attack';
import { applyDamage, impulseVector } from './damage';

describe('strikes table', () => {
  it('maps every key to exactly one strike', () => {
    expect(Object.keys(KEY_TO_STRIKE)).toHaveLength(STRIKE_NAMES.length);
    expect(KEY_TO_STRIKE['Comma']).toBe('highKick');
    expect(KEY_TO_STRIKE['KeyJ']).toBe('jab');
  });

  it('has positive numbers everywhere', () => {
    for (const n of STRIKE_NAMES) {
      const s = STRIKES[n];
      for (const v of [s.damage, s.impulse, s.startup, s.active, s.recovery, s.hitRadius]) expect(v).toBeGreaterThan(0);
      expect(s.direction[2]).toBeGreaterThan(0);
    }
  });
});

describe('attack state machine', () => {
  it('goes idle → startup → active → recovery → idle on the strike timings', () => {
    const jab = STRIKES.jab;
    let s = startAttack(createAttackState(), 'jab');
    expect(s.phase).toBe('startup');
    s = tickAttack(s, jab.startup + 0.001);
    expect(s.phase).toBe('active');
    s = tickAttack(s, jab.active);
    expect(s.phase).toBe('recovery');
    s = tickAttack(s, jab.recovery);
    expect(s.phase).toBe('idle');
    expect(s.strike).toBeNull();
  });

  it('ignores a new strike while one is in progress', () => {
    const s = startAttack(createAttackState(), 'cross');
    const again = startAttack(tickAttack(s, 0.05), 'jab');
    expect(again.strike).toBe('cross');
    expect(canAttack(again)).toBe(false);
  });

  it('canAttack only when idle', () => {
    expect(canAttack(createAttackState())).toBe(true);
    const s = startAttack(createAttackState(), 'highKick');
    const dur = strikeDuration(STRIKES.highKick);
    expect(canAttack(tickAttack(s, dur - 0.01))).toBe(false);
    expect(canAttack(tickAttack(s, dur + 0.01))).toBe(true);
  });

  it('records each target once and keeps hits through the active window', () => {
    let s = startAttack(createAttackState(), 'jab');
    s = tickAttack(s, STRIKES.jab.startup + 0.01);
    s = recordHit(s, 'npc-1');
    s = tickAttack(s, 0.02);
    expect(s.phase).toBe('active');
    expect(s.hit.has('npc-1')).toBe(true);
    expect(s.hit.has('npc-2')).toBe(false);
  });

  it('starts a fresh hit set for every new strike', () => {
    let s = recordHit(startAttack(createAttackState(), 'jab'), 'npc-1');
    s = tickAttack(s, 10);
    s = startAttack(s, 'jab');
    expect(s.hit.size).toBe(0);
  });
});

describe('damage', () => {
  it('seven jabs knock out a full-HP NPC, six do not', () => {
    let hp = NPC_MAX_HP;
    for (let i = 0; i < 6; i++) {
      const r = applyDamage(hp, STRIKES.jab);
      hp = r.hp;
      expect(r.knockedOut).toBe(false);
    }
    const r = applyDamage(hp, STRIKES.jab);
    expect(r.knockedOut).toBe(true);
    expect(r.hp).toBe(0);
  });

  it('impulse points forward for yaw 0 and toward +X for yaw +90deg, scaled by magnitude', () => {
    const f = impulseVector(STRIKES.cross, 0);
    expect(f.z).toBeGreaterThan(0);
    expect(f.length()).toBeCloseTo(STRIKES.cross.impulse, 5);
    const r = impulseVector(STRIKES.cross, Math.PI / 2);
    expect(r.x).toBeGreaterThan(0.9 * STRIKES.cross.impulse);
    expect(Math.abs(r.z)).toBeLessThan(0.2 * STRIKES.cross.impulse);
  });
});
