import { describe, it, expect } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { STRIKES, STRIKE_NAMES, strikeDuration, type StrikeName } from '../combat/strikes';
import { STRIKE_CLIPS, getStrikeClip, FLINCH } from './strikeClips';
import { eulerToQuat, type Clip } from './clip';
import { Animator } from './animator';
import { GUARD, STANCE } from './clips';
import { NPC_TUNING } from '../entities/npcBrain';
import { forwardKinematics, identityJointRots, localToWorld, yawQuaternion } from '../figure/fk';
import { LIMB_ENDS, PELVIS_HEIGHT, SEGMENTS, type JointName } from '../figure/skeleton';

const DT = 1 / 60;

interface AxisSegment { a: Vector3; b: Vector3; radius: number }

/** Stance NPC at ground distance `distance` in front of the player (+Z), facing it (yaw pi). */
function npcCapsules(distance: number): AxisSegment[] {
  const joints = identityJointRots();
  for (const [j, e] of Object.entries(GUARD)) joints[j as JointName] = eulerToQuat(e!);
  const t = forwardKinematics({ root: { position: new Vector3(0, PELVIS_HEIGHT, distance), rotation: yawQuaternion(Math.PI) }, joints });
  return SEGMENTS.map((seg) => {
    const half = new Vector3(0, seg.length / 2, 0).applyQuaternion(t[seg.name].rotation);
    return { a: t[seg.name].position.clone().sub(half), b: t[seg.name].position.clone().add(half), radius: seg.radius };
  });
}

function distToSegment(p: Vector3, { a, b }: AxisSegment): number {
  const ab = b.clone().sub(a);
  const len2 = ab.lengthSq();
  const k = len2 > 0 ? Math.min(1, Math.max(0, p.clone().sub(a).dot(ab) / len2)) : 0;
  return p.distanceTo(a.clone().addScaledVector(ab, k));
}

/**
 * Smallest gap (limb point to NPC capsule surface) over the strike's active window, mirroring the game's
 * tick order: the strike starts on tick 0 (attack time 0, animator already advanced by dt).
 */
function strikeGap(name: StrikeName, distance: number, clip: Clip = getStrikeClip(name)): number {
  const def = STRIKES[name];
  const capsules = npcCapsules(distance);
  const animator = new Animator(STANCE);
  animator.play(clip, 0);
  const root = { position: new Vector3(0, PELVIS_HEIGHT, 0), rotation: new Quaternion() };
  let best = Infinity;
  for (let k = 0; k * DT < strikeDuration(def); k++) {
    const attackT = k * DT;
    const joints = animator.update(DT, 0);
    if (attackT < def.startup || attackT >= def.startup + def.active) continue;
    const t = forwardKinematics({ root, joints });
    const p = localToWorld(t[LIMB_ENDS[def.limb].segment], LIMB_ENDS[def.limb].local);
    for (const c of capsules) best = Math.min(best, distToSegment(p, c) - c.radius);
  }
  return best;
}


describe('strike clips', () => {
  it('has one clip per strike with duration equal to the strike timing', () => {
    for (const n of STRIKE_NAMES) {
      const clip = getStrikeClip(n);
      expect(clip).toBe(STRIKE_CLIPS[n]);
      expect(clip.loop).toBe(false);
      expect(clip.duration).toBeCloseTo(strikeDuration(STRIKES[n]), 6);
    }
  });

  it('keyframes are sorted, start at 0 and end at duration', () => {
    for (const clip of [...Object.values(STRIKE_CLIPS), FLINCH]) {
      const ts = clip.keyframes.map((k) => k.t);
      expect(ts[0]).toBe(0);
      expect(ts[ts.length - 1]).toBeCloseTo(clip.duration, 6);
      for (let i = 1; i < ts.length; i++) expect(ts[i]).toBeGreaterThan(ts[i - 1]);
    }
  });

  for (const n of STRIKE_NAMES) {
    it(`${n} reaches a stance NPC facing the player at the hold distance`, () => {
      expect(strikeGap(n, NPC_TUNING.holdDistance)).toBeLessThan(STRIKES[n].hitRadius);
    });
  }

  for (const n of ['cross', 'lowKick', 'frontKick', 'highKick'] as const) {
    it(`${n} also reaches at the resume distance`, () => {
      expect(strikeGap(n, NPC_TUNING.resumeDistance)).toBeLessThan(STRIKES[n].hitRadius);
    });
  }
});
