import { describe, it, expect } from 'vitest';
import { pickZombieKind, newKinds, kindStats, isBossWave, atmosphereFor, mixColor, ZOMBIE_KINDS, type ZombieKind } from './zombieTypes';

const rngFrom = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const tally = (wave: number) => {
  const rng = rngFrom(5);
  const out: Partial<Record<ZombieKind, number>> = {};
  for (let i = 0; i < 4000; i++) {
    const k = pickZombieKind(wave, rng);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
};

describe('zombie kinds', () => {
  it('wave 1 is only walkers; each later wave unlocks something new', () => {
    expect(Object.keys(tally(1))).toEqual(['walker']);
    expect(Object.keys(tally(2)).sort()).toEqual(['runner', 'walker']);
    expect(Object.keys(tally(3)).sort()).toEqual(['exploder', 'runner', 'walker']);
    expect(Object.keys(tally(5)).sort()).toEqual(['brute', 'cavalry', 'exploder', 'runner', 'walker']);
    expect(tally(9).boss).toBeUndefined();
  });

  it('newer kinds become more common in later waves', () => {
    expect(tally(10).brute! / 4000).toBeGreaterThan(tally(4).brute! / 4000);
    expect(tally(10).cavalry! / 4000).toBeGreaterThan(tally(5).cavalry! / 4000);
    expect(tally(12).walker! / 4000).toBeLessThan(tally(2).walker! / 4000);
  });

  it('announces new kinds on the wave they unlock', () => {
    expect(newKinds(1)).toEqual(['walker']);
    expect(newKinds(2)).toEqual(['runner']);
    expect(newKinds(5)).toEqual(['cavalry']);
    expect(newKinds(6)).toEqual([]);
  });

  it('kinds play differently: runners fast and fragile, brutes slow and tanky, the boss huge', () => {
    const w = 6;
    const walker = kindStats('walker', w);
    expect(kindStats('runner', w).speed).toBeGreaterThan(walker.speed);
    expect(kindStats('runner', w).hp).toBeLessThan(walker.hp);
    expect(kindStats('brute', w).hp).toBeGreaterThan(walker.hp * 2.5);
    expect(kindStats('brute', w).speed).toBeLessThan(walker.speed);
    expect(kindStats('boss', w).hp).toBeGreaterThan(walker.hp * 10);
    expect(kindStats('cavalry', w).speed).toBeGreaterThan(5);
    expect(ZOMBIE_KINDS.boss.scale).toBe(4);
    expect(kindStats('boss', 5).scale).toBe(4);
    // Nothing one-shots a full-health player, at any wave.
    for (const w of [1, 5, 10, 30]) for (const k of Object.keys(ZOMBIE_KINDS) as ZombieKind[]) expect(kindStats(k, w).damage).toBeLessThan(100);
  });

  it('a boss every 5 waves', () => {
    expect([1, 4, 5, 6, 10, 15].map(isBossWave)).toEqual([false, false, true, false, true, true]);
  });
});

describe('atmosphere', () => {
  it('starts as the normal day and ends as a blood-moon night', () => {
    expect(atmosphereFor(1).sky).toBe(0xf3eee2);
    expect(atmosphereFor(1).moon).toBe(0);
    const night = atmosphereFor(9);
    expect(night.moon).toBe(1);
    expect(night.sunIntensity).toBeLessThan(atmosphereFor(1).sunIntensity);
    expect(night.fogFar).toBeLessThan(atmosphereFor(1).fogFar);
  });

  it('blends smoothly between the stops', () => {
    const a = atmosphereFor(2);
    expect(a.sky).not.toBe(atmosphereFor(1).sky);
    expect(a.sky).not.toBe(atmosphereFor(4).sky);
    expect(mixColor(0x000000, 0xffffff, 0.5)).toBe(0x808080);
  });
});
