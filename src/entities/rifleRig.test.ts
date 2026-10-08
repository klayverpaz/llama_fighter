import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import { forwardKinematics, identityJointRots, yawQuaternion, localToWorld } from '../figure/fk';
import { eulerToQuat } from '../anim/clip';
import { RIFLE_GUARD } from '../anim/clips';
import { PELVIS_HEIGHT, LIMB_ENDS, JOINT_NAMES } from '../figure/skeleton';
import { solveRifleRig, solveGunRig, muzzleOf, quatFromDir } from './rifleRig';
import { SHOTGUN_POINTS } from '../weapons/shotgunModel';

function standingTorso(yaw = 0) {
  const joints = identityJointRots();
  for (const j of JOINT_NAMES) if (RIFLE_GUARD[j]) joints[j] = eulerToQuat(RIFLE_GUARD[j]!);
  const root = { position: new Vector3(0, PELVIS_HEIGHT, 0), rotation: yawQuaternion(yaw) };
  return { root, joints, torso: forwardKinematics({ root, joints }).torso };
}

function handsAfter(out: ReturnType<typeof solveRifleRig>, base: ReturnType<typeof standingTorso>) {
  const joints = { ...base.joints, ...out.joints };
  const t = forwardKinematics({ root: base.root, joints });
  return { R: localToWorld(t.lowerArmR, LIMB_ENDS.handR.local), L: localToWorld(t.lowerArmL, LIMB_ENDS.handL.local) };
}

describe('quatFromDir', () => {
  it('maps +Z onto the direction', () => {
    for (const d of [new Vector3(0, 0, 1), new Vector3(1, -0.3, 0.2), new Vector3(-0.4, 0.5, -1)]) {
      expect(new Vector3(0, 0, 1).applyQuaternion(quatFromDir(d)).distanceTo(d.clone().normalize())).toBeLessThan(1e-6);
    }
  });
});

describe('solveRifleRig', () => {
  const cases: Array<[string, Vector3]> = [
    ['straight ahead', new Vector3(0, 1.5, 20)],
    ['down at the floor', new Vector3(0, 0, 3)],
    ['up high', new Vector3(0, 6, 8)],
    ['off to the left', new Vector3(6, 1.4, 10)],
  ];
  for (const [name, aim] of cases) {
    it(`shouldered (${name}): both hands on the rifle and the barrel points at the target`, () => {
      const base = standingTorso();
      const out = solveRifleRig({ torso: base.torso, aimPoint: aim, aimBlend: 1, reloadPhase: null, swap: 1 });
      const hands = handsAfter(out, base);
      expect(hands.R.distanceTo(out.handR!)).toBeLessThan(0.01);
      expect(hands.L.distanceTo(out.handL!)).toBeLessThan(0.01);
      const muzzle = muzzleOf(out);
      const barrel = new Vector3(0, 0, 1).applyQuaternion(out.gunRotation);
      const toAim = aim.clone().sub(muzzle).normalize();
      expect(barrel.angleTo(toAim)).toBeLessThan(0.08);
    });
  }

  it('keeps both hands on the rifle at low ready and through the whole reload', () => {
    const base = standingTorso(0.7);
    for (let p = 0; p <= 1.0001; p += 0.05) {
      const out = solveRifleRig({ torso: base.torso, aimPoint: new Vector3(0, 1.4, 10), aimBlend: 0, reloadPhase: p, swap: 1 });
      const hands = handsAfter(out, base);
      expect(hands.R.distanceTo(out.handR!)).toBeLessThan(0.01);
      expect(hands.L.distanceTo(out.handL!)).toBeLessThan(0.02);
    }
  });

  it('leaves the left arm to the animator while the rifle is still on the back', () => {
    const base = standingTorso();
    const out = solveRifleRig({ torso: base.torso, aimPoint: new Vector3(0, 1.4, 10), aimBlend: 0, reloadPhase: null, swap: 0 });
    expect(out.joints.shoulderL).toBeUndefined();
    expect(out.gunPosition.z).toBeLessThan(base.torso.position.z);
  });
});

describe('solveGunRig (shotgun)', () => {
  it('both hands on the shotgun when shouldered, through the pump stroke and every shell of a reload', () => {
    const base = standingTorso(0.4);
    const aim = new Vector3(2, 1.4, 12);
    const poses = [
      ...[0, 0.5, 1].map((pump) => ({ aimBlend: 1, pump, reload: null })),
      ...[0, 0.25, 0.5, 0.75, 1].map((phase) => ({ aimBlend: 0, pump: 0, reload: { style: 'shell' as const, phase, weight: 1 } })),
    ];
    for (const pose of poses) {
      const out = solveGunRig({ torso: base.torso, aimPoint: aim, swap: 1, points: SHOTGUN_POINTS, ...pose });
      const hands = handsAfter(out, base);
      expect(hands.R.distanceTo(out.handR!)).toBeLessThan(0.01);
      expect(hands.L.distanceTo(out.handL!)).toBeLessThan(0.02);
    }
  });

  it('the pump drags the left hand back along the barrel', () => {
    const base = standingTorso();
    const args = { torso: base.torso, aimPoint: new Vector3(0, 1.5, 20), aimBlend: 1, swap: 1, points: SHOTGUN_POINTS, reload: null };
    const rest = solveGunRig({ ...args, pump: 0 });
    const back = solveGunRig({ ...args, pump: 1 });
    expect(back.pumpOffset).toBeGreaterThan(0.05);
    expect(back.handL!.z).toBeLessThan(rest.handL!.z - 0.05);
    expect(muzzleOf(back, SHOTGUN_POINTS).distanceTo(muzzleOf(rest, SHOTGUN_POINTS))).toBeLessThan(1e-6);
  });
});
