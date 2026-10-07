import { JOINT_NAMES } from '../figure/skeleton';
import { cloneJointRots, identityJointRots, type JointRots } from '../figure/fk';
import { sampleClip, type Clip, type PartialJointRots } from './clip';
import { walkLayer, walkPhaseRate } from './walk';

interface Action { clip: Clip; time: number }
interface Blend { from: JointRots; t: number; duration: number }

function overlay(target: JointRots, layer: PartialJointRots): void {
  for (const j of JOINT_NAMES) {
    const q = layer[j];
    if (q) target[j].copy(q);
  }
}

export class Animator {
  private baseTime = 0;
  private action: Action | null = null;
  private blend: Blend | null = null;
  private walkPhase = 0;
  private walkIntensity = 0;
  private current: JointRots = identityJointRots();

  constructor(private readonly base: Clip) {}

  get actionName(): string | null {
    return this.action?.clip.name ?? null;
  }

  /** Start a one-shot clip layered over the base, blending from the current output. */
  play(clip: Clip, blendSeconds = 0.1): void {
    this.action = { clip, time: 0 };
    if (blendSeconds > 0) this.blendFromRots(this.current, blendSeconds);
    else this.blend = null;
  }

  /** Blend from arbitrary rotations (e.g. read back from a ragdoll) to the animated target. */
  blendFromRots(rots: JointRots, seconds: number): void {
    this.blend = { from: cloneJointRots(rots), t: 0, duration: Math.max(seconds, 1e-3) };
  }

  update(dt: number, moveSpeed = 0): JointRots {
    this.baseTime += dt;
    const target = identityJointRots();
    overlay(target, sampleClip(this.base, this.baseTime));

    const wantIntensity = this.action ? 0 : Math.min(1, moveSpeed / 3);
    this.walkIntensity += (wantIntensity - this.walkIntensity) * Math.min(1, dt * 10);
    this.walkPhase += dt * walkPhaseRate(moveSpeed);
    overlay(target, walkLayer(this.walkPhase, this.walkIntensity));

    if (this.action) {
      this.action.time += dt;
      const { clip, time } = this.action;
      overlay(target, sampleClip(clip, time));
      if (!clip.loop && time >= clip.duration) this.action = null;
    }

    if (this.blend) {
      this.blend.t += dt;
      const k = Math.min(1, this.blend.t / this.blend.duration);
      for (const j of JOINT_NAMES) target[j] = this.blend.from[j].clone().slerp(target[j], k);
      if (k >= 1) this.blend = null;
    }

    this.current = target;
    return cloneJointRots(target);
  }
}
