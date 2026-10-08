import { ARENA } from './arena';

/** Footprint + height of a solid obstacle. Boxes can be rotated about Y. */
export type Obstacle =
  | { shape: 'box'; kind: 'crate' | 'wall'; x: number; z: number; w: number; d: number; h: number; rot: number }
  | { shape: 'cylinder'; kind: 'pillar' | 'rock'; x: number; z: number; r: number; h: number };

/** Anything at most this much higher than your feet you just step onto; taller blocks you. */
export const STEP_HEIGHT = 0.3;

export interface ClearZone { x: number; z: number; r: number }

/** Rough radius of an obstacle's footprint (for spacing). */
function extent(o: Obstacle): number {
  return o.shape === 'cylinder' ? o.r : Math.hypot(o.w, o.d) / 2;
}

/**
 * A fresh random layout every match: crates (some stacked), low walls you can hop, stone pillars and rocks.
 * Keeps `clear` zones empty (player spawn, Mystery Box) and leaves room to walk between pieces.
 */
export function generateObstacles(rng: () => number, clear: ClearZone[] = []): Obstacle[] {
  const count = 10 + Math.floor(rng() * 6);
  const out: Obstacle[] = [];
  let tries = 0;
  while (out.length < count && tries++ < 400) {
    const angle = rng() * Math.PI * 2;
    const dist = 4.5 + rng() * (ARENA.radius - 7.5);
    const x = Math.sin(angle) * dist;
    const z = Math.cos(angle) * dist;
    const roll = rng();
    let o: Obstacle;
    if (roll < 0.38) {
      const s = 0.9 + rng() * 0.4;
      const stacked = rng() < 0.3;
      o = { shape: 'box', kind: 'crate', x, z, w: s, d: s, h: stacked ? s * 2 : 0.75 + rng() * 0.25, rot: rng() * Math.PI };
    } else if (roll < 0.62) {
      o = { shape: 'box', kind: 'wall', x, z, w: 2.4 + rng() * 1.8, d: 0.45, h: 0.9 + rng() * 0.2, rot: rng() * Math.PI };
    } else if (roll < 0.82) {
      o = { shape: 'cylinder', kind: 'pillar', x, z, r: 0.45 + rng() * 0.25, h: 2.4 + rng() * 1.2 };
    } else {
      o = { shape: 'cylinder', kind: 'rock', x, z, r: 0.8 + rng() * 0.45, h: 1.3 + rng() * 0.5 };
    }
    const e = extent(o);
    if (Math.hypot(x, z) + e > ARENA.radius - 1.5) continue;
    if (clear.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + e)) continue;
    // At least ~1.6 m of walking room between pieces.
    if (out.some((p) => Math.hypot(x - p.x, z - p.z) < extent(p) + e + 1.6)) continue;
    out.push(o);
  }
  return out;
}

/** Point (x, z) in the box's local frame. */
function toLocal(o: Extract<Obstacle, { shape: 'box' }>, x: number, z: number) {
  const dx = x - o.x;
  const dz = z - o.z;
  const c = Math.cos(o.rot);
  const s = Math.sin(o.rot);
  return { lx: dx * c - dz * s, lz: dx * s + dz * c, c, s };
}

/** Is (x, z) over the obstacle's top (with `radius` of slack for standing on edges)? */
export function over(o: Obstacle, x: number, z: number, radius = 0): boolean {
  if (o.shape === 'cylinder') return Math.hypot(x - o.x, z - o.z) <= o.r + radius * 0.5;
  const { lx, lz } = toLocal(o, x, z);
  return Math.abs(lx) <= o.w / 2 + radius * 0.5 && Math.abs(lz) <= o.d / 2 + radius * 0.5;
}

/**
 * Height of the highest surface under (x, z) that a body with feet at `feetY` can stand on:
 * obstacle tops at or below feet + STEP_HEIGHT, else the island floor (0) — or null off the island.
 */
export function supportHeight(obstacles: Obstacle[], x: number, z: number, feetY: number, radius = 0.25, island = true): number | null {
  let best: number | null = island ? 0 : null;
  for (const o of obstacles) {
    if (o.h > feetY + STEP_HEIGHT) continue;
    if (!over(o, x, z, radius)) continue;
    if (best === null || o.h > best) best = o.h;
  }
  return best;
}

/**
 * Push a circle of `radius` at (x, z) out of every obstacle too tall to step onto from `feetY`.
 * Returns the corrected position (sliding along walls).
 */
export function pushOut(obstacles: Obstacle[], x: number, z: number, radius: number, feetY: number): { x: number; z: number } {
  let px = x;
  let pz = z;
  for (let pass = 0; pass < 2; pass++) {
    for (const o of obstacles) {
      if (o.h <= feetY + STEP_HEIGHT) continue;
      if (o.shape === 'cylinder') {
        const dx = px - o.x;
        const dz = pz - o.z;
        const d = Math.hypot(dx, dz);
        const min = o.r + radius;
        if (d < min) {
          const nx = d > 1e-6 ? dx / d : 1;
          const nz = d > 1e-6 ? dz / d : 0;
          px = o.x + nx * min;
          pz = o.z + nz * min;
        }
        continue;
      }
      const { lx, lz, c, s } = toLocal(o, px, pz);
      const hx = o.w / 2;
      const hz = o.d / 2;
      // Closest point of the rectangle to the circle centre.
      const cx = Math.max(-hx, Math.min(hx, lx));
      const cz = Math.max(-hz, Math.min(hz, lz));
      let ox = lx - cx;
      let oz = lz - cz;
      const d = Math.hypot(ox, oz);
      if (d >= radius) continue;
      let nlx: number;
      let nlz: number;
      if (d > 1e-6) {
        nlx = cx + (ox / d) * radius;
        nlz = cz + (oz / d) * radius;
      } else {
        // Centre inside the box: leave by the nearest face.
        const pxFace = hx - Math.abs(lx);
        const pzFace = hz - Math.abs(lz);
        if (pxFace < pzFace) {
          nlx = Math.sign(lx || 1) * (hx + radius);
          nlz = lz;
        } else {
          nlx = lx;
          nlz = Math.sign(lz || 1) * (hz + radius);
        }
        ox = oz = 0;
      }
      // Back to world: inverse of the rotation used in toLocal.
      px = o.x + nlx * c + nlz * s;
      pz = o.z - nlx * s + nlz * c;
    }
  }
  return { x: px, z: pz };
}
