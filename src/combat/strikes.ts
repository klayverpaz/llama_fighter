import type { Limb } from '../figure/skeleton';

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

export const NPC_MAX_HP = 50;

export const STRIKES: Record<StrikeName, StrikeDef> = {
  jab:       { name: 'jab',       key: 'KeyJ',  limb: 'handL', damage: 8,  impulse: 40,  startup: 0.08, active: 0.10, recovery: 0.15, direction: [0, 0.1, 1],      hitRadius: 0.22 },
  cross:     { name: 'cross',     key: 'KeyK',  limb: 'handR', damage: 14, impulse: 70,  startup: 0.12, active: 0.10, recovery: 0.22, direction: [0, 0.15, 1],     hitRadius: 0.22 },
  hookL:     { name: 'hookL',     key: 'KeyU',  limb: 'handL', damage: 18, impulse: 90,  startup: 0.16, active: 0.10, recovery: 0.26, direction: [-0.5, 0.35, 1],  hitRadius: 0.22 },
  hookR:     { name: 'hookR',     key: 'KeyI',  limb: 'handR', damage: 18, impulse: 90,  startup: 0.16, active: 0.10, recovery: 0.26, direction: [0.5, 0.35, 1],   hitRadius: 0.22 },
  lowKick:   { name: 'lowKick',   key: 'KeyN',  limb: 'footR', damage: 15, impulse: 60,  startup: 0.18, active: 0.12, recovery: 0.30, direction: [0.3, -0.2, 1],   hitRadius: 0.22 },
  frontKick: { name: 'frontKick', key: 'KeyM',  limb: 'footR', damage: 20, impulse: 110, startup: 0.20, active: 0.12, recovery: 0.32, direction: [0, 0.2, 1],      hitRadius: 0.22 },
  highKick:  { name: 'highKick',  key: 'Comma', limb: 'footR', damage: 30, impulse: 140, startup: 0.26, active: 0.12, recovery: 0.40, direction: [0.4, 0.5, 1],    hitRadius: 0.22 },
};

export const STRIKE_NAMES = Object.keys(STRIKES) as StrikeName[];

export const KEY_TO_STRIKE: Record<string, StrikeName> = Object.fromEntries(
  STRIKE_NAMES.map((n) => [STRIKES[n].key, n]),
) as Record<string, StrikeName>;

export function strikeDuration(def: StrikeDef): number {
  return def.startup + def.active + def.recovery;
}
