import type { SegmentName } from '../figure/skeleton';

export const RIFLE = {
  /** 600 rounds per minute. */
  fireInterval: 0.1,
  magSize: 30,
  reloadSeconds: 1.9,
  range: 150,
  /** Cone half-angle in radians: first shot, growth per shot, cap, recovery per second. */
  spreadBase: 0.004,
  spreadPerShot: 0.007,
  spreadMax: 0.06,
  spreadRecovery: 0.15,
  /** Extra spread while moving / not aiming down sights. */
  spreadMoving: 0.02,
  spreadHip: 0.025,
  /** Impulse along the bullet direction (N·s): on the KO shot, and on every shot into a body already down. */
  koImpulse: 38,
  ragdollImpulse: 14,
  /** Camera kick per shot, radians. */
  recoilPitch: 0.010,
  recoilYaw: 0.006,
};

/** HP is 50: three torso shots, one to the head. */
export function damageForSegment(segment: SegmentName): number {
  switch (segment) {
    case 'head': return 100;
    case 'torso': return 18;
    case 'pelvis': return 15;
    case 'upperArmL': case 'upperArmR': case 'upperLegL': case 'upperLegR': return 11;
    default: return 8;
  }
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
        next.cooldown += RIFLE.fireInterval;
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
