import { zombieStats, type ZombieStats } from './waves';

export type ZombieKind = 'walker' | 'runner' | 'brute' | 'cavalry' | 'boss';

export interface ZombieKindSpec {
  /** HUD / banner name (plural for "NOVO: …"). */
  name: string;
  plural: string;
  /** First wave where this kind can show up. */
  firstWave: number;
  /** Relative spawn weight once unlocked (the boss is placed by hand). */
  weight: number;
  skin: number;
  eyes: number;
  hpMul: number;
  speedMul: number;
  damageMul: number;
  /** Visual thickness of limbs/torso (1 = normal) and head size. */
  bulk: number;
  head: number;
  /** Whole-body size (the boss towers at 4×). */
  scale?: number;
}

export const ZOMBIE_KINDS: Record<ZombieKind, ZombieKindSpec> = {
  walker: { name: 'Andarilho', plural: 'ANDARILHOS', firstWave: 1, weight: 10, skin: 0x6f9a4a, eyes: 0xfff35a, hpMul: 1, speedMul: 1, damageMul: 1, bulk: 1, head: 1 },
  runner: { name: 'Corredor', plural: 'CORREDORES', firstWave: 2, weight: 5, skin: 0xb9c99a, eyes: 0xff3b2f, hpMul: 0.6, speedMul: 1.65, damageMul: 0.8, bulk: 0.85, head: 0.95 },
  brute: { name: 'Brutamontes', plural: 'BRUTAMONTES', firstWave: 4, weight: 2, skin: 0x6b4b8e, eyes: 0x7dfcff, hpMul: 3.2, speedMul: 0.75, damageMul: 1.8, bulk: 1.9, head: 1.2 },
  cavalry: { name: 'Cavaleiro Zumbi', plural: 'CAVALEIROS ZUMBIS', firstWave: 5, weight: 2, skin: 0x8a9a6a, eyes: 0xff3b2f, hpMul: 1.4, speedMul: 1, damageMul: 1.3, bulk: 1, head: 1 },
  boss: { name: 'Rei Brutamontes', plural: 'O REI', firstWave: 5, weight: 0, skin: 0xc9a227, eyes: 0xff2020, hpMul: 14, speedMul: 1.1, damageMul: 2.6, bulk: 1.7, head: 1.2, scale: 4 },
};

export const CAVALRY_SPEED = 5.2;
/** No single hit takes more than this (HP is 100): even the boss needs two. */
export const MAX_HIT = 60;

export const isBossWave = (wave: number) => wave > 0 && wave % 5 === 0;

/** Pick the kind of the next spawn: weighted among the kinds unlocked by this wave. */
export function pickZombieKind(wave: number, rng: () => number): ZombieKind {
  const pool = (Object.keys(ZOMBIE_KINDS) as ZombieKind[]).filter((k) => ZOMBIE_KINDS[k].weight > 0 && ZOMBIE_KINDS[k].firstWave <= wave);
  // Newer kinds get more common as the waves go on.
  const weight = (k: ZombieKind) => ZOMBIE_KINDS[k].weight * (1 + 0.15 * (wave - ZOMBIE_KINDS[k].firstWave));
  const total = pool.reduce((sum, k) => sum + weight(k), 0);
  let r = rng() * total;
  for (const k of pool) {
    r -= weight(k);
    if (r <= 0) return k;
  }
  return pool[pool.length - 1];
}

/** Kinds that appear for the first time in this wave (for the "NOVO: …" banner). */
export function newKinds(wave: number): ZombieKind[] {
  return (Object.keys(ZOMBIE_KINDS) as ZombieKind[]).filter((k) => ZOMBIE_KINDS[k].firstWave === wave && k !== 'boss');
}

export function kindStats(kind: ZombieKind, wave: number): ZombieStats & { scale?: number } {
  const base = zombieStats(wave);
  const k = ZOMBIE_KINDS[kind];
  return {
    hp: Math.round(base.hp * k.hpMul),
    speed: kind === 'cavalry' ? CAVALRY_SPEED : Math.min(6, base.speed * k.speedMul),
    damage: Math.min(MAX_HIT, Math.round(base.damage * k.damageMul)),
    ...(k.scale ? { scale: k.scale } : {}),
  };
}

/** Sky and light for a wave: day → sunset → dusk → blood-moon night. */
export interface Atmosphere {
  sky: number;
  fog: number;
  fogNear: number;
  fogFar: number;
  sun: number;
  sunIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  /** 0..1 how visible the blood moon is. */
  moon: number;
}

const STOPS: Array<[number, Atmosphere]> = [
  [0, { sky: 0xf3eee2, fog: 0xf3eee2, fogNear: 60, fogFar: 140, sun: 0xffffff, sunIntensity: 1.4, hemiSky: 0xffffff, hemiGround: 0xcbbfa3, hemiIntensity: 0.9, moon: 0 }],
  [3, { sky: 0xf6c48a, fog: 0xf2b27a, fogNear: 35, fogFar: 110, sun: 0xffb36b, sunIntensity: 1.25, hemiSky: 0xffd9b0, hemiGround: 0xb98f6a, hemiIntensity: 0.8, moon: 0 }],
  [5, { sky: 0x6e4a7e, fog: 0x5a3f6e, fogNear: 24, fogFar: 80, sun: 0xe0a8ff, sunIntensity: 0.95, hemiSky: 0xd2baf0, hemiGround: 0x6a5a72, hemiIntensity: 0.95, moon: 0.4 }],
  [7, { sky: 0x1d1426, fog: 0x2a1622, fogNear: 16, fogFar: 60, sun: 0xff8a78, sunIntensity: 0.8, hemiSky: 0xc4a8dc, hemiGround: 0x5a4250, hemiIntensity: 1.05, moon: 1 }],
];

function mixColor(a: number, b: number, t: number): number {
  const ch = (c: number, s: number) => (c >> s) & 0xff;
  const m = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t) << s;
  return m(16) | m(8) | m(0);
}

export function atmosphereFor(wave: number): Atmosphere {
  const w = Math.max(0, wave - 1);
  let i = 0;
  while (i + 1 < STOPS.length && STOPS[i + 1][0] <= w) i++;
  if (i + 1 >= STOPS.length) return STOPS[i][1];
  const [w0, a] = STOPS[i];
  const [w1, b] = STOPS[i + 1];
  const t = (w - w0) / (w1 - w0);
  const lerp = (x: number, y: number) => x + (y - x) * t;
  return {
    sky: mixColor(a.sky, b.sky, t), fog: mixColor(a.fog, b.fog, t), fogNear: lerp(a.fogNear, b.fogNear), fogFar: lerp(a.fogFar, b.fogFar),
    sun: mixColor(a.sun, b.sun, t), sunIntensity: lerp(a.sunIntensity, b.sunIntensity),
    hemiSky: mixColor(a.hemiSky, b.hemiSky, t), hemiGround: mixColor(a.hemiGround, b.hemiGround, t), hemiIntensity: lerp(a.hemiIntensity, b.hemiIntensity),
    moon: lerp(a.moon, b.moon),
  };
}

export { mixColor };

/** Blend two atmospheres (for smooth transitions between waves). */
export function mixAtmosphere(a: Atmosphere, b: Atmosphere, t: number): Atmosphere {
  const lerp = (x: number, y: number) => x + (y - x) * t;
  return {
    sky: mixColor(a.sky, b.sky, t), fog: mixColor(a.fog, b.fog, t), fogNear: lerp(a.fogNear, b.fogNear), fogFar: lerp(a.fogFar, b.fogFar),
    sun: mixColor(a.sun, b.sun, t), sunIntensity: lerp(a.sunIntensity, b.sunIntensity),
    hemiSky: mixColor(a.hemiSky, b.hemiSky, t), hemiGround: mixColor(a.hemiGround, b.hemiGround, t), hemiIntensity: lerp(a.hemiIntensity, b.hemiIntensity),
    moon: lerp(a.moon, b.moon),
  };
}
