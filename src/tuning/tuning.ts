import defaults from './tuning.json';

/**
 * Every balance number of the game, loaded from tuning.json (the file to edit, or to replace with a
 * dev-panel dump). Gameplay modules alias sections of TUNING (e.g. `POINTS = TUNING.points`) and read
 * them at use time, so overwriting values here in place changes the running game.
 */
export type Tuning = typeof defaults;

/** A tuning section: numbers, or nested groups of numbers (strikes.jab, rifle.damage…). */
export interface TuningGroup { [key: string]: number | TuningGroup }

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** The values from tuning.json, never mutated. */
export const DEFAULT_TUNING: Tuning = clone(defaults);

/** The live values the game reads. */
export const TUNING: Tuning = clone(defaults);

/**
 * Overwrite the live values in place with those of `values` (e.g. a parsed dump). Only keys that exist
 * in tuning.json with a finite number are taken; anything missing keeps the default.
 */
export function applyTuning(values: unknown, target: TuningGroup = TUNING as unknown as TuningGroup,
  base: TuningGroup = DEFAULT_TUNING as unknown as TuningGroup): void {
  const src = (values && typeof values === 'object' ? values : {}) as Record<string, unknown>;
  for (const key of Object.keys(base)) {
    const def = base[key];
    if (typeof def === 'number') {
      const v = src[key];
      target[key] = typeof v === 'number' && Number.isFinite(v) ? v : def;
    } else {
      applyTuning(src[key], target[key] as TuningGroup, def);
    }
  }
}

/**
 * Plain copy of the live values in the tuning.json shape. Extra fields that gameplay modules hang on
 * the live objects (labels, keys, colours) are left out.
 */
export function snapshotTuning(source: TuningGroup = TUNING as unknown as TuningGroup,
  base: TuningGroup = DEFAULT_TUNING as unknown as TuningGroup): Tuning {
  const out: TuningGroup = {};
  for (const key of Object.keys(base)) {
    const def = base[key];
    out[key] = typeof def === 'number' ? (source[key] as number) : snapshotTuning(source[key] as TuningGroup, def);
  }
  return out as unknown as Tuning;
}

/** Short explanations shown as tooltips in the dev panel (path → text). */
export const TUNING_NOTES: Record<string, string> = {
  'waves.maxAlive': 'Max zombies on the field at once; the rest wait their turn.',
  'waves.intermission': 'Pause between waves (seconds).',
  'waves.firstIntermission': 'Pause before wave 1 (seconds).',
  'zombies.baseHp': 'Zombie HP in wave 1 (×kind hpMul).',
  'zombies.hpPerWave': 'HP added every wave.',
  'zombies.speedLate': 'Speed right after midUntilWave, growing by speedPerLateWave up to speedMax.',
  'zombies.kindSpeedMax': 'Cap on speed after the kind multiplier.',
  'zombies.maxHit': 'No single hit on the player takes more than this.',
  'zombies.bossEvery': 'Boss wave every N waves.',
  'zombieKinds.boss.weight': 'The boss is placed by hand on boss waves (weight 0).',
  'health.hitGrace': 'Invulnerability after a hit (seconds).',
  'health.regenDelay': 'Seconds without a hit before regen starts.',
  'points.boxCost': 'Mystery Box price in wave 1.',
  'points.boxCostGrowth': 'The box price is multiplied by this every wave.',
  'powerups.dropChance': 'Chance per kill (0–1).',
  'powerups.lifetime': 'Seconds a dropped power-up stays on the ground.',
  'arena.startPoints': 'Points at the start of a zombie match (next match).',
  'combat.npcMaxHp': 'Training dummy HP (applies on spawn/recovery).',
  'rifle.spreadBase': 'Cone half-angle (rad) of the first shot.',
  'rifle.koImpulse': 'Impulse (N·s) of the knockout shot.',
  'rifle.ragdollImpulse': 'Impulse (N·s) of each shot into a body already down.',
  'shotgun.damage.head': 'Per pellet, before distance falloff.',
  'shotgun.falloffStart': 'Full damage up to here (m), fading to minFalloff at falloffEnd.',
  'special.blastDamage': 'RPG damage at the blast centre, fading to 0 at blastRadius.',
  'special.blastSpeed': 'Velocity kick (m/s) at the blast centre.',
  'special.floatGravity': 'Gravity multiplier while floating (negative = falls upward).',
  'player.aimTurnRate': 'Turn rate toward the auto-aim target while striking.',
  'npc.separationStrength': 'Max crowd push (m/s); keep above speed.',
  'npc.chaseCancelPush': 'Push (m/s) that fully cancels the chase.',
  'body.linearDamping': 'Ragdoll physics: applies to figures spawned after the change.',
};
