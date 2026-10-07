import { clamp } from '../core/math';

export const NPC_COUNT_MIN = 1;
export const NPC_COUNT_MAX = 20;
export const NPC_COUNT_DEFAULT = 5;

export function clampNpcCount(n: number): number {
  if (!Number.isFinite(n)) return NPC_COUNT_DEFAULT;
  return clamp(Math.floor(n), NPC_COUNT_MIN, NPC_COUNT_MAX);
}

export function parseNpcCount(search: string, fallback = NPC_COUNT_DEFAULT): number {
  const raw = new URLSearchParams(search).get('npcs');
  if (raw === null || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? clampNpcCount(n) : fallback;
}
