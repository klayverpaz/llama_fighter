import type { SegmentName } from '../figure/skeleton';
import { TUNING } from '../tuning/tuning';
import { segmentGroup, type RifleInput, type RifleState, type RifleTick } from './rifle';

/** Pump-action 12 gauge: shell-by-shell reload, damage falling off with distance (numbers: tuning.json). */
export const SHOTGUN = TUNING.shotgun;

/** Per-pellet damage. Point blank to the chest: ~80 for nine pellets (HP is 50). */
export function pelletDamage(segment: SegmentName, distance: number): number {
  const base = SHOTGUN.damage[segmentGroup(segment)];
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
