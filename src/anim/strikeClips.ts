import type { Clip, JointEulers } from './clip';
import { GUARD } from './clips';
import { STRIKES, strikeDuration, type StrikeName, type StrikeDef } from '../combat/strikes';

function strikeClip(def: StrikeDef, extended: JointEulers, chamber?: JointEulers): Clip {
  const duration = strikeDuration(def);
  const keyframes = [{ t: 0, joints: GUARD }];
  if (chamber) keyframes.push({ t: def.startup * 0.5, joints: { ...GUARD, ...chamber } });
  keyframes.push(
    { t: def.startup, joints: { ...GUARD, ...extended } },
    { t: def.startup + def.active, joints: { ...GUARD, ...extended } },
    { t: duration, joints: GUARD },
  );
  return { name: def.name, duration, loop: false, keyframes };
}

export const STRIKE_CLIPS: Record<StrikeName, Clip> = {
  jab: strikeClip(STRIKES.jab, {
    shoulderL: [-1.55, 0, -0.05], elbowL: [-0.15, 0, 0], spine: [0.15, -0.3, 0],
  }),
  cross: strikeClip(STRIKES.cross, {
    shoulderR: [-1.6, 0, 0.05], elbowR: [-0.1, 0, 0], spine: [0.15, 0.5, 0], hipR: [-0.2, 0, -0.08],
  }),
  // Hooks: elbow raised out to the side at shoulder height, forearm sweeping horizontally across in
  // front of the face, strong torso twist. Chamber swings the fist wide first so it comes around.
  hookL: strikeClip(
    STRIKES.hookL,
    { shoulderL: [-0.16, -0.08, 1.89], elbowL: [-1.41, 0, 0], spine: [0.1, -0.9, 0] },
    { shoulderL: [-0.4, 0.3, 1.7], elbowL: [-1.6, 0, 0], spine: [0.1, -0.2, 0] },
  ),
  hookR: strikeClip(
    STRIKES.hookR,
    { shoulderR: [-0.16, 0.08, -1.89], elbowR: [-1.41, 0, 0], spine: [0.1, 0.9, 0] },
    { shoulderR: [-0.4, -0.3, -1.7], elbowR: [-1.6, 0, 0], spine: [0.1, 0.2, 0] },
  ),
  // Roundhouse to the thigh: chamber lifts the knee out to the right with the shin folded back,
  // then the near-straight leg sweeps across at thigh height.
  lowKick: strikeClip(
    STRIKES.lowKick,
    { hipR: [-1.5, -1.16, -0.25], kneeR: [0.21, 0, 0], hipL: [-0.2, 0, 0.1], spine: [0, -0.3, -0.25] },
    { hipR: [0, 0.93, -1.47], kneeR: [1.8, 0, 0] },
  ),
  frontKick: strikeClip(
    STRIKES.frontKick,
    { hipR: [-1.5, 0, -0.05], kneeR: [0.1, 0, 0], spine: [-0.2, 0, 0], hipL: [-0.2, 0, 0.1] },
    { hipR: [-1.6, 0, -0.05], kneeR: [2.0, 0, 0] },
  ),
  // Same roundhouse arc with the knee chambered higher; the foot lands at shoulder height while the
  // torso leans back and away from the kicking leg.
  highKick: strikeClip(
    STRIKES.highKick,
    { hipR: [-2.06, -0.88, 0.31], kneeR: [0.13, 0, 0], spine: [-0.3, -0.4, -0.45], hipL: [-0.2, 0, 0.1] },
    { hipR: [0, 1.01, -1.93], kneeR: [2.0, 0, 0] },
  ),
};

export function getStrikeClip(name: StrikeName): Clip {
  return STRIKE_CLIPS[name];
}

/** Short recoil when hit without KO: lean back, head back, arms pulled in. */
export const FLINCH: Clip = {
  name: 'flinch',
  duration: 0.3,
  loop: false,
  keyframes: [
    { t: 0, joints: GUARD },
    { t: 0.1, joints: { ...GUARD, spine: [-0.35, 0, 0], neck: [-0.3, 0, 0], elbowL: [-2.5, 0, 0], elbowR: [-2.5, 0, 0] } },
    { t: 0.3, joints: GUARD },
  ],
};
