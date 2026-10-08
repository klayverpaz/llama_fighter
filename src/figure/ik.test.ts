import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import { solveArmIK, UPPER_ARM, FOREARM } from './ik';

function handOf(shoulder: Vector3, ik: ReturnType<typeof solveArmIK>) {
  const elbow = new Vector3(0, -UPPER_ARM, 0).applyQuaternion(ik.shoulder).add(shoulder);
  const fore = new Vector3(0, -FOREARM, 0).applyQuaternion(ik.elbow).applyQuaternion(ik.shoulder);
  return { elbow, hand: elbow.clone().add(fore) };
}

describe('solveArmIK', () => {
  const shoulder = new Vector3(-0.2, 0.22, 0);

  it('puts the hand exactly on reachable targets', () => {
    const targets = [
      new Vector3(-0.1, 0.1, 0.35),
      new Vector3(0.05, 0.25, 0.4),
      new Vector3(-0.3, -0.1, 0.2),
      new Vector3(-0.2, 0.22, 0.5),
    ];
    for (const t of targets) {
      const ik = solveArmIK(shoulder, t, new Vector3(-1, -1, 0));
      expect(ik.reached).toBe(true);
      expect(handOf(shoulder, ik).hand.distanceTo(t)).toBeLessThan(1e-4);
    }
  });

  it('points the elbow toward the pole side', () => {
    const t = new Vector3(-0.15, 0.15, 0.35);
    const down = handOf(shoulder, solveArmIK(shoulder, t, new Vector3(0, -1, 0))).elbow;
    const out = handOf(shoulder, solveArmIK(shoulder, t, new Vector3(-1, 0, 0))).elbow;
    expect(down.y).toBeLessThan(out.y);
    expect(out.x).toBeLessThan(down.x);
  });

  it('stretches toward an unreachable target without NaN and keeps the elbow within its hinge', () => {
    const t = new Vector3(-0.2, 0.22, 2);
    const ik = solveArmIK(shoulder, t, new Vector3(0, -1, 0));
    expect(ik.reached).toBe(false);
    const { hand } = handOf(shoulder, ik);
    expect(Number.isFinite(hand.x)).toBe(true);
    expect(hand.z).toBeGreaterThan(0.55);
    expect(ik.elbow.x).toBeLessThanOrEqual(0);
  });
});
