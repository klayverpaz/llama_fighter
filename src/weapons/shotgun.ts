import type { SegmentName } from '../figure/skeleton';
import type { RifleInput, RifleState, RifleTick } from './rifle';

/** Pump-action 12 gauge: 8 shells, 9 pellets per shot, shell-by-shell reload. */
export const SHOTGUN = {
  /** Time between shots (includes working the pump). */
  fireInterval: 0.85,
  /** The pump stroke starts this long after the shot and takes `pumpSeconds`. */
  pumpDelay: 0.14,
  pumpSeconds: 0.42,
  /** How far the forend slides back (metres, rifle frame). */
  pumpTravel: 0.09,
  magSize: 8,
  shellSeconds: 0.5,
  pellets: 9,
  range: 60,
  /** Pellet cone half-angle: shouldered, from the hip, extra while moving. */
  spreadAim: 0.055,
  spreadHip: 0.085,
  spreadMoving: 0.012,
  /** Per pellet: on the KO pellet, and on every pellet into a body already down (they add up). */
  koImpulse: 30,
  ragdollImpulse: 22,
  recoilPitch: 0.06,
  recoilYaw: 0.02,
  /** Full damage up to here, fading linearly to `minFalloff` at `falloffEnd`. */
  falloffStart: 6,
  falloffEnd: 26,
  minFalloff: 0.25,
};

/** Per-pellet damage. Point blank to the chest: ~80 for nine pellets (HP is 50). */
export function pelletDamage(segment: SegmentName, distance: number): number {
  const base = segment === 'head' ? 30
    : segment === 'torso' ? 9
    : segment === 'pelvis' ? 8
    : segment === 'upperArmL' || segment === 'upperArmR' || segment === 'upperLegL' || segment === 'upperLegR' ? 6
    : 4;
  const t = (distance - SHOTGUN.falloffStart) / (SHOTGUN.falloffEnd - SHOTGUN.falloffStart);
  const k = Math.min(1, Math.max(SHOTGUN.minFalloff, 1 - t * (1 - SHOTGUN.minFalloff)));
  return base * k;
}

export function createShotgunState(): RifleState {
  return { ammo: SHOTGUN.magSize, cooldown: 0, reloading: 0, spread: SHOTGUN.spreadAim, dryClicked: false };
}

/**
 * Same tick contract as the rifle. `reloading` is the time left on the shell being pushed in; reloading carries on
 * shell by shell until the tube is full, and pulling the trigger with shells loaded cancels it.
 */
export function tickShotgun(s: RifleState, dt: number, input: RifleInput): RifleTick & { shellLoaded: boolean } {
  const next: RifleState = { ...s, cooldown: Math.max(0, s.cooldown - dt) };
  let shots = 0;
  let dryFire = false;
  let reloadStarted = false;
  let reloadFinished = false;
  let shellLoaded = false;

  if (next.reloading > 0 && input.trigger && next.ammo > 0) {
    next.reloading = 0;
    reloadFinished = true;
  }

  if (next.reloading > 0) {
    next.reloading = Math.max(0, next.reloading - dt);
    if (next.reloading === 0) {
      next.ammo = Math.min(SHOTGUN.magSize, next.ammo + 1);
      shellLoaded = true;
      if (next.ammo < SHOTGUN.magSize) next.reloading = SHOTGUN.shellSeconds;
      else reloadFinished = true;
    }
  } else if (input.reload && next.ammo < SHOTGUN.magSize && next.cooldown === 0) {
    next.reloading = SHOTGUN.shellSeconds;
    reloadStarted = true;
  } else if (input.trigger) {
    if (next.ammo > 0) {
      if (next.cooldown <= 1e-9) {
        shots = 1;
        next.ammo--;
        next.cooldown = SHOTGUN.fireInterval;
      }
      next.dryClicked = false;
    } else if (!next.dryClicked) {
      dryFire = true;
      next.dryClicked = true;
    }
  } else {
    next.dryClicked = false;
  }

  if (!input.trigger && next.ammo === 0 && next.reloading === 0 && next.cooldown === 0) {
    next.reloading = SHOTGUN.shellSeconds;
    reloadStarted = true;
  }
  return { state: next, shots, dryFire, reloadStarted, reloadFinished, shellLoaded };
}

/** Forend travel 0..1 for the pump stroke, given the time since the last shot. */
export function pumpStroke(sinceShot: number): number {
  const t = (sinceShot - SHOTGUN.pumpDelay) / SHOTGUN.pumpSeconds;
  if (t <= 0 || t >= 1) return 0;
  return Math.sin(t * Math.PI);
}
