export class MouseLook {
  locked = false;
  /** Left / right button held while the pointer is locked. */
  left = false;
  right = false;
  onLockChange?: (locked: boolean) => void;
  private dx = 0;
  private dy = 0;

  constructor(private readonly element: HTMLElement) {}

  private onMove = (e: MouseEvent) => {
    if (!this.locked) return;
    this.dx += e.movementX;
    this.dy += e.movementY;
  };
  private onLock = () => {
    this.locked = document.pointerLockElement === this.element;
    this.dx = 0;
    this.dy = 0;
    this.left = false;
    this.right = false;
    this.onLockChange?.(this.locked);
  };
  private onDown = (e: MouseEvent) => {
    if (!this.locked) return;
    if (e.button === 0) this.left = true;
    if (e.button === 2) this.right = true;
  };
  private onUp = (e: MouseEvent) => {
    if (e.button === 0) this.left = false;
    if (e.button === 2) this.right = false;
  };
  private onContextMenu = (e: Event) => e.preventDefault();
  private wheel = 0;
  private onWheel = (e: WheelEvent) => {
    if (!this.locked) return;
    this.wheel += Math.sign(e.deltaY);
  };

  /** Wheel notches since the last call (positive = scrolled down). */
  consumeWheel(): number {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  attach(): void {
    document.addEventListener('mousemove', this.onMove);
    document.addEventListener('pointerlockchange', this.onLock);
    document.addEventListener('mousedown', this.onDown);
    document.addEventListener('mouseup', this.onUp);
    this.element.addEventListener('contextmenu', this.onContextMenu);
    document.addEventListener('wheel', this.onWheel, { passive: true });
  }

  detach(): void {
    document.removeEventListener('mousemove', this.onMove);
    document.removeEventListener('pointerlockchange', this.onLock);
    document.removeEventListener('mousedown', this.onDown);
    document.removeEventListener('mouseup', this.onUp);
    this.element.removeEventListener('contextmenu', this.onContextMenu);
  }

  requestLock(): void {
    if (this.locked) return;
    // requestPointerLock may return undefined (older browsers) or reject (denied, Esc too fast).
    Promise.resolve(this.element.requestPointerLock()).catch(() => {
      this.locked = false;
      this.onLockChange?.(false);
    });
  }

  /** Accumulated movement since the last call. */
  consume(): { dx: number; dy: number } {
    const out = { dx: this.dx, dy: this.dy };
    this.dx = 0;
    this.dy = 0;
    return out;
  }
}
