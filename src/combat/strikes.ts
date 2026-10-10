import type { Limb } from '../figure/skeleton';
import { TUNING } from '../tuning/tuning';

export type StrikeName = 'jab' | 'cross' | 'hookL' | 'hookR' | 'lowKick' | 'frontKick' | 'highKick';

export interface StrikeDef {
  name: StrikeName;
  /** KeyboardEvent.code */
  key: string;
  limb: Limb;
  damage: number;
  /** Impulse magnitude in N·s applied on KO. */
  impulse: number;
  startup: number;
  active: number;
  recovery: number;
  /** Direction in the attacker's local frame (x = left, y = up, z = forward); normalized at use. */
  direction: [number, number, number];
  /** Radius of the sphere swept at the hand/foot while active. */
  hitRadius: number;
}

/** Training-dummy HP (npcMaxHp). */
export const COMBAT = TUNING.combat;

/** Timing, damage and impulse come from tuning.json; key, limb and direction are fixed here. */
const strike = (name: StrikeName, key: string, limb: Limb, direction: [number, number, number]): StrikeDef =>
  Object.assign(TUNING.strikes[name], { name, key, limb, direction });

export const STRIKES: Record<StrikeName, StrikeDef> = {
  jab: strike('jab', 'KeyJ', 'handL', [0, 0.1, 1]),
  cross: strike('cross', 'KeyK', 'handR', [0, 0.15, 1]),
  hookL: strike('hookL', 'KeyU', 'handL', [-0.5, 0.35, 1]),
  hookR: strike('hookR', 'KeyI', 'handR', [0.5, 0.35, 1]),
  lowKick: strike('lowKick', 'KeyN', 'footR', [0.3, -0.2, 1]),
  frontKick: strike('frontKick', 'KeyM', 'footR', [0, 0.2, 1]),
  highKick: strike('highKick', 'Comma', 'footR', [0.4, 0.5, 1]),
};

export const STRIKE_NAMES = Object.keys(STRIKES) as StrikeName[];

export const KEY_TO_STRIKE: Record<string, StrikeName> = Object.fromEntries(
  STRIKE_NAMES.map((n) => [STRIKES[n].key, n]),
) as Record<string, StrikeName>;

export function strikeDuration(def: StrikeDef): number {
  return def.startup + def.active + def.recovery;
}
