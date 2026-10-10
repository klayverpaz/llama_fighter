import { TUNING } from '../tuning/tuning';

/** Zombies-style wave rules (pure; the game asks it what to do each tick). Numbers: tuning.json. */
export const WAVES = TUNING.waves;

export function waveSize(wave: number): number {
  return Math.min(WAVES.maxPerWave, WAVES.perWave * Math.max(1, wave));
}

export interface ZombieStats {
  hp: number;
  speed: number;
  damage: number;
}

/** Tougher, faster, harder-hitting every wave: walkers, then joggers, then sprinters. */
export function zombieStats(wave: number): ZombieStats {
  const w = Math.max(1, wave);
  const z = TUNING.zombies;
  return {
    hp: Math.round(z.baseHp + z.hpPerWave * (w - 1)),
    speed: w <= z.earlyUntilWave ? z.speedEarly
      : w <= z.midUntilWave ? z.speedMid
      : Math.min(z.speedMax, z.speedLate + z.speedPerLateWave * (w - z.midUntilWave - 1)),
    damage: Math.min(z.damageMax, z.damageBase + z.damagePerWave * (w - 1)),
  };
}

export type WavePhase = 'intermission' | 'fighting';

export interface WaveTick {
  /** Zombies to spawn this tick. */
  spawn: number;
  /** A wave just started (its number). */
  started: number | null;
  /** A wave was just cleared (its number). */
  cleared: number | null;
}

export class WaveDirector {
  wave = 0;
  phase: WavePhase = 'intermission';
  /** Seconds left in the intermission. */
  timer = WAVES.firstIntermission;
  /** Zombies of the current wave not spawned yet. */
  pending = 0;
  /** Zombies of the current wave killed so far. */
  killed = 0;
  private spawnTimer = 0;

  /** Zombies of this wave still to deal with (alive + not yet spawned). */
  remaining(alive: number): number {
    return this.pending + alive;
  }

  update(dt: number, alive: number): WaveTick {
    const out: WaveTick = { spawn: 0, started: null, cleared: null };
    if (this.phase === 'intermission') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.wave++;
        this.phase = 'fighting';
        this.pending = waveSize(this.wave);
        this.killed = 0;
        this.spawnTimer = 0;
        out.started = this.wave;
      }
      return out;
    }
    this.spawnTimer -= dt;
    while (this.pending > 0 && this.spawnTimer <= 0 && alive + out.spawn < WAVES.maxAlive) {
      out.spawn++;
      this.pending--;
      this.spawnTimer += WAVES.spawnInterval;
    }
    if (this.spawnTimer < 0) this.spawnTimer = 0;
    if (this.pending === 0 && alive + out.spawn === 0) {
      out.cleared = this.wave;
      this.phase = 'intermission';
      this.timer = WAVES.intermission;
    }
    return out;
  }

  onKill(): void {
    this.killed++;
  }
}

/** Player health with Call-of-Duty style regeneration. */
export const HEALTH = TUNING.health;

export class PlayerHealth {
  hp = HEALTH.max;
  private sinceHit = Infinity;

  get dead(): boolean {
    return this.hp <= 0;
  }

  /** Apply a hit. Returns the damage actually taken (0 during the grace window or when dead). */
  damage(amount: number): number {
    if (this.dead || this.sinceHit < HEALTH.hitGrace) return 0;
    const taken = Math.min(this.hp, amount);
    this.hp -= taken;
    this.sinceHit = 0;
    return taken;
  }

  update(dt: number): void {
    if (this.dead) return;
    this.sinceHit += dt;
    if (this.sinceHit >= HEALTH.regenDelay) this.hp = Math.min(HEALTH.max, this.hp + HEALTH.regenRate * dt);
  }
}

/** Points, like the zombies mode: some for every hit, more for a kill. */
export const POINTS = TUNING.points;

/** Mystery Box price for a wave: boxCost in wave 1, ×boxCostGrowth each wave after, rounded to $10. */
export function boxCost(wave: number): number {
  const raw = POINTS.boxCost * POINTS.boxCostGrowth ** Math.max(0, wave - 1);
  return Math.round(raw / 10) * 10;
}

export type PowerUpKind = 'maxAmmo' | 'instaKill' | 'nuke';

export const POWERUPS = TUNING.powerups;

/** Maybe drop a power-up for a kill (rng() in [0, 1)). */
export function rollPowerUp(rng: () => number): PowerUpKind | null {
  if (rng() >= POWERUPS.dropChance) return null;
  const r = rng();
  return r < 0.45 ? 'maxAmmo' : r < 0.8 ? 'instaKill' : 'nuke';
}
