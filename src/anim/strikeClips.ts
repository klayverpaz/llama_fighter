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
  hookL: strikeClip(STRIKES.hookL, {
    shoulderL: [-1.45, 0, -0.95], elbowL: [-1.6, 0, 0], spine: [0.1, -0.7, 0],
  }),
  hookR: strikeClip(STRIKES.hookR, {
    shoulderR: [-1.45, 0, 0.95], elbowR: [-1.6, 0, 0], spine: [0.1, 0.7, 0],
  }),
  lowKick: strikeClip(STRIKES.lowKick, {
    hipR: [-0.9, 0.5, -0.3], kneeR: [0.4, 0, 0], hipL: [-0.2, 0, 0.1], spine: [0, -0.5, 0.2],
  }),
  frontKick: strikeClip(
    STRIKES.frontKick,
    { hipR: [-1.5, 0, -0.05], kneeR: [0.1, 0, 0], spine: [-0.2, 0, 0], hipL: [-0.2, 0, 0.1] },
    { hipR: [-1.6, 0, -0.05], kneeR: [2.0, 0, 0] },
  ),
  highKick: strikeClip(
    STRIKES.highKick,
    { hipR: [-2.0, 0.4, -0.5], kneeR: [0.2, 0, 0], spine: [-0.3, -0.6, 0.4], hipL: [-0.2, 0, 0.1] },
    { hipR: [-1.4, 0.3, -0.3], kneeR: [2.0, 0, 0] },
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
