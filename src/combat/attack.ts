import { STRIKES, strikeDuration, type StrikeName } from './strikes';

export type AttackPhase = 'idle' | 'startup' | 'active' | 'recovery';

export interface AttackState {
  phase: AttackPhase;
  strike: StrikeName | null;
  /** Seconds since the strike started. */
  t: number;
  /** Target ids already hit by this strike. */
  hit: ReadonlySet<string>;
}

export function createAttackState(): AttackState {
  return { phase: 'idle', strike: null, t: 0, hit: new Set() };
}

export function canAttack(s: AttackState): boolean {
  return s.phase === 'idle';
}

export function startAttack(s: AttackState, strike: StrikeName): AttackState {
  if (!canAttack(s)) return s;
  return { phase: 'startup', strike, t: 0, hit: new Set() };
}

export function tickAttack(s: AttackState, dt: number): AttackState {
  if (s.phase === 'idle' || s.strike === null) return s;
  const def = STRIKES[s.strike];
  const t = s.t + dt;
  if (t >= strikeDuration(def)) return createAttackState();
  const phase: AttackPhase = t < def.startup ? 'startup' : t < def.startup + def.active ? 'active' : 'recovery';
  return { ...s, phase, t };
}

export function recordHit(s: AttackState, targetId: string): AttackState {
  const hit = new Set(s.hit);
  hit.add(targetId);
  return { ...s, hit };
}
