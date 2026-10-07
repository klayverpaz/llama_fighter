export interface Vec2 { x: number; z: number }

export type NpcMoveState = 'chase' | 'hold';

export const NPC_TUNING = {
  speed: 2.5,
  holdDistance: 1.0,
  resumeDistance: 1.1,
  separationRadius: 0.9,
  separationStrength: 2.0,
  ragdollMinSeconds: 4,
  ragdollMaxSeconds: 8,
  settleSpeed: 0.6,
  recoverSeconds: 0.8,
  flinchSeconds: 0.3,
  pushbackDistance: 0.3,
  pushbackSeconds: 0.2,
};

export interface SteerInput {
  self: Vec2;
  player: Vec2;
  /** Other standing NPCs. */
  others: Vec2[];
  state: NpcMoveState;
}

export interface SteerOutput {
  velocity: Vec2;
  yaw: number;
  state: NpcMoveState;
}

/** Heading from `from` to `to`, consistent with forward = (sin yaw, 0, cos yaw). */
export function yawToward(from: Vec2, to: Vec2): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

export function steer({ self, player, others, state }: SteerInput): SteerOutput {
  const dx = player.x - self.x;
  const dz = player.z - self.z;
  const dist = Math.hypot(dx, dz);

  let next = state;
  if (state === 'chase' && dist <= NPC_TUNING.holdDistance) next = 'hold';
  else if (state === 'hold' && dist >= NPC_TUNING.resumeDistance) next = 'chase';

  let vx = 0;
  let vz = 0;
  if (next === 'chase' && dist > 1e-6) {
    vx = (dx / dist) * NPC_TUNING.speed;
    vz = (dz / dist) * NPC_TUNING.speed;
  }
  for (const o of others) {
    const ox = self.x - o.x;
    const oz = self.z - o.z;
    const d = Math.hypot(ox, oz);
    if (d < NPC_TUNING.separationRadius && d > 1e-6) {
      const k = (1 - d / NPC_TUNING.separationRadius) * NPC_TUNING.separationStrength;
      vx += (ox / d) * k;
      vz += (oz / d) * k;
    }
  }
  return { velocity: { x: vx, z: vz }, yaw: yawToward(self, player), state: next };
}

/** Evenly spaced around the origin, radius cycling through three bands between minR and maxR. */
export function ringPositions(count: number, minR = 6, maxR = 10): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / Math.max(1, count)) * Math.PI * 2;
    const r = minR + ((maxR - minR) * (i % 3)) / 2;
    out.push({ x: Math.sin(angle) * r, z: Math.cos(angle) * r });
  }
  return out;
}

export function shouldRecover(ragdollSeconds: number, maxSpeed: number): boolean {
  if (ragdollSeconds < NPC_TUNING.ragdollMinSeconds) return false;
  if (ragdollSeconds >= NPC_TUNING.ragdollMaxSeconds) return true;
  return maxSpeed < NPC_TUNING.settleSpeed;
}
