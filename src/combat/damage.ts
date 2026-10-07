import { Vector3 } from 'three';
import { yawQuaternion } from '../figure/fk';
import type { StrikeDef } from './strikes';

export interface DamageResult {
  hp: number;
  knockedOut: boolean;
}

export function applyDamage(hp: number, strike: StrikeDef): DamageResult {
  const next = Math.max(0, hp - strike.damage);
  return { hp: next, knockedOut: next <= 0 };
}

/** Strike direction rotated into the world by the attacker's yaw, scaled to the strike impulse. */
export function impulseVector(strike: StrikeDef, yaw: number): Vector3 {
  return new Vector3(...strike.direction)
    .normalize()
    .applyQuaternion(yawQuaternion(yaw))
    .multiplyScalar(strike.impulse);
}
