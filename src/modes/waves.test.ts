import { describe, it, expect } from 'vitest';
import { WaveDirector, WAVES, waveSize, zombieStats, PlayerHealth, HEALTH, rollPowerUp } from './waves';

const DT = 1 / 60;

describe('waves', () => {
  it('each wave brings 5 more zombies, capped at 40', () => {
    expect([1, 2, 3, 7, 8, 9, 20].map(waveSize)).toEqual([5, 10, 15, 35, 40, 40, 40]);
  });

  it('zombies get tougher, faster and hit harder each wave', () => {
    const a = zombieStats(1);
    const b = zombieStats(8);
    expect(b.hp).toBeGreaterThan(a.hp);
    expect(b.speed).toBeGreaterThan(a.speed);
    expect(b.damage).toBeGreaterThan(a.damage);
  });

  it('runs intermission → wave 1 → spawns all 5 over time → cleared when they die → wave 2 with 10', () => {
    const d = new WaveDirector();
    let alive = 0;
    let started: number[] = [];
    let spawned = 0;
    for (let i = 0; i < Math.round((WAVES.firstIntermission + 5) / DT); i++) {
      const t = d.update(DT, alive);
      if (t.started) started.push(t.started);
      alive += t.spawn;
      spawned += t.spawn;
    }
    expect(started).toEqual([1]);
    expect(spawned).toBe(5);
    expect(d.remaining(alive)).toBe(5);
    // Kill everything.
    for (; alive > 0; alive--) d.onKill();
    const cleared = d.update(DT, 0);
    expect(cleared.cleared).toBe(1);
    expect(d.phase).toBe('intermission');
    started = [];
    spawned = 0;
    for (let i = 0; i < Math.round((WAVES.intermission + 10) / DT); i++) {
      const t = d.update(DT, alive);
      if (t.started) started.push(t.started);
      alive += t.spawn;
      spawned += t.spawn;
    }
    expect(started).toEqual([2]);
    expect(spawned).toBe(10);
  });

  it('never has more than the alive cap on the field', () => {
    const d = new WaveDirector();
    d.wave = 7;
    let alive = 0;
    let max = 0;
    for (let i = 0; i < Math.round(60 / DT); i++) {
      alive += d.update(DT, alive).spawn;
      max = Math.max(max, alive);
    }
    expect(d.wave).toBe(8);
    expect(max).toBe(WAVES.maxAlive);
    expect(d.remaining(alive)).toBe(40);
  });
});

describe('PlayerHealth', () => {
  it('takes damage, ignores hits inside the grace window, regenerates after the delay', () => {
    const h = new PlayerHealth();
    expect(h.damage(30)).toBe(30);
    expect(h.damage(30)).toBe(0);
    for (let i = 0; i < 30; i++) h.update(DT);
    expect(h.damage(30)).toBe(30);
    expect(h.hp).toBe(40);
    for (let i = 0; i < Math.round((HEALTH.regenDelay + 3) / DT); i++) h.update(DT);
    expect(h.hp).toBe(HEALTH.max);
  });

  it('dies at zero and stays dead', () => {
    const h = new PlayerHealth();
    for (let i = 0; i < 10; i++) {
      h.damage(40);
      for (let k = 0; k < 30; k++) h.update(DT);
    }
    expect(h.dead).toBe(true);
    for (let i = 0; i < 600; i++) h.update(DT);
    expect(h.hp).toBe(0);
  });
});

describe('power-ups', () => {
  it('drops rarely and picks a kind', () => {
    let seed = 3;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const drops = Array.from({ length: 2000 }, () => rollPowerUp(rng)).filter(Boolean);
    expect(drops.length).toBeGreaterThan(60);
    expect(drops.length).toBeLessThan(200);
    expect(new Set(drops)).toEqual(new Set(['maxAmmo', 'instaKill', 'nuke']));
  });
});
