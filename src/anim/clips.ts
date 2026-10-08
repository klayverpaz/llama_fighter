import type { Clip, JointEulers } from './clip';

/** Guard: fists up by the chin, elbows tucked, slight lean, left foot forward. */
export const GUARD: JointEulers = {
  spine: [0.1, 0, 0],
  neck: [0.05, 0, 0],
  shoulderL: [-1.3, 0, -0.25],
  elbowL: [-2.0, 0, 0],
  shoulderR: [-1.3, 0, 0.25],
  elbowR: [-2.0, 0, 0],
  hipL: [-0.35, 0, 0.08],
  kneeL: [0.35, 0, 0],
  hipR: [0.1, 0, -0.08],
  kneeR: [0.25, 0, 0],
};

export const STANCE: Clip = {
  name: 'stance',
  duration: 2,
  loop: true,
  keyframes: [
    { t: 0, joints: GUARD },
    { t: 1, joints: { ...GUARD, spine: [0.14, 0, 0], shoulderL: [-1.25, 0, -0.25], shoulderR: [-1.25, 0, 0.25] } },
    { t: 2, joints: GUARD },
  ],
};

/**
 * Rifle carry: torso bladed (left shoulder forward) so the short stick arms reach both the grip and the handguard,
 * head turned back to face the aim. The arms are overwritten every tick by the rifle IK.
 */
export const RIFLE_GUARD: JointEulers = {
  ...GUARD,
  spine: [0.12, -0.6, 0],
  neck: [0.02, 0.55, 0],
};

export const RIFLE_STANCE: Clip = {
  name: 'rifleStance',
  duration: 2.4,
  loop: true,
  keyframes: [
    { t: 0, joints: RIFLE_GUARD },
    { t: 1.2, joints: { ...RIFLE_GUARD, spine: [0.15, -0.6, 0] } },
    { t: 2.4, joints: RIFLE_GUARD },
  ],
};

/** Seated on the llama: thighs forward and spread around the barrel, shins hanging; arms come from the rifle IK. */
export const RIDE_GUARD: JointEulers = {
  ...RIFLE_GUARD,
  hipL: [-1.05, 0, 0.62],
  kneeL: [1.35, 0, 0],
  hipR: [-1.05, 0, -0.62],
  kneeR: [1.35, 0, 0],
};

export const RIDE: Clip = {
  name: 'ride',
  duration: 2.4,
  loop: true,
  keyframes: [
    { t: 0, joints: RIDE_GUARD },
    { t: 1.2, joints: { ...RIDE_GUARD, spine: [0.15, -0.6, 0] } },
    { t: 2.4, joints: RIDE_GUARD },
  ],
};

/** Zombie shamble: hunched, head lolling, arms reaching forward. */
export const ZOMBIE_POSE: JointEulers = {
  spine: [0.28, 0, 0.05],
  neck: [0.2, 0.15, 0.3],
  shoulderL: [-1.45, 0, -0.12],
  elbowL: [-0.25, 0, 0],
  shoulderR: [-1.35, 0, 0.1],
  elbowR: [-0.4, 0, 0],
  hipL: [-0.15, 0, 0.06],
  kneeL: [0.25, 0, 0],
  hipR: [0.05, 0, -0.06],
  kneeR: [0.2, 0, 0],
};

export const ZOMBIE: Clip = {
  name: 'zombie',
  duration: 1.6,
  loop: true,
  keyframes: [
    { t: 0, joints: ZOMBIE_POSE },
    { t: 0.8, joints: { ...ZOMBIE_POSE, neck: [0.25, -0.15, -0.25], shoulderL: [-1.3, 0, -0.12], shoulderR: [-1.5, 0, 0.1] } },
    { t: 1.6, joints: ZOMBIE_POSE },
  ],
};

/** Two-handed claw: arms up over the head, slam down, recover. Damage lands at ZOMBIE_SWIPE_HIT seconds. */
export const ZOMBIE_SWIPE_HIT = 0.38;
export const ZOMBIE_SWIPE: Clip = {
  name: 'zombieSwipe',
  duration: 0.75,
  loop: false,
  keyframes: [
    { t: 0, joints: ZOMBIE_POSE },
    { t: 0.28, joints: { ...ZOMBIE_POSE, spine: [-0.05, 0, 0], shoulderL: [-2.6, 0, -0.3], shoulderR: [-2.6, 0, 0.3], elbowL: [-0.6, 0, 0], elbowR: [-0.6, 0, 0] } },
    { t: 0.42, joints: { ...ZOMBIE_POSE, spine: [0.45, 0, 0], shoulderL: [-0.9, 0, -0.1], shoulderR: [-0.9, 0, 0.1], elbowL: [-0.2, 0, 0], elbowR: [-0.2, 0, 0] } },
    { t: 0.75, joints: ZOMBIE_POSE },
  ],
};
