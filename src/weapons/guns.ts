import type * as THREE from 'three';
import type { SegmentName } from '../figure/skeleton';
import { RIFLE, createRifleState, damageForSegment, tickRifle, type RifleInput, type RifleState, type RifleTick } from './rifle';
import { SHOTGUN, createShotgunState, pelletDamage, tickShotgun } from './shotgun';

export type GunName = 'rifle' | 'shotgun' | 'rpg' | 'freeze' | 'tesla' | 'antigrav' | 'llamaCannon';
export const GUN_NAMES: GunName[] = ['rifle', 'shotgun', 'rpg', 'freeze', 'tesla', 'antigrav', 'llamaCannon'];

/**
 * How a trigger pull resolves: instant rays (bullets/pellets), a flying projectile (rocket, llama),
 * or a special beam (freeze, chain lightning, anti-gravity).
 */
export type GunKind = 'hitscan' | 'rocket' | 'llama' | 'freeze' | 'tesla' | 'antigrav';

/** Reference points of a gun model in its own (scaled) frame. */
export interface GunPoints {
  grip: THREE.Vector3;
  handguard: THREE.Vector3;
  butt: THREE.Vector3;
  magWell: THREE.Vector3;
  chargingHandle: THREE.Vector3;
  muzzle: THREE.Vector3;
  ejectionPort: THREE.Vector3;
  centre: THREE.Vector3;
}

export interface GunSpec {
  name: GunName;
  kind: GunKind;
  /** HUD label. */
  label: string;
  magSize: number;
  range: number;
  pellets: number;
  /** 'mag' swaps the whole magazine; 'shell' loads one shell at a time. */
  reloadStyle: 'mag' | 'shell';
  /** Seconds for the whole reload ('mag') or one shell ('shell'). */
  reloadSeconds: number;
  koImpulse: number;
  ragdollImpulse: number;
  recoilPitch: number;
  recoilYaw: number;
  create(): RifleState;
  tick(s: RifleState, dt: number, input: RifleInput): RifleTick & { shellLoaded?: boolean };
  /** Cone half-angle for the next round. */
  spread(state: RifleState, aimBlend: number, moving: boolean): number;
  damage(segment: SegmentName, distance: number): number;
}

/** Fixed-cadence gun (no spread growth): auto or semi, whole-magazine reload. */
interface SimpleGun {
  fireInterval: number;
  magSize: number;
  reloadSeconds: number;
  auto: boolean;
}

function simpleTick(cfg: SimpleGun) {
  return (s: RifleState, dt: number, input: RifleInput): RifleTick => {
    const next: RifleState = { ...s, cooldown: Math.max(0, s.cooldown - dt) };
    let shots = 0;
    let dryFire = false;
    let reloadStarted = false;
    let reloadFinished = false;
    if (next.reloading > 0) {
      next.reloading = Math.max(0, next.reloading - dt);
      if (next.reloading === 0) {
        next.ammo = cfg.magSize;
        reloadFinished = true;
      }
    } else if (input.reload && next.ammo < cfg.magSize) {
      next.reloading = cfg.reloadSeconds;
      reloadStarted = true;
    } else if (input.trigger) {
      // Semi-auto guns need the trigger released between shots (dryClicked doubles as "trigger was down").
      const ready = next.cooldown <= 1e-9 && (cfg.auto || !next.dryClicked);
      if (next.ammo > 0 && ready) {
        shots = 1;
        next.ammo--;
        next.cooldown = cfg.fireInterval;
      } else if (next.ammo === 0 && !next.dryClicked) {
        dryFire = true;
      }
      next.dryClicked = true;
    } else {
      next.dryClicked = false;
    }
    if (!input.trigger && next.ammo === 0 && next.reloading === 0 && !reloadFinished) {
      next.reloading = cfg.reloadSeconds;
      reloadStarted = true;
    }
    return { state: next, shots, dryFire, reloadStarted, reloadFinished };
  };
}

function simpleGun(
  name: GunName, kind: GunKind, label: string, cfg: SimpleGun,
  extra: { range: number; spreadAim: number; spreadHip: number; recoilPitch: number; recoilYaw: number; koImpulse?: number; ragdollImpulse?: number },
): GunSpec {
  return {
    name, kind, label,
    magSize: cfg.magSize,
    range: extra.range,
    pellets: 1,
    reloadStyle: 'mag',
    reloadSeconds: cfg.reloadSeconds,
    koImpulse: extra.koImpulse ?? 0,
    ragdollImpulse: extra.ragdollImpulse ?? 0,
    recoilPitch: extra.recoilPitch,
    recoilYaw: extra.recoilYaw,
    create: () => ({ ammo: cfg.magSize, cooldown: 0, reloading: 0, spread: extra.spreadAim, dryClicked: false }),
    tick: simpleTick(cfg),
    spread: (_s, aim) => extra.spreadAim + (extra.spreadHip - extra.spreadAim) * (1 - aim),
    damage: () => 0,
  };
}

/** Explosion and special-weapon numbers (used by the game when resolving shots). */
export const SPECIAL = {
  rocketSpeed: 32,
  rocketGravity: 1.2,
  blastRadius: 4.5,
  /** Damage at the centre of the blast, fading to zero at the edge. */
  blastDamage: 140,
  /** Velocity kick (m/s) given to every body segment at the centre of the blast, fading to the edge. */
  blastSpeed: 11,
  llamaSpeed: 19,
  llamaDamage: 60,
  llamaImpulse: 70,
  /** How long launched llamas keep bouncing around before vanishing, and how many at once. */
  llamaPropSeconds: 14,
  maxLlamaProps: 12,
  freezeSeconds: 5,
  shatterImpulse: 55,
  teslaRange: 28,
  teslaChainRadius: 5,
  teslaMaxTargets: 5,
  teslaDamage: 26,
  teslaImpulse: 14,
  floatSeconds: 2.6,
  /** Gravity multiplier while floating (negative = falls upward). */
  floatGravity: -0.35,
};

export const GUNS: Record<GunName, GunSpec> = {
  rifle: {
    name: 'rifle',
    kind: 'hitscan',
    label: 'AK-47',
    magSize: RIFLE.magSize,
    range: RIFLE.range,
    pellets: 1,
    reloadStyle: 'mag',
    reloadSeconds: RIFLE.reloadSeconds,
    koImpulse: RIFLE.koImpulse,
    ragdollImpulse: RIFLE.ragdollImpulse,
    recoilPitch: RIFLE.recoilPitch,
    recoilYaw: RIFLE.recoilYaw,
    create: createRifleState,
    tick: tickRifle,
    spread: (s, aim, moving) => s.spread + (moving ? RIFLE.spreadMoving : 0) + RIFLE.spreadHip * (1 - aim),
    damage: (segment) => damageForSegment(segment),
  },
  shotgun: {
    name: 'shotgun',
    kind: 'hitscan',
    label: 'Escopeta',
    magSize: SHOTGUN.magSize,
    range: SHOTGUN.range,
    pellets: SHOTGUN.pellets,
    reloadStyle: 'shell',
    reloadSeconds: SHOTGUN.shellSeconds,
    koImpulse: SHOTGUN.koImpulse,
    ragdollImpulse: SHOTGUN.ragdollImpulse,
    recoilPitch: SHOTGUN.recoilPitch,
    recoilYaw: SHOTGUN.recoilYaw,
    create: createShotgunState,
    tick: tickShotgun,
    spread: (_s, aim, moving) => SHOTGUN.spreadAim + (SHOTGUN.spreadHip - SHOTGUN.spreadAim) * (1 - aim) + (moving ? SHOTGUN.spreadMoving : 0),
    damage: pelletDamage,
  },
  rpg: simpleGun('rpg', 'rocket', 'Bazuca', { fireInterval: 0.9, magSize: 1, reloadSeconds: 2.2, auto: false },
    { range: 200, spreadAim: 0.004, spreadHip: 0.03, recoilPitch: 0.09, recoilYaw: 0.02 }),
  freeze: simpleGun('freeze', 'freeze', 'Raio Congelante', { fireInterval: 0.28, magSize: 12, reloadSeconds: 1.6, auto: true },
    { range: 70, spreadAim: 0.003, spreadHip: 0.02, recoilPitch: 0.006, recoilYaw: 0.003, ragdollImpulse: 10 }),
  tesla: simpleGun('tesla', 'tesla', 'Arma Tesla', { fireInterval: 0.55, magSize: 6, reloadSeconds: 1.8, auto: true },
    { range: SPECIAL.teslaRange, spreadAim: 0.002, spreadHip: 0.015, recoilPitch: 0.025, recoilYaw: 0.01 }),
  antigrav: simpleGun('antigrav', 'antigrav', 'Antigravidade', { fireInterval: 0.45, magSize: 8, reloadSeconds: 1.6, auto: true },
    { range: 80, spreadAim: 0.003, spreadHip: 0.02, recoilPitch: 0.012, recoilYaw: 0.004 }),
  llamaCannon: simpleGun('llamaCannon', 'llama', 'Lança-Lhamas', { fireInterval: 0.6, magSize: 5, reloadSeconds: 2.0, auto: true },
    { range: 200, spreadAim: 0.01, spreadHip: 0.04, recoilPitch: 0.05, recoilYaw: 0.015 }),
};

/** Number keys 1..8: fists, then the guns in GUN_NAMES order. */
export const WEAPON_KEYS: Array<'fists' | GunName> = ['fists', ...GUN_NAMES];

/** Spare rounds carried for each gun in wave mode (refilled by Max Ammo and between waves). */
export const RESERVE: Record<GunName, number> = {
  rifle: 210, shotgun: 40, rpg: 8, freeze: 48, tesla: 30, antigrav: 32, llamaCannon: 20,
};
