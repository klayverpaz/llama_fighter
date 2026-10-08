/** Zombies-style wave rules (pure; the game asks it what to do each tick). */
export const WAVES = {
  perWave: 5,
  maxPerWave: 40,
  /** At most this many zombies on the field at once; the rest wait their turn. */
  maxAlive: 24,
  spawnInterval: 0.55,
  /** Pause between waves (and before the first). */
  intermission: 7,
  firstIntermission: 3,
};

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
  return {
    hp: Math.round(50 + 12 * (w - 1)),
    speed: w <= 2 ? 1.5 : w <= 5 ? 2.4 : Math.min(4.2, 3.2 + 0.15 * (w - 6)),
    damage: Math.min(45, 20 + 3 * (w - 1)),
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
export const HEALTH = {
  max: 100,
  regenDelay: 3.5,
  regenRate: 30,
  /** Brief invulnerability after a hit so a crowd can't shred you in one frame. */
  hitGrace: 0.35,
};

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
export const POINTS = {
  hit: 10,
  kill: 60,
  nuke: 400,
  boxCost: 950,
};

export type PowerUpKind = 'maxAmmo' | 'instaKill' | 'nuke';

export const POWERUPS = {
  dropChance: 0.06,
  /** Seconds a dropped power-up waits on the ground before vanishing. */
  lifetime: 25,
  pickupRadius: 1.4,
  instaKillSeconds: 15,
};

/** Maybe drop a power-up for a kill (rng() in [0, 1)). */
export function rollPowerUp(rng: () => number): PowerUpKind | null {
  if (rng() >= POWERUPS.dropChance) return null;
  const r = rng();
  return r < 0.45 ? 'maxAmmo' : r < 0.8 ? 'instaKill' : 'nuke';
}
