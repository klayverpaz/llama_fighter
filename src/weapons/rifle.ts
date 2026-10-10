import type { SegmentName } from '../figure/skeleton';
import { TUNING } from '../tuning/tuning';

/** AK-47 numbers from tuning.json (spread = cone half-angle in radians, impulses in N·s). */
export const RIFLE = TUNING.rifle;

/** Damage group of a body segment, for the per-gun damage tables in tuning.json. */
export function segmentGroup(segment: SegmentName): 'head' | 'torso' | 'pelvis' | 'upperLimb' | 'lowerLimb' {
  switch (segment) {
    case 'head': case 'torso': case 'pelvis': return segment;
    case 'upperArmL': case 'upperArmR': case 'upperLegL': case 'upperLegR': return 'upperLimb';
    default: return 'lowerLimb';
  }
}

/** With the default HP of 50: three torso shots, one to the head. */
export function damageForSegment(segment: SegmentName): number {
  return RIFLE.damage[segmentGroup(segment)];
}

export interface RifleState {
  ammo: number;
  cooldown: number;
  /** Seconds left in the reload, 0 when not reloading. */
  reloading: number;
  spread: number;
  /** Trigger was held last tick and the mag ran dry — used for a single dry-fire click. */
  dryClicked: boolean;
}

export interface RifleInput {
  trigger: boolean;
  reload: boolean;
}

export interface RifleTick {
  state: RifleState;
  /** Rounds fired this tick (0 or 1 at 60 Hz). */
  shots: number;
  dryFire: boolean;
  reloadStarted: boolean;
  reloadFinished: boolean;
}

export function createRifleState(): RifleState {
  return { ammo: RIFLE.magSize, cooldown: 0, reloading: 0, spread: RIFLE.spreadBase, dryClicked: false };
}

export function tickRifle(s: RifleState, dt: number, input: RifleInput): RifleTick {
  const next: RifleState = { ...s, cooldown: Math.max(0, s.cooldown - dt) };
  let shots = 0;
  let dryFire = false;
  let reloadStarted = false;
  let reloadFinished = false;

  if (next.reloading > 0) {
    next.reloading = Math.max(0, next.reloading - dt);
    if (next.reloading === 0) {
      next.ammo = RIFLE.magSize;
      reloadFinished = true;
    }
  } else if (input.reload && next.ammo < RIFLE.magSize) {
    next.reloading = RIFLE.reloadSeconds;
    reloadStarted = true;
  } else if (input.trigger) {
    if (next.ammo > 0) {
      while (next.cooldown <= 1e-9 && next.ammo > 0) {
        shots++;
        next.ammo--;
        next.cooldown += Math.max(0.01, RIFLE.fireInterval);
        next.spread = Math.min(RIFLE.spreadMax, next.spread + RIFLE.spreadPerShot);
      }
      next.dryClicked = false;
    } else if (!next.dryClicked) {
      dryFire = true;
      next.dryClicked = true;
    }
  } else {
    next.dryClicked = false;
  }

  // Auto-reload when the mag is empty and the trigger is released.
  if (!input.trigger && next.ammo === 0 && next.reloading === 0 && !reloadFinished) {
    next.reloading = RIFLE.reloadSeconds;
    reloadStarted = true;
  }

  if (!input.trigger || next.ammo === 0) next.spread = Math.max(RIFLE.spreadBase, next.spread - RIFLE.spreadRecovery * dt);
  return { state: next, shots, dryFire, reloadStarted, reloadFinished };
}
