import { describe, it, expect } from 'vitest';
import { SHOTGUN, createShotgunState, tickShotgun, pelletDamage, pumpStroke } from './shotgun';
import type { RifleState } from './rifle';

const DT = 1 / 60;
function run(s: RifleState, seconds: number, trigger: boolean, reload = false) {
  let state = s;
  let shots = 0;
  let shells = 0;
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const r = tickShotgun(state, DT, { trigger, reload });
    state = r.state;
    shots += r.shots;
    if (r.shellLoaded) shells++;
  }
  return { state, shots, shells };
}

describe('shotgun', () => {
  it('pumps between shots: holding the trigger fires about once per 0.85 s', () => {
    const { shots } = run(createShotgunState(), 2.0, true);
    expect(shots).toBe(3);
  });

  it('empties 8 shells, then reloads one shell at a time back to full', () => {
    let { state, shots } = run(createShotgunState(), 8, true);
    expect(shots).toBe(SHOTGUN.magSize);
    const r = run(state, SHOTGUN.shellSeconds * 3 + 0.1, false);
    expect(r.state.ammo).toBe(3);
    expect(r.shells).toBe(3);
    state = run(r.state, SHOTGUN.shellSeconds * 5 + 0.1, false).state;
    expect(state.ammo).toBe(SHOTGUN.magSize);
    expect(state.reloading).toBe(0);
  });

  it('pulling the trigger mid-reload fires a loaded shell straight away', () => {
    const fired = run(createShotgunState(), 1.0, true).state; // 2 shots
    const reloading = run(fired, 1.0, false, true).state;
    expect(reloading.reloading).toBeGreaterThan(0);
    const r = tickShotgun(reloading, DT, { trigger: true, reload: false });
    expect(r.state.reloading).toBe(0);
    expect(r.shots).toBe(1);
  });

  it('point blank to the chest drops an NPC in one shot; at long range it takes several', () => {
    expect(pelletDamage('torso', 2) * SHOTGUN.pellets).toBeGreaterThanOrEqual(50);
    expect(pelletDamage('torso', 25) * SHOTGUN.pellets).toBeLessThan(50);
    expect(pelletDamage('torso', 100)).toBeCloseTo(9 * SHOTGUN.minFalloff, 6);
  });

  it('the pump stroke happens after the shot and is back home before the next one', () => {
    expect(pumpStroke(0.05)).toBe(0);
    expect(pumpStroke(SHOTGUN.pumpDelay + SHOTGUN.pumpSeconds / 2)).toBeCloseTo(1, 6);
    expect(pumpStroke(SHOTGUN.fireInterval)).toBe(0);
    expect(SHOTGUN.pumpDelay + SHOTGUN.pumpSeconds).toBeLessThan(SHOTGUN.fireInterval);
  });
});
