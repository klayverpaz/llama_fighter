import { TUNING, type Tuning } from '../tuning/tuning';
import { zombieStats, type ZombieStats } from './waves';

export type ZombieKind = 'walker' | 'runner' | 'brute' | 'cavalry' | 'boss';

/** Look of a zombie kind; its balance numbers (firstWave, weight, hp/speed/damage multipliers) live in tuning.json. */
interface ZombieKindLook {
  /** HUD / banner name (plural for "NOVO: …"). */
  name: string;
  plural: string;
  skin: number;
  eyes: number;
  /** Visual thickness of limbs/torso (1 = normal) and head size. */
  bulk: number;
  head: number;
  /** Whole-body size (the boss towers at 4×). */
  scale?: number;
}

export type ZombieKindSpec = ZombieKindLook & Tuning['zombieKinds'][ZombieKind];

/** The tuning object itself, with the look attached, so edits to TUNING apply live. */
const kind = (k: ZombieKind, look: ZombieKindLook): ZombieKindSpec => Object.assign(TUNING.zombieKinds[k], look);

export const ZOMBIE_KINDS: Record<ZombieKind, ZombieKindSpec> = {
  walker: kind('walker', { name: 'Andarilho', plural: 'ANDARILHOS', skin: 0x6f9a4a, eyes: 0xfff35a, bulk: 1, head: 1 }),
  runner: kind('runner', { name: 'Corredor', plural: 'CORREDORES', skin: 0xb9c99a, eyes: 0xff3b2f, bulk: 0.85, head: 0.95 }),
  brute: kind('brute', { name: 'Brutamontes', plural: 'BRUTAMONTES', skin: 0x6b4b8e, eyes: 0x7dfcff, bulk: 1.9, head: 1.2 }),
  cavalry: kind('cavalry', { name: 'Cavaleiro Zumbi', plural: 'CAVALEIROS ZUMBIS', skin: 0x8a9a6a, eyes: 0xff3b2f, bulk: 1, head: 1 }),
  boss: kind('boss', { name: 'Rei Brutamontes', plural: 'O REI', skin: 0xc9a227, eyes: 0xff2020, bulk: 1.7, head: 1.2, scale: 4 }),
};

/** Per-wave zombie scaling, cavalry speed, maxHit (no single hit on the player takes more) and boss cadence. */
export const ZOMBIES = TUNING.zombies;

export const isBossWave = (wave: number) => wave > 0 && wave % Math.max(1, Math.round(ZOMBIES.bossEvery)) === 0;

/** Pick the kind of the next spawn: weighted among the kinds unlocked by this wave. */
export function pickZombieKind(wave: number, rng: () => number): ZombieKind {
  const pool = (Object.keys(ZOMBIE_KINDS) as ZombieKind[]).filter((k) => ZOMBIE_KINDS[k].weight > 0 && ZOMBIE_KINDS[k].firstWave <= wave);
  if (pool.length === 0) return 'walker';
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
    speed: kind === 'cavalry' ? ZOMBIES.cavalrySpeed : Math.min(ZOMBIES.kindSpeedMax, base.speed * k.speedMul),
    damage: Math.min(ZOMBIES.maxHit, Math.round(base.damage * k.damageMul)),
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
