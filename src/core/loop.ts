export interface FixedStepper {
  readonly dt: number;
  /** Feed elapsed wall-clock seconds; runs `step` zero or more times. Returns steps run. */
  advance(elapsed: number, step: () => void): number;
}

export function createFixedStepper(dt = 1 / 60, maxSteps = 5): FixedStepper {
  let acc = 0;
  return {
    dt,
    advance(elapsed, step) {
      acc += Math.min(Math.max(elapsed, 0), 0.25);
      let n = 0;
      while (acc >= dt && n < maxSteps) {
        step();
        acc -= dt;
        n++;
      }
      if (n === maxSteps) acc = 0;
      return n;
    },
  };
}
