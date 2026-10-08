import { describe, it, expect } from 'vitest';
import { generateObstacles, supportHeight, pushOut, over, type Obstacle } from './obstacles';
import { ARENA } from './arena';

const rngFrom = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

describe('generateObstacles', () => {
  it('makes a different layout every match, all on the island and clear of the spawn and the box', () => {
    const clear = [{ x: 0, z: 0, r: 3.5 }, { x: 0, z: -7, r: 2.5 }];
    const layouts = [1, 2, 3, 4, 5].map((s) => generateObstacles(rngFrom(s), clear));
    for (const l of layouts) {
      expect(l.length).toBeGreaterThanOrEqual(8);
      for (const o of l) {
        expect(Math.hypot(o.x, o.z)).toBeLessThan(ARENA.radius - 1);
        for (const c of clear) expect(over(o, c.x, c.z)).toBe(false);
      }
      // Pieces don't overlap.
      for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) {
        expect(Math.hypot(l[i].x - l[j].x, l[i].z - l[j].z)).toBeGreaterThan(1.5);
      }
    }
    expect(JSON.stringify(layouts[0])).not.toBe(JSON.stringify(layouts[1]));
    const kinds = new Set(layouts.flat().map((o) => o.kind));
    expect(kinds).toEqual(new Set(['crate', 'wall', 'pillar', 'rock']));
  });
});

describe('support and collision', () => {
  const crate: Obstacle = { shape: 'box', kind: 'crate', x: 0, z: 3, w: 1, d: 1, h: 0.8, rot: 0.5 };
  const pillar: Obstacle = { shape: 'cylinder', kind: 'pillar', x: 4, z: 0, r: 0.5, h: 3 };

  it('stands on the floor, on a crate top once high enough, and nothing off the island', () => {
    expect(supportHeight([crate], 0, 3, 0)).toBe(0);
    expect(supportHeight([crate], 0, 3, 0.75)).toBeCloseTo(0.8);
    expect(supportHeight([crate], 0, 0, 0.75)).toBe(0);
    expect(supportHeight([crate], 30, 0, 0, 0.25, false)).toBeNull();
  });

  it('a tall pillar pushes you out to its radius; a low crate does not once you are on it', () => {
    const p = pushOut([pillar], 3.8, 0, 0.3, 0);
    expect(Math.hypot(p.x - 4, p.z)).toBeCloseTo(0.8, 5);
    const onTop = pushOut([crate], 0.1, 3, 0.3, 0.8);
    expect(onTop).toEqual({ x: 0.1, z: 3 });
  });

  it('a rotated wall pushes you out of its long side and lets you slide along it', () => {
    const wall: Obstacle = { shape: 'box', kind: 'wall', x: 0, z: 0, w: 4, d: 0.5, h: 2, rot: Math.PI / 4 };
    for (const [x, z] of [[0.2, 0.1], [-0.5, 0.6], [1, 1.2]]) {
      const p = pushOut([wall], x, z, 0.3, 0);
      const c = Math.cos(wall.rot);
      const s = Math.sin(wall.rot);
      const lz = p.x * s + p.z * c;
      const lx = p.x * c - p.z * s;
      expect(Math.abs(lz) >= 0.25 + 0.3 - 1e-6 || Math.abs(lx) >= 2 + 0.3 - 1e-6 || Math.hypot(Math.abs(lx) - 2, Math.abs(lz) - 0.25) >= 0.3 - 1e-6).toBe(true);
    }
  });
});
