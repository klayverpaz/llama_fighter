export class MouseLook {
  locked = false;
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
    this.onLockChange?.(this.locked);
  };

  attach(): void {
    document.addEventListener('mousemove', this.onMove);
    document.addEventListener('pointerlockchange', this.onLock);
  }

  detach(): void {
    document.removeEventListener('mousemove', this.onMove);
    document.removeEventListener('pointerlockchange', this.onLock);
  }

  requestLock(): void {
    if (!this.locked) void this.element.requestPointerLock();
  }

  /** Accumulated movement since the last call. */
  consume(): { dx: number; dy: number } {
    const out = { dx: this.dx, dy: this.dy };
    this.dx = 0;
    this.dy = 0;
    return out;
  }
}
