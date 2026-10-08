import { describe, it, expect } from 'vitest';
import { RIFLE, createRifleState, tickRifle, damageForSegment, type RifleState } from './rifle';

const DT = 1 / 60;
function hold(s: RifleState, seconds: number, trigger = true, reload = false) {
  let shots = 0;
  let state = s;
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const r = tickRifle(state, DT, { trigger, reload });
    shots += r.shots;
    state = r.state;
  }
  return { state, shots };
}

describe('rifle', () => {
  it('fires at 600 rpm while the trigger is held', () => {
    const { shots } = hold(createRifleState(), 1.0);
    expect(shots).toBeGreaterThanOrEqual(10);
    expect(shots).toBeLessThanOrEqual(11);
  });

  it('empties a 30-round mag, dry-clicks once, then auto-reloads after release', () => {
    let { state, shots } = hold(createRifleState(), 4);
    expect(shots).toBe(RIFLE.magSize);
    expect(state.ammo).toBe(0);
    const dry = tickRifle(state, DT, { trigger: true, reload: false });
    expect(dry.dryFire).toBe(false);
    const released = tickRifle(state, DT, { trigger: false, reload: false });
    expect(released.reloadStarted).toBe(true);
    state = hold(released.state, RIFLE.reloadSeconds + 0.05, false).state;
    expect(state.ammo).toBe(RIFLE.magSize);
    expect(state.reloading).toBe(0);
  });

  it('cannot fire while reloading and manual reload needs a partly empty mag', () => {
    expect(tickRifle(createRifleState(), DT, { trigger: false, reload: true }).reloadStarted).toBe(false);
    const half = hold(createRifleState(), 0.5).state;
    const r = tickRifle(half, DT, { trigger: false, reload: true });
    expect(r.reloadStarted).toBe(true);
    expect(tickRifle(r.state, DT, { trigger: true, reload: false }).shots).toBe(0);
  });

  it('spread grows while firing and recovers after', () => {
    const fired = hold(createRifleState(), 0.6).state;
    expect(fired.spread).toBeGreaterThan(RIFLE.spreadBase * 5);
    const rested = hold(fired, 1.0, false).state;
    expect(rested.spread).toBeCloseTo(RIFLE.spreadBase, 6);
  });

  it('a headshot kills a full-HP NPC, torso takes three', () => {
    expect(damageForSegment('head')).toBeGreaterThanOrEqual(50);
    expect(damageForSegment('torso') * 2).toBeLessThan(50);
    expect(damageForSegment('torso') * 3).toBeGreaterThanOrEqual(50);
  });
});
