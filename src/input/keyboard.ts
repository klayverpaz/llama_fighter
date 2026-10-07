export class Keyboard {
  private held = new Set<string>();
  private pressed: string[] = [];

  private onDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    this.held.add(e.code);
    this.pressed.push(e.code);
  };
  private onUp = (e: KeyboardEvent) => {
    this.held.delete(e.code);
  };
  private onBlur = () => this.clear();

  attach(): void {
    window.addEventListener('keydown', this.onDown);
    window.addEventListener('keyup', this.onUp);
    window.addEventListener('blur', this.onBlur);
  }

  detach(): void {
    window.removeEventListener('keydown', this.onDown);
    window.removeEventListener('keyup', this.onUp);
    window.removeEventListener('blur', this.onBlur);
  }

  isDown(code: string): boolean {
    return this.held.has(code);
  }

  /** Keys pressed since the last drain (edge-triggered). */
  drainPressed(): string[] {
    const out = this.pressed;
    this.pressed = [];
    return out;
  }

  clear(): void {
    this.held.clear();
    this.pressed = [];
  }
}
