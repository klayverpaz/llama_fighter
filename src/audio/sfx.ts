/** Synthesized sound effects (Web Audio, no asset files). Call `unlock()` from a user gesture first. */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      const comp = this.ctx.createDynamicsCompressor();
      this.slowFilter = this.ctx.createBiquadFilter();
      this.slowFilter.type = 'lowpass';
      this.slowFilter.frequency.value = 20000;
      this.master.connect(this.slowFilter).connect(comp).connect(this.ctx.destination);
      const len = Math.floor(this.ctx.sampleRate * 0.6);
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private slowFilter: BiquadFilterNode | null = null;

  /** Muffle everything while in slow motion. */
  setSlowMo(on: boolean): void {
    if (!this.ctx || !this.slowFilter) return;
    this.slowFilter.frequency.setTargetAtTime(on ? 900 : 20000, this.ctx.currentTime, 0.12);
  }

  private ready(): { ctx: AudioContext; out: GainNode; noise: AudioBuffer } | null {
    if (!this.ctx || !this.master || !this.noise || this.ctx.state !== 'running') return null;
    return { ctx: this.ctx, out: this.master, noise: this.noise };
  }

  private burst(opts: { duration: number; gain: number; type: BiquadFilterType; freq: number; freqEnd?: number; q?: number; delay?: number; rate?: number }): void {
    const r = this.ready();
    if (!r) return;
    const t = r.ctx.currentTime + (opts.delay ?? 0);
    const src = r.ctx.createBufferSource();
    src.buffer = r.noise;
    src.playbackRate.value = opts.rate ?? 1;
    const filter = r.ctx.createBiquadFilter();
    filter.type = opts.type;
    filter.frequency.setValueAtTime(opts.freq, t);
    if (opts.freqEnd) filter.frequency.exponentialRampToValueAtTime(opts.freqEnd, t + opts.duration);
    filter.Q.value = opts.q ?? 0.7;
    const g = r.ctx.createGain();
    g.gain.setValueAtTime(opts.gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.duration);
    src.connect(filter).connect(g).connect(r.out);
    src.start(t, Math.random() * 0.2, opts.duration + 0.05);
  }

  private tone(freq: number, freqEnd: number, duration: number, gain: number, type: OscillatorType = 'sine', delay = 0): void {
    const r = this.ready();
    if (!r) return;
    const t = r.ctx.currentTime + delay;
    const osc = r.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freqEnd, t + duration);
    const g = r.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g).connect(r.out);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  /** 7.62: sharp crack, body, and a low thump. */
  shot(): void {
    const rate = 0.9 + Math.random() * 0.2;
    this.burst({ duration: 0.05, gain: 1.2, type: 'highpass', freq: 2500, rate });
    this.burst({ duration: 0.22, gain: 1.0, type: 'lowpass', freq: 4200, freqEnd: 300, rate });
    this.tone(140, 45, 0.16, 0.9, 'sine');
  }

  /** 12 gauge: a deep boom with a long tail. */
  shotgun(): void {
    const rate = 0.85 + Math.random() * 0.1;
    this.burst({ duration: 0.07, gain: 1.4, type: 'highpass', freq: 1800, rate });
    this.burst({ duration: 0.45, gain: 1.3, type: 'lowpass', freq: 2600, freqEnd: 140, rate });
    this.tone(95, 32, 0.32, 1.1, 'sine');
  }

  /** Pump: "chk-chk". */
  pump(): void {
    this.burst({ duration: 0.05, gain: 0.8, type: 'bandpass', freq: 1500, q: 2.5 });
    this.burst({ duration: 0.06, gain: 0.9, type: 'bandpass', freq: 1100, q: 2.5, delay: 0.17 });
  }

  /** One shell pushed into the tube. */
  shell(): void {
    this.burst({ duration: 0.04, gain: 0.55, type: 'bandpass', freq: 2200, q: 3 });
  }

  rocketLaunch(): void {
    this.burst({ duration: 0.12, gain: 1.0, type: 'lowpass', freq: 1200, freqEnd: 300 });
    this.burst({ duration: 0.7, gain: 0.6, type: 'bandpass', freq: 600, freqEnd: 2400, q: 1.2, delay: 0.03 });
  }

  explosion(): void {
    this.burst({ duration: 1.3, gain: 1.6, type: 'lowpass', freq: 1800, freqEnd: 60, rate: 0.6 });
    this.burst({ duration: 0.2, gain: 1.2, type: 'highpass', freq: 900, rate: 0.7 });
    this.tone(70, 25, 0.9, 1.4, 'sine');
  }

  freezeZap(): void {
    this.tone(2400, 600, 0.22, 0.25, 'triangle');
    this.burst({ duration: 0.25, gain: 0.35, type: 'highpass', freq: 5000 });
  }

  shatter(): void {
    for (let i = 0; i < 5; i++) this.burst({ duration: 0.12, gain: 0.5, type: 'highpass', freq: 3500 + Math.random() * 3000, delay: i * 0.035 });
    this.tone(3200, 2200, 0.25, 0.2, 'sine');
  }

  tesla(): void {
    this.tone(90, 70, 0.35, 0.5, 'sawtooth');
    for (let i = 0; i < 6; i++) this.burst({ duration: 0.04, gain: 0.7, type: 'bandpass', freq: 2500 + Math.random() * 2500, q: 2, delay: i * 0.045 });
  }

  antigrav(): void {
    this.tone(180, 1400, 0.45, 0.35, 'sine');
    this.tone(360, 2800, 0.45, 0.15, 'triangle', 0.02);
  }

  llamaLaunch(): void {
    this.burst({ duration: 0.12, gain: 0.9, type: 'lowpass', freq: 700, freqEnd: 120 });
    this.tone(160, 60, 0.15, 0.7, 'sine');
    this.llama();
  }

  /** Cartoon "boing". */
  bonk(): void {
    this.tone(420, 140, 0.35, 0.5, 'sine');
    this.tone(630, 210, 0.3, 0.2, 'triangle', 0.02);
  }

  slowMoWhoosh(entering: boolean): void {
    this.tone(entering ? 600 : 120, entering ? 90 : 700, 0.6, 0.35, 'sine');
    this.burst({ duration: 0.6, gain: 0.3, type: 'bandpass', freq: entering ? 1500 : 300, freqEnd: entering ? 200 : 1600, q: 0.8 });
  }

  combo(level: number): void {
    const base = 520 + level * 80;
    this.tone(base, base * 1.5, 0.12, 0.3, 'square');
    this.tone(base * 1.5, base * 2, 0.16, 0.25, 'square', 0.12);
  }

  /** A low, wet zombie moan. */
  groan(): void {
    const f = 70 + Math.random() * 40;
    this.tone(f, f * 0.7, 1.1, 0.35, 'sawtooth');
    this.burst({ duration: 1.0, gain: 0.25, type: 'bandpass', freq: 450 + Math.random() * 250, freqEnd: 260, q: 5 });
  }

  /** Runner screech. */
  screech(): void {
    this.tone(900, 1500, 0.35, 0.18, 'sawtooth');
    this.burst({ duration: 0.4, gain: 0.25, type: 'bandpass', freq: 2200, q: 4 });
  }

  /** Brute / boss roar (bigger = deeper and longer). */
  roar(big = false): void {
    const f = big ? 48 : 62;
    this.tone(f * 1.4, f, big ? 1.8 : 1.1, big ? 0.7 : 0.5, 'sawtooth');
    this.tone(f * 2.1, f * 1.6, big ? 1.6 : 1.0, 0.25, 'square', 0.05);
    this.burst({ duration: big ? 1.6 : 1.0, gain: 0.45, type: 'lowpass', freq: 700, freqEnd: 150, rate: 0.7 });
  }

  /** Rotten llama: a wobbly, wrong-sounding "mwaa". */
  zombieLlama(): void {
    this.tone(260, 140, 0.5, 0.35, 'sawtooth');
    this.tone(150, 90, 0.6, 0.3, 'sawtooth', 0.35);
    this.burst({ duration: 0.8, gain: 0.2, type: 'bandpass', freq: 500, q: 6, delay: 0.1 });
  }

  /** Bombardeiro fuse. */
  fuse(): void {
    this.burst({ duration: 0.5, gain: 0.25, type: 'highpass', freq: 4000 });
    this.tone(1200, 1800, 0.08, 0.15, 'square');
  }

  /** Wet hit on flesh. */
  splat(): void {
    this.burst({ duration: 0.09, gain: 0.45, type: 'lowpass', freq: 1400, freqEnd: 300, rate: 0.8 });
  }

  /** A limb tearing off: crack + squelch. */
  dismember(big = false): void {
    this.burst({ duration: 0.05, gain: 0.9, type: 'highpass', freq: 2000 });
    this.burst({ duration: big ? 0.6 : 0.3, gain: 0.8, type: 'lowpass', freq: 900, freqEnd: 120, rate: 0.6, delay: 0.03 });
    this.tone(big ? 70 : 140, 40, 0.2, 0.4, 'sine', 0.02);
  }

  jump(): void {
    this.burst({ duration: 0.18, gain: 0.25, type: 'bandpass', freq: 500, freqEnd: 1400, q: 1 });
  }

  land(speed: number): void {
    const k = Math.min(1, speed / 10);
    this.burst({ duration: 0.12 + 0.1 * k, gain: 0.4 + 0.6 * k, type: 'lowpass', freq: 500, freqEnd: 80 });
    this.tone(90, 45, 0.15, 0.3 + 0.4 * k, 'sine');
  }

  /** Falling into the void: a long, fading "aaaaa" sliding down. */
  fall(): void {
    this.tone(620, 180, 2.4, 0.3, 'sawtooth');
    this.tone(930, 260, 2.4, 0.12, 'triangle');
    this.burst({ duration: 2.4, gain: 0.25, type: 'bandpass', freq: 900, freqEnd: 200, q: 3 });
  }

  hurt(): void {
    this.burst({ duration: 0.14, gain: 1.0, type: 'lowpass', freq: 600, freqEnd: 90 });
    this.tone(150, 55, 0.25, 0.8, 'square');
  }

  /** Ominous low chord at the start of a wave. */
  waveStart(): void {
    for (const [f, d] of [[55, 0], [65.4, 0.05], [82.4, 0.1], [98, 0.15]] as const) this.tone(f, f * 0.98, 2.6, 0.32, 'sawtooth', d);
    this.burst({ duration: 2.0, gain: 0.2, type: 'lowpass', freq: 300, freqEnd: 80 });
  }

  waveEnd(): void {
    [392, 523, 659, 784].forEach((f, i) => this.tone(f, f, 0.35, 0.25, 'triangle', i * 0.13));
  }

  powerUpDrop(): void {
    [880, 1320].forEach((f, i) => this.tone(f, f, 0.25, 0.18, 'sine', i * 0.08));
  }

  powerUp(kind: 'maxAmmo' | 'instaKill' | 'nuke'): void {
    if (kind === 'nuke') {
      this.explosion();
      this.tone(220, 40, 2.0, 0.6, 'sawtooth', 0.1);
      return;
    }
    const base = kind === 'maxAmmo' ? 523 : 392;
    [1, 1.25, 1.5, 2].forEach((m, i) => this.tone(base * m, base * m, 0.3, 0.25, 'square', i * 0.09));
  }

  /** Music-box arpeggio while the Mystery Box spins. */
  boxJingle(): void {
    const notes = [659, 784, 988, 1175, 988, 784, 659, 784, 988, 1319, 988, 784];
    notes.forEach((f, i) => this.tone(f, f, 0.22, 0.16, 'sine', i * 0.18));
  }

  boxResult(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, f, 0.4, 0.22, 'triangle', i * 0.07));
  }

  gameOver(): void {
    [392, 370, 349, 330].forEach((f, i) => this.tone(f, f * 0.98, 0.6, 0.3, 'sawtooth', i * 0.45));
  }

  dryFire(): void {
    this.burst({ duration: 0.03, gain: 0.5, type: 'bandpass', freq: 3200, q: 4 });
  }

  reloadStart(): void {
    this.burst({ duration: 0.05, gain: 0.6, type: 'bandpass', freq: 1800, q: 3, delay: 0.25 });
    this.burst({ duration: 0.12, gain: 0.25, type: 'lowpass', freq: 900, delay: 0.75 });
  }

  reloadEnd(): void {
    this.burst({ duration: 0.05, gain: 0.7, type: 'bandpass', freq: 1400, q: 3 });
    this.burst({ duration: 0.04, gain: 0.6, type: 'bandpass', freq: 2600, q: 3, delay: 0.12 });
  }

  swap(): void {
    this.burst({ duration: 0.18, gain: 0.25, type: 'bandpass', freq: 700, freqEnd: 1600, q: 1 });
  }

  /** A short nasal llama "mmwa". */
  llama(): void {
    this.tone(320, 520, 0.18, 0.35, 'sawtooth');
    this.tone(520, 300, 0.32, 0.3, 'sawtooth', 0.17);
    this.burst({ duration: 0.4, gain: 0.12, type: 'bandpass', freq: 900, q: 3, delay: 0.05 });
  }

  hitMarker(kill: boolean): void {
    this.tone(1900, 1700, 0.05, 0.25, 'triangle');
    if (kill) this.tone(1300, 900, 0.12, 0.3, 'triangle', 0.05);
  }

  punch(knockedOut: boolean): void {
    this.burst({ duration: 0.09, gain: 0.9, type: 'lowpass', freq: 900, freqEnd: 120 });
    this.tone(110, 50, 0.1, knockedOut ? 0.9 : 0.6, 'sine');
  }
}
