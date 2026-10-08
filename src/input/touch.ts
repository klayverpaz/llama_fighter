import type { StrikeName } from '../combat/strikes';
import { joystickVector, STICK_RUN } from './touchMath';

/** One-shot actions from on-screen buttons. */
export type TouchWeapon = 'fists' | 'rifle' | 'shotgun' | 'rpg' | 'freeze' | 'tesla' | 'antigrav' | 'llamaCannon';
export type TouchAction = StrikeName | 'weapon' | 'reload' | 'mount' | 'slowmo' | 'use' | `pick:${TouchWeapon}`;

const WEAPON_PICKS: Array<[TouchWeapon, string]> = [
  ['fists', 'Mãos'], ['rifle', 'AK-47'], ['shotgun', 'Escopeta'], ['rpg', 'Bazuca'],
  ['freeze', 'Congelante'], ['tesla', 'Tesla'], ['antigrav', 'Antigrav.'], ['llamaCannon', 'Lança-<br>Lhamas'],
];

/** True on phones and tablets, or when forced with ?touch=1 (testing on desktop). */
export function isTouchDevice(): boolean {
  if (new URLSearchParams(window.location.search).get('touch') === '1') return true;
  return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0 && !window.matchMedia('(pointer: fine)').matches;
}

const CSS = `
.kb-touch { position: absolute; inset: 0; z-index: 5; touch-action: none; user-select: none; -webkit-user-select: none;
  -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; }
.kb-touch[hidden] { display: none; }
.kb-stick-base { position: absolute; width: 120px; height: 120px; margin: -60px 0 0 -60px; border-radius: 50%;
  border: 2px solid rgba(43, 38, 32, 0.55); background: rgba(255, 253, 247, 0.25); pointer-events: none; }
.kb-stick-knob { position: absolute; width: 54px; height: 54px; margin: -27px 0 0 -27px; border-radius: 50%;
  background: rgba(255, 253, 247, 0.85); border: 2px solid #2b2620; pointer-events: none; }
.kb-stick-base[hidden], .kb-stick-knob[hidden] { display: none; }
.kb-stick-hint { position: absolute; left: 7%; bottom: 14%; width: 120px; height: 120px; border-radius: 50%;
  border: 2px dashed rgba(43, 38, 32, 0.3); pointer-events: none; }
.kb-btns { position: absolute; right: max(14px, env(safe-area-inset-right)); bottom: max(14px, env(safe-area-inset-bottom));
  width: 270px; height: 250px; pointer-events: none; }
.kb-btn { position: absolute; border-radius: 50%; border: 2px solid #2b2620; background: rgba(255, 253, 247, 0.82);
  color: #2b2620; font: 700 12px ui-sans-serif, system-ui, sans-serif; display: flex; align-items: center; justify-content: center;
  text-align: center; line-height: 1.05; pointer-events: auto; touch-action: none; box-shadow: 2px 2px 0 rgba(43, 38, 32, 0.6); }
.kb-btn[hidden] { display: none; }
.kb-btn.down { transform: translate(2px, 2px); box-shadow: none; background: #ffe7a8; }
.kb-btn.fire { width: 92px; height: 92px; right: 6px; bottom: 6px; background: rgba(224, 65, 47, 0.85); color: #fffdf7; font-size: 15px; }
.kb-btn.fire.down { background: #b8301f; }
.kb-btn.aim { width: 64px; height: 64px; right: 112px; bottom: 16px; }
.kb-btn.aim.on { background: #2a6fdb; color: #fffdf7; }
.kb-btn.reload { width: 56px; height: 56px; right: 24px; bottom: 112px; }
.kb-btn.weapon { width: 56px; height: 56px; right: 196px; bottom: 182px; font-size: 13px; }
.kb-btn.mount { width: 56px; height: 56px; right: 196px; bottom: 246px; font-size: 12px; background: rgba(238, 226, 200, 0.92); }
.kb-btn.mount.on { background: #c8372d; color: #fffdf7; }
.kb-btn.strike { width: 58px; height: 58px; }
.kb-pause { position: absolute; right: max(14px, env(safe-area-inset-right)); top: max(14px, env(safe-area-inset-top));
  width: 44px; height: 44px; border-radius: 10px; font-size: 16px; }
.kb-rotate { position: absolute; left: 50%; top: 40%; transform: translate(-50%, -50%); background: rgba(255, 253, 247, 0.9);
  border: 1px solid #2b2620; border-radius: 8px; padding: 8px 12px; font: 600 14px ui-sans-serif, system-ui, sans-serif;
  color: #2b2620; pointer-events: none; display: none; }
@media (orientation: portrait) { .kb-rotate { display: block; } }
.kb-picker { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  background: rgba(43, 38, 32, 0.35); pointer-events: auto; }
.kb-picker[hidden] { display: none; }
.kb-picker-grid { display: grid; grid-template-columns: repeat(4, 84px); gap: 10px; }
.kb-picker .kb-btn { position: relative; width: 84px; height: 64px; border-radius: 12px; font-size: 13px; }
.kb-picker .kb-btn.current { background: #2a6fdb; color: #fffdf7; }
.kb-slowmo { position: absolute; right: calc(max(14px, env(safe-area-inset-right)) + 54px); top: max(14px, env(safe-area-inset-top));
  width: 44px; height: 44px; border-radius: 10px; font-size: 18px; }
.kb-slowmo.on { background: #2a6fdb; color: #fffdf7; }
.kb-btn.use { width: 72px; height: 56px; border-radius: 12px; right: 112px; bottom: 112px; background: #e8b923; font-size: 14px; }
body.kb-touch-mode .kb-hud { display: none !important; }
body.kb-touch-mode .kb-ammo { bottom: auto; top: max(68px, env(safe-area-inset-top)); right: max(14px, env(safe-area-inset-right)); }
body.kb-touch-mode .kb-hint { bottom: auto; top: max(14px, env(safe-area-inset-top)); }
`;

/** Strike buttons in fists mode, positioned inside the button cluster (right/bottom offsets in px). */
const STRIKE_LAYOUT: Array<[StrikeName, string, number, number]> = [
  ['jab', 'Jab', 150, 8],
  ['cross', 'Direto', 80, 8],
  ['hookL', 'Cruz.<br>esq', 186, 72],
  ['hookR', 'Cruz.<br>dir', 116, 72],
  ['lowKick', 'Low<br>kick', 10, 8],
  ['frontKick', 'Chute<br>frontal', 46, 72],
  ['highKick', 'High<br>kick', 10, 136],
];

const LOOK_GAIN = 1.6;

/** Keep receiving a finger's moves even when it slides off the element; never let a capture failure drop the input. */
function capture(el: HTMLElement, pointerId: number): void {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    /* pointer already gone or not capturable */
  }
}

export class TouchControls {
  /** Stick deflection (y = forward). */
  stick = { x: 0, y: 0 };
  /** Stick pushed to the rim. */
  get run(): boolean {
    return Math.hypot(this.stick.x, this.stick.y) >= STICK_RUN;
  }
  fire = false;
  /** Aim is a toggle on touch: tap the AIM button to shoulder the rifle, tap again to lower it. */
  aim = false;

  private readonly layer: HTMLDivElement;
  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private readonly stickHint: HTMLDivElement;
  private readonly strikeButtons: HTMLElement[] = [];
  private readonly rifleButtons: HTMLElement[] = [];
  private readonly aimButton: HTMLElement;
  private readonly weaponButton: HTMLElement;
  private readonly mountButton: HTMLElement;
  private readonly slowmoButton: HTMLElement;
  private readonly useButton: HTMLElement;
  private readonly picker: HTMLDivElement;
  private readonly pickButtons: HTMLElement[] = [];
  private actions: TouchAction[] = [];
  private lookX = 0;
  private lookY = 0;
  private stickPointer: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  /** Pointers that rotate the camera (free right-side drags and the fire button), with their last position. */
  private readonly lookPointers = new Map<number, { x: number; y: number }>();

  constructor(root: HTMLElement, onPause: () => void) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    document.body.classList.add('kb-touch-mode');

    this.layer = document.createElement('div');
    this.layer.className = 'kb-touch';
    this.layer.hidden = true;

    this.stickHint = document.createElement('div');
    this.stickHint.className = 'kb-stick-hint';
    this.base = document.createElement('div');
    this.base.className = 'kb-stick-base';
    this.base.hidden = true;
    this.knob = document.createElement('div');
    this.knob.className = 'kb-stick-knob';
    this.knob.hidden = true;

    const cluster = document.createElement('div');
    cluster.className = 'kb-btns';

    for (const [strike, label, right, bottom] of STRIKE_LAYOUT) {
      const b = this.button(cluster, 'strike', label, { onDown: () => this.actions.push(strike) });
      b.style.right = `${right}px`;
      b.style.bottom = `${bottom}px`;
      this.strikeButtons.push(b);
    }
    const fire = this.button(cluster, 'fire', 'FOGO', {
      onDown: (e) => { this.fire = true; this.lookPointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); },
      onMove: (e) => this.trackLook(e),
      onUp: (e) => { this.fire = false; this.lookPointers.delete(e.pointerId); },
    });
    this.aimButton = this.button(cluster, 'aim', 'MIRA', { onDown: () => this.setAim(!this.aim) });
    const reload = this.button(cluster, 'reload', 'Rec.', { onDown: () => this.actions.push('reload') });
    this.rifleButtons.push(fire, this.aimButton, reload);
    this.weaponButton = this.button(cluster, 'weapon', 'Armas', { onDown: () => { this.picker.hidden = false; } });
    this.mountButton = this.button(cluster, 'mount', 'Lhama', { onDown: () => this.actions.push('mount') });
    this.useButton = this.button(cluster, 'use', 'Usar', { onDown: () => this.actions.push('use') });
    this.useButton.hidden = true;

    const pause = this.button(this.layer, 'pause kb-pause', 'II', { onDown: () => onPause() });
    pause.style.borderRadius = '10px';
    this.slowmoButton = this.button(this.layer, 'kb-slowmo', '⏱', { onDown: () => this.actions.push('slowmo') });
    this.slowmoButton.style.borderRadius = '10px';

    // Weapon picker: tapping the weapon button opens a grid of every weapon.
    this.picker = document.createElement('div');
    this.picker.className = 'kb-picker';
    this.picker.hidden = true;
    const grid = document.createElement('div');
    grid.className = 'kb-picker-grid';
    this.picker.appendChild(grid);
    for (const [w, label] of WEAPON_PICKS) {
      const b = this.button(grid, '', label, {
        onDown: () => {
          this.actions.push(`pick:${w}`);
          this.picker.hidden = true;
        },
      });
      b.dataset.weapon = w;
      this.pickButtons.push(b);
    }
    this.picker.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.picker.hidden = true; });
    this.layer.appendChild(this.picker);

    const rotate = document.createElement('div');
    rotate.className = 'kb-rotate';
    rotate.textContent = 'Gire o celular para jogar deitado';

    this.layer.append(this.stickHint, this.base, this.knob, cluster, rotate);
    root.appendChild(this.layer);

    this.layer.addEventListener('pointerdown', this.onDown);
    this.layer.addEventListener('pointermove', this.onMove);
    this.layer.addEventListener('pointerup', this.onUp);
    this.layer.addEventListener('pointercancel', this.onUp);
    // Block page zoom / scroll gestures while playing.
    this.layer.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    this.layer.addEventListener('contextmenu', (e) => e.preventDefault());
    this.setWeapon('fists', false);
  }

  show(): void { this.layer.hidden = false; }
  hide(): void {
    this.layer.hidden = true;
    this.picker.hidden = true;
    this.release();
  }

  /** Swap the button set: strikes with empty hands, fire/aim/reload with the rifle; on the llama only the rifle. */
  /** Show the Use button (next to the Mystery Box). */
  setUse(visible: boolean): void {
    if (this.useButton.hidden === !visible) return;
    this.useButton.hidden = !visible;
  }

  /** Limit the weapon picker to the weapons the player owns (wave mode). */
  setOwned(owned: ReadonlySet<string>): void {
    for (const b of this.pickButtons) b.dataset.locked = owned.has(b.dataset.weapon!) ? '' : '1';
  }

  setSlowMo(on: boolean): void {
    this.slowmoButton.classList.toggle('on', on);
  }

  setWeapon(weapon: TouchWeapon, mounted: boolean): void {
    for (const b of this.strikeButtons) b.hidden = weapon !== 'fists' || mounted;
    for (const b of this.rifleButtons) b.hidden = weapon === 'fists';
    this.weaponButton.innerHTML = 'Armas';
    for (const b of this.pickButtons) {
      b.classList.toggle('current', b.dataset.weapon === weapon);
      b.hidden = (mounted && b.dataset.weapon === 'fists') || b.dataset.locked === '1';
    }
    this.mountButton.innerHTML = mounted ? 'Descer' : 'Lhama';
    this.mountButton.classList.toggle('on', mounted);
    if (weapon === 'fists') {
      this.fire = false;
      this.setAim(false);
    }
  }

  setAim(on: boolean): void {
    this.aim = on;
    this.aimButton.classList.toggle('on', on);
  }

  consumeActions(): TouchAction[] {
    const a = this.actions;
    this.actions = [];
    return a;
  }

  /** Camera drag since the last call, in mouse-equivalent pixels. */
  consumeLook(): { dx: number; dy: number } {
    const out = { dx: this.lookX * LOOK_GAIN, dy: this.lookY * LOOK_GAIN };
    this.lookX = 0;
    this.lookY = 0;
    return out;
  }

  /** Drop every held finger (pause, restart, app switch). */
  release(): void {
    this.stickPointer = null;
    this.stick = { x: 0, y: 0 };
    this.base.hidden = true;
    this.knob.hidden = true;
    this.stickHint.hidden = false;
    this.lookPointers.clear();
    this.fire = false;
    this.actions = [];
    this.layer.querySelectorAll('.kb-btn.down').forEach((b) => b.classList.remove('down'));
  }

  private button(
    parent: HTMLElement,
    cls: string,
    label: string,
    h: { onDown: (e: PointerEvent) => void; onMove?: (e: PointerEvent) => void; onUp?: (e: PointerEvent) => void },
  ): HTMLElement {
    const b = document.createElement('div');
    b.className = `kb-btn ${cls}`;
    b.innerHTML = label;
    b.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      capture(b, e.pointerId);
      b.classList.add('down');
      h.onDown(e);
    });
    b.addEventListener('pointermove', (e) => { e.stopPropagation(); h.onMove?.(e); });
    const up = (e: PointerEvent) => {
      e.stopPropagation();
      b.classList.remove('down');
      h.onUp?.(e);
    };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    parent.appendChild(b);
    return b;
  }

  private trackLook(e: PointerEvent): void {
    const last = this.lookPointers.get(e.pointerId);
    if (!last) return;
    this.lookX += e.clientX - last.x;
    this.lookY += e.clientY - last.y;
    last.x = e.clientX;
    last.y = e.clientY;
  }

  private onDown = (e: PointerEvent) => {
    e.preventDefault();
    capture(this.layer, e.pointerId);
    const leftSide = e.clientX < window.innerWidth * 0.42;
    if (leftSide && this.stickPointer === null) {
      this.stickPointer = e.pointerId;
      this.stickOrigin = { x: e.clientX, y: e.clientY };
      this.place(this.base, e.clientX, e.clientY);
      this.place(this.knob, e.clientX, e.clientY);
      this.base.hidden = false;
      this.knob.hidden = false;
      this.stickHint.hidden = true;
      return;
    }
    this.lookPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };

  private onMove = (e: PointerEvent) => {
    if (e.pointerId === this.stickPointer) {
      const v = joystickVector(e.clientX - this.stickOrigin.x, e.clientY - this.stickOrigin.y, 60);
      this.stick = { x: v.x, y: v.y };
      this.place(this.knob, this.stickOrigin.x + v.x * 60, this.stickOrigin.y - v.y * 60);
      return;
    }
    this.trackLook(e);
  };

  private onUp = (e: PointerEvent) => {
    if (e.pointerId === this.stickPointer) {
      this.stickPointer = null;
      this.stick = { x: 0, y: 0 };
      this.base.hidden = true;
      this.knob.hidden = true;
      this.stickHint.hidden = false;
      return;
    }
    this.lookPointers.delete(e.pointerId);
  };

  private place(el: HTMLElement, x: number, y: number): void {
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }
}
