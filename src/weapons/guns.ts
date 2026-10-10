import type * as THREE from 'three';
import type { SegmentName } from '../figure/skeleton';
import { RIFLE, createRifleState, damageForSegment, tickRifle, type RifleInput, type RifleState, type RifleTick } from './rifle';
import { SHOTGUN, createShotgunState, pelletDamage, tickShotgun } from './shotgun';
import { TUNING } from '../tuning/tuning';

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

/** Fixed-cadence gun (no spread growth), whole-magazine reload: its numbers in tuning.json `guns`. */
interface SimpleGun {
  fireInterval: number;
  magSize: number;
  reloadSeconds: number;
  range?: number;
  spreadAim: number;
  spreadHip: number;
  recoilPitch: number;
  recoilYaw: number;
  koImpulse: number;
  ragdollImpulse: number;
}

function simpleTick(cfg: SimpleGun, auto: boolean) {
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
      const ready = next.cooldown <= 1e-9 && (auto || !next.dryClicked);
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

/** The spec reads `cfg` through getters, so tuning edits apply to the gun live. */
function simpleGun(name: GunName, kind: GunKind, label: string, auto: boolean, cfg: SimpleGun, range = () => cfg.range ?? 100): GunSpec {
  return {
    name, kind, label,
    pellets: 1,
    reloadStyle: 'mag',
    get magSize() { return cfg.magSize; },
    get range() { return range(); },
    get reloadSeconds() { return cfg.reloadSeconds; },
    get koImpulse() { return cfg.koImpulse; },
    get ragdollImpulse() { return cfg.ragdollImpulse; },
    get recoilPitch() { return cfg.recoilPitch; },
    get recoilYaw() { return cfg.recoilYaw; },
    create: () => ({ ammo: cfg.magSize, cooldown: 0, reloading: 0, spread: cfg.spreadAim, dryClicked: false }),
    tick: simpleTick(cfg, auto),
    spread: (_s, aim) => cfg.spreadAim + (cfg.spreadHip - cfg.spreadAim) * (1 - aim),
    damage: () => 0,
  };
}

/** Explosion and special-weapon numbers (used by the game when resolving shots); see tuning.json. */
export const SPECIAL = TUNING.special;

export const GUNS: Record<GunName, GunSpec> = {
  rifle: {
    name: 'rifle',
    kind: 'hitscan',
    label: 'AK-47',
    pellets: 1,
    reloadStyle: 'mag',
    get magSize() { return RIFLE.magSize; },
    get range() { return RIFLE.range; },
    get reloadSeconds() { return RIFLE.reloadSeconds; },
    get koImpulse() { return RIFLE.koImpulse; },
    get ragdollImpulse() { return RIFLE.ragdollImpulse; },
    get recoilPitch() { return RIFLE.recoilPitch; },
    get recoilYaw() { return RIFLE.recoilYaw; },
    create: createRifleState,
    tick: tickRifle,
    spread: (s, aim, moving) => s.spread + (moving ? RIFLE.spreadMoving : 0) + RIFLE.spreadHip * (1 - aim),
    damage: (segment) => damageForSegment(segment),
  },
  shotgun: {
    name: 'shotgun',
    kind: 'hitscan',
    label: 'Escopeta',
    reloadStyle: 'shell',
    get magSize() { return SHOTGUN.magSize; },
    get range() { return SHOTGUN.range; },
    get pellets() { return Math.max(1, Math.round(SHOTGUN.pellets)); },
    get reloadSeconds() { return SHOTGUN.shellSeconds; },
    get koImpulse() { return SHOTGUN.koImpulse; },
    get ragdollImpulse() { return SHOTGUN.ragdollImpulse; },
    get recoilPitch() { return SHOTGUN.recoilPitch; },
    get recoilYaw() { return SHOTGUN.recoilYaw; },
    create: createShotgunState,
    tick: tickShotgun,
    spread: (_s, aim, moving) => SHOTGUN.spreadAim + (SHOTGUN.spreadHip - SHOTGUN.spreadAim) * (1 - aim) + (moving ? SHOTGUN.spreadMoving : 0),
    damage: pelletDamage,
  },
  rpg: simpleGun('rpg', 'rocket', 'Bazuca', false, TUNING.guns.rpg),
  freeze: simpleGun('freeze', 'freeze', 'Raio Congelante', true, TUNING.guns.freeze),
  tesla: simpleGun('tesla', 'tesla', 'Arma Tesla', true, TUNING.guns.tesla, () => SPECIAL.teslaRange),
  antigrav: simpleGun('antigrav', 'antigrav', 'Antigravidade', true, TUNING.guns.antigrav),
  llamaCannon: simpleGun('llamaCannon', 'llama', 'Lança-Lhamas', true, TUNING.guns.llamaCannon),
};

/** Number keys 1..8: fists, then the guns in GUN_NAMES order. */
export const WEAPON_KEYS: Array<'fists' | GunName> = ['fists', ...GUN_NAMES];

/** Spare rounds carried for each gun in wave mode (refilled by Max Ammo and between waves). */
export const RESERVE: Record<GunName, number> = TUNING.reserve;
