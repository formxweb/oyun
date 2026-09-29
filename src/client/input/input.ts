import { Btn } from '../../core/input';

export type Action = 'forward' | 'back' | 'left' | 'right' | 'jump' | 'sprint' | 'crouch' | 'interact' | 'recall' | 'pause' | 'journal';
export const ACTIONS: Action[] = ['forward', 'back', 'left', 'right', 'jump', 'sprint', 'crouch', 'interact', 'recall', 'pause', 'journal'];

export interface Bindings {
  keys: Record<Action, string[]>;
  pad: Record<Action, number[]>;
}

export const DEFAULT_BINDINGS: Bindings = {
  keys: {
    forward: ['KeyW', 'ArrowUp'],
    back: ['KeyS', 'ArrowDown'],
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    jump: ['Space'],
    sprint: ['ShiftLeft', 'ShiftRight'],
    crouch: ['ControlLeft', 'KeyC'],
    interact: ['KeyE', 'KeyF'],
    recall: ['KeyR'],
    pause: ['Escape', 'KeyP'],
    journal: ['Tab', 'KeyJ'],
  },
  pad: {
    forward: [12],
    back: [13],
    left: [14],
    right: [15],
    jump: [0],
    sprint: [10, 7],
    crouch: [1],
    interact: [2],
    recall: [3],
    pause: [9],
    journal: [8],
  },
};

export type Device = 'kbm' | 'pad' | 'touch';

export interface InputSettings {
  sprintMode: 'hold' | 'toggle' | 'auto';
  padDeadzone: number;
  padLookSpeed: number;
  vibration: boolean;
}

/** Virtual controls feed into the same state (see touch.ts). */
export interface VirtualState {
  mx: number;
  mz: number;
  lookDX: number;
  lookDY: number;
  held: Set<Action>;
  pressed: Set<Action>;
}

/**
 * Unifies keyboard/mouse, gamepad and touch into movement axes, buttons and look deltas.
 * Presses are latched so a tap shorter than a frame is never lost.
 */
export class InputManager {
  bindings: Bindings = structuredClone(DEFAULT_BINDINGS);
  settings: InputSettings = { sprintMode: 'hold', padDeadzone: 0.18, padLookSpeed: 3.2, vibration: true };
  device: Device = 'kbm';
  private keys = new Set<string>();
  private latched = new Set<Action>();
  private mouseDX = 0;
  private mouseDY = 0;
  private padPrev: boolean[] = [];
  private padIndex = -1;
  private sprintToggle = false;
  readonly virtual: VirtualState = { mx: 0, mz: 0, lookDX: 0, lookDY: 0, held: new Set(), pressed: new Set() };
  pointerLocked = false;
  onPause: (() => void) | null = null;
  onJournal: (() => void) | null = null;
  onAnyInput: ((d: Device) => void) | null = null;
  /** When rebinding, the next key/button is captured instead of acting. */
  capture: ((code: string | number) => void) | null = null;
  enabled = true;

  constructor(private readonly el: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', () => this.keys.clear());
    el.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mousemove', this.onDocMouseMove);
    el.addEventListener('mousedown', this.onMouseDown);
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === el;
    });
    window.addEventListener('gamepadconnected', (e) => {
      this.padIndex = (e as GamepadEvent).gamepad.index;
    });
  }

  private actionsForKey(code: string): Action[] {
    const out: Action[] = [];
    for (const a of ACTIONS) if (this.bindings.keys[a].includes(code)) out.push(a);
    return out;
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.capture) {
      e.preventDefault();
      const c = this.capture;
      this.capture = null;
      c(e.code);
      return;
    }
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.repeat) return;
    this.setDevice('kbm');
    this.keys.add(e.code);
    for (const a of this.actionsForKey(e.code)) {
      this.latched.add(a);
      if (a === 'pause') this.onPause?.();
      if (a === 'journal') this.onJournal?.();
      if (a === 'sprint' && this.settings.sprintMode === 'toggle') this.sprintToggle = !this.sprintToggle;
    }
    if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code) && this.enabled) e.preventDefault();
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.pointerLocked) return;
    this.mouseDX += e.movementX;
    this.mouseDY += e.movementY;
  };
  private onDocMouseMove = (e: MouseEvent): void => {
    if (this.pointerLocked && e.target !== this.el) {
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    }
  };

  private onMouseDown = (): void => {
    this.setDevice('kbm');
    if (!this.pointerLocked && this.enabled && this.device === 'kbm') {
      this.el.requestPointerLock?.();
    }
  };

  setDevice(d: Device): void {
    if (this.device !== d) {
      this.device = d;
      this.onAnyInput?.(d);
    }
  }

  private held(a: Action): boolean {
    for (const k of this.bindings.keys[a]) if (this.keys.has(k)) return true;
    if (this.virtual.held.has(a)) return true;
    return this.padHeld(a);
  }

  private padState: Gamepad | null = null;
  private padHeld(a: Action): boolean {
    const gp = this.padState;
    if (!gp) return false;
    for (const b of this.bindings.pad[a]) if (gp.buttons[b]?.pressed) return true;
    return false;
  }

  /** Poll gamepads. Call once per frame before sampling. */
  pollPad(): void {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp: Gamepad | null = null;
    if (this.padIndex >= 0) gp = pads[this.padIndex] ?? null;
    if (!gp) for (const p of pads) if (p) gp = p;
    this.padState = gp;
    if (!gp) return;
    const pressedNow = gp.buttons.map((b) => b.pressed);
    let any = false;
    for (let i = 0; i < pressedNow.length; i++) {
      if (pressedNow[i] && !this.padPrev[i]) {
        any = true;
        if (this.capture) {
          const c = this.capture;
          this.capture = null;
          c(i);
          this.padPrev = pressedNow;
          return;
        }
        for (const a of ACTIONS) {
          if (this.bindings.pad[a].includes(i)) {
            this.latched.add(a);
            if (a === 'pause') this.onPause?.();
            if (a === 'journal') this.onJournal?.();
            if (a === 'sprint' && this.settings.sprintMode === 'toggle') this.sprintToggle = !this.sprintToggle;
          }
        }
      }
    }
    const ax = gp.axes;
    if (Math.abs(ax[0] ?? 0) > 0.3 || Math.abs(ax[1] ?? 0) > 0.3 || Math.abs(ax[2] ?? 0) > 0.3 || Math.abs(ax[3] ?? 0) > 0.3) any = true;
    if (any) this.setDevice('pad');
    this.padPrev = pressedNow;
  }

  private dz(v: number): number {
    const d = this.settings.padDeadzone;
    const a = Math.abs(v);
    if (a < d) return 0;
    return Math.sign(v) * Math.min(1, (a - d) / (1 - d));
  }

  /** Movement and buttons for the next simulation tick(s). */
  sample(): { mx: number; mz: number; btn: number } {
    let mx = 0;
    let mz = 0;
    if (this.held('forward')) mz += 1;
    if (this.held('back')) mz -= 1;
    if (this.held('right')) mx += 1;
    if (this.held('left')) mx -= 1;
    const gp = this.padState;
    if (gp) {
      const x = this.dz(gp.axes[0] ?? 0);
      const y = this.dz(gp.axes[1] ?? 0);
      if (x !== 0 || y !== 0) {
        mx = x;
        mz = -y;
      }
    }
    if (this.virtual.mx !== 0 || this.virtual.mz !== 0) {
      mx = this.virtual.mx;
      mz = this.virtual.mz;
    }
    const mag = Math.hypot(mx, mz);
    if (mag > 1) {
      mx /= mag;
      mz /= mag;
    }
    let btn = 0;
    const on = (a: Action) => this.held(a) || this.latched.has(a) || this.virtual.pressed.has(a);
    if (on('jump')) btn |= Btn.Jump;
    if (on('crouch')) btn |= Btn.Crouch;
    if (on('interact')) btn |= Btn.Interact;
    if (on('recall')) btn |= Btn.Recall;
    let sprint = false;
    if (this.settings.sprintMode === 'hold') sprint = this.held('sprint');
    else if (this.settings.sprintMode === 'toggle') sprint = this.sprintToggle;
    else sprint = true;
    // Analogue sticks: pushing fully sprints (unless the player prefers explicit sprint).
    if (this.device !== 'kbm' && Math.hypot(mx, mz) > 0.93 && this.settings.sprintMode !== 'toggle') sprint = true;
    if (this.virtual.held.has('sprint')) sprint = true;
    if (sprint) btn |= Btn.Sprint;
    if (Math.hypot(mx, mz) < 0.1 && this.settings.sprintMode === 'toggle') this.sprintToggle = false;
    return { mx, mz, btn };
  }

  /** Clear latched presses once consumed by a simulation tick. */
  consumeLatches(): void {
    this.latched.clear();
    this.virtual.pressed.clear();
  }

  /** Look delta in radians-ish units since last call. */
  lookDelta(dt: number): { dx: number; dy: number } {
    let dx = this.mouseDX * 0.0022;
    let dy = this.mouseDY * 0.0022;
    this.mouseDX = 0;
    this.mouseDY = 0;
    const gp = this.padState;
    if (gp) {
      const rx = this.dz(gp.axes[2] ?? 0);
      const ry = this.dz(gp.axes[3] ?? 0);
      // response curve for fine aim
      dx += Math.sign(rx) * rx * rx * this.settings.padLookSpeed * dt;
      dy += Math.sign(ry) * ry * ry * this.settings.padLookSpeed * 0.75 * dt;
    }
    dx += this.virtual.lookDX;
    dy += this.virtual.lookDY;
    this.virtual.lookDX = 0;
    this.virtual.lookDY = 0;
    return { dx, dy };
  }

  rumble(strength: number, ms: number): void {
    if (!this.settings.vibration) return;
    const gp = this.padState as (Gamepad & { vibrationActuator?: { playEffect: (t: string, o: object) => Promise<unknown> } }) | null;
    if (gp?.vibrationActuator && this.device === 'pad') {
      gp.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength * 0.6 }).catch(() => undefined);
    }
  }

  releasePointer(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  reset(): void {
    this.keys.clear();
    this.latched.clear();
    this.virtual.held.clear();
    this.virtual.pressed.clear();
    this.virtual.mx = this.virtual.mz = 0;
  }
}
