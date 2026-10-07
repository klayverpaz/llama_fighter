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
