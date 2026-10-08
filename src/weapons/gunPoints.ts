import { AK_POINTS } from './akModel';
import { SHOTGUN_POINTS } from './shotgunModel';
import { SPECIAL_POINTS } from './specialModels';
import type { GunName, GunPoints } from './guns';

export const GUN_POINTS: Record<GunName, GunPoints> = { rifle: AK_POINTS, shotgun: SHOTGUN_POINTS, ...SPECIAL_POINTS };

/** Which shoulder each gun hangs over when slung on the back. */
export const HOLSTER_SIDE: Record<GunName, 1 | -1> = {
  rifle: 1, shotgun: -1, rpg: 1, freeze: -1, tesla: 1, antigrav: -1, llamaCannon: 1,
};
