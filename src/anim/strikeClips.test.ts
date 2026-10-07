import { describe, it, expect } from 'vitest';
import { STRIKE_CLIPS, getStrikeClip, FLINCH } from './strikeClips';
import { STRIKES, STRIKE_NAMES, strikeDuration } from '../combat/strikes';

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

  it('the striking limb is extended at the start of the active window', () => {
    for (const n of STRIKE_NAMES) {
      const def = STRIKES[n];
      const clip = STRIKE_CLIPS[n];
      const kf = clip.keyframes.find((k) => Math.abs(k.t - def.startup) < 1e-6);
      expect(kf, `${n} needs a keyframe at t=startup`).toBeDefined();
      const joint = def.limb === 'handL' ? 'shoulderL' : def.limb === 'handR' ? 'shoulderR' : def.limb === 'footL' ? 'hipL' : 'hipR';
      expect(kf!.joints[joint]).toBeDefined();
    }
  });
});
