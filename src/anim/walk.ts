import { eulerToQuat, type PartialJointRots } from './clip';

const HIP_SWING = 0.5;
const KNEE_BEND = 0.8;

/**
 * Procedural leg cycle, returned as delta rotations to compose onto the stance.
 * `phase` in radians, `intensity` 0..1.
 * Positive hip X rotation swings the leg backward; the knee bends while the leg is back.
 */
export function walkLayer(phase: number, intensity: number): PartialJointRots {
  if (intensity <= 0) return {};
  const s = Math.sin(phase) * intensity;
  return {
    hipL: eulerToQuat([HIP_SWING * s, 0, 0]),
    hipR: eulerToQuat([-HIP_SWING * s, 0, 0]),
    kneeL: eulerToQuat([KNEE_BEND * Math.max(0, s), 0, 0]),
    kneeR: eulerToQuat([KNEE_BEND * Math.max(0, -s), 0, 0]),
  };
}

/** Phase advance per second at a given ground speed (one full cycle per ~1.4 m). */
export function walkPhaseRate(speed: number): number {
  return (2 * Math.PI * speed) / 1.4;
}
