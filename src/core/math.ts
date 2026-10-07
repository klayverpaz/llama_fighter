export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Wrap to (-pi, pi]. */
export function wrapAngle(a: number): number {
  let r = a % (2 * Math.PI);
  if (r <= -Math.PI) r += 2 * Math.PI;
  if (r > Math.PI) r -= 2 * Math.PI;
  return r;
}

export function lerpAngle(a: number, b: number, t: number): number {
  return a + wrapAngle(b - a) * clamp(t, 0, 1);
}
