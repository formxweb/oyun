import { t } from '../i18n/i18n';
import type { Settings, TouchId } from '../services/settings';
import { DEFAULT_TOUCH } from '../services/settings';
import { h } from '../ui/dom';
import type { Action, InputManager } from './input';

interface Btn {
  id: TouchId;
  el: HTMLElement;
  action: Action | null;
  pointer: number | null;
}

/**
 * Dedicated touch controls: a floating joystick on the movement side, swipe-to-look on the
 * rest of the screen, and large thumb buttons. Layout, size, opacity and handedness are
 * configurable, and an editor lets players drag every control where they want it.
 */
export class TouchControls {
  readonly el: HTMLElement;
  private stickBase: HTMLElement;
  private stickKnob: HTMLElement;
  private btns: Btn[] = [];
  private stickPointer: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private lookPointer: number | null = null;
  private lookLast = { x: 0, y: 0 };
  private editing = false;
  private dragging: { id: TouchId; pointer: number } | null = null;
  private editBar: HTMLElement | null = null;
  private sizeSlider: HTMLInputElement | null = null;
  private selected: TouchId | null = null;
  sprintLatched = false;
  onPause: (() => void) | null = null;
  haptic: ((ms: number) => void) | null = null;
  contextual = false;
  showRecall = false;
  visible = false;

  constructor(
    private readonly input: InputManager,
    private readonly settings: () => Settings,
    private readonly saveSettings: () => void,
  ) {
    this.stickBase = h('div', { class: 'stick-base' });
    this.stickKnob = h('div', { class: 'stick-knob' });
    this.el = h('div', { class: 'touch' }, this.stickBase, this.stickKnob);
    const make = (id: TouchId, label: string, action: Action | null) => {
      const el = h('div', { class: 'tbtn', 'aria-label': label }, label);
      this.el.appendChild(el);
      this.btns.push({ id, el, action, pointer: null });
    };
    make('jump', t('action.jump'), 'jump');
    make('crouch', t('action.crouch'), 'crouch');
    make('interact', t('action.interact'), 'interact');
    make('sprint', t('action.sprint'), null);
    make('recall', t('action.recall'), 'recall');
    make('pause', '❚❚', null);
    this.el.addEventListener('pointerdown', this.down, { passive: false });
    this.el.addEventListener('pointermove', this.move, { passive: false });
    this.el.addEventListener('pointerup', this.up);
    this.el.addEventListener('pointercancel', this.up);
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
    this.layout();
    this.setVisible(false);
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.el.style.display = v ? '' : 'none';
    if (!v) this.releaseAll();
  }

  private pos(id: TouchId): { x: number; y: number; size: number } {
    const s = this.settings().touch;
    const p = s.layout[id] ?? DEFAULT_TOUCH[id];
    return { x: s.leftHanded ? 1 - p.x : p.x, y: p.y, size: p.size * s.scale };
  }

  layout(): void {
    const s = this.settings().touch;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const st = this.pos('stick');
    this.stickOrigin = { x: st.x * W, y: st.y * H };
    this.placeStick(this.stickOrigin.x, this.stickOrigin.y, 0, 0);
    this.stickBase.style.transform = `scale(${st.size})`;
    for (const b of this.btns) {
      const p = this.pos(b.id);
      b.el.style.left = `${p.x * W}px`;
      b.el.style.top = `${p.y * H}px`;
      b.el.style.transform = `scale(${p.size})`;
      b.el.style.opacity = String(s.opacity + (b.id === 'jump' ? 0.1 : 0));
    }
    this.stickBase.style.opacity = String(s.opacity);
    this.stickKnob.style.opacity = String(Math.min(1, s.opacity + 0.2));
    this.btn('recall').el.classList.toggle('hidden', !this.showRecall);
  }

  private btn(id: TouchId): Btn {
    return this.btns.find((b) => b.id === id)!;
  }

  private placeStick(bx: number, by: number, kx: number, ky: number): void {
    this.stickBase.style.left = `${bx}px`;
    this.stickBase.style.top = `${by}px`;
    this.stickKnob.style.left = `${bx + kx}px`;
    this.stickKnob.style.top = `${by + ky}px`;
  }

  setContext(interactAvailable: boolean, recall: boolean): void {
    if (interactAvailable !== this.contextual) {
      this.contextual = interactAvailable;
      this.btn('interact').el.classList.toggle('ctx', interactAvailable);
    }
    if (recall !== this.showRecall) {
      this.showRecall = recall;
      this.btn('recall').el.classList.toggle('hidden', !recall);
    }
  }

  private hit(x: number, y: number): Btn | null {
    let best: Btn | null = null;
    let bd = Infinity;
    for (const b of this.btns) {
      if (b.el.classList.contains('hidden')) continue;
      const r = b.el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const d = Math.hypot(x - cx, y - cy);
      // generous hit radius: 60% bigger than the visual
      if (d < (r.width / 2) * 1.6 && d < bd) {
        bd = d;
        best = b;
      }
    }
    return best;
  }

  private down = (e: PointerEvent): void => {
    e.preventDefault();
    this.input.setDevice('touch');
    const x = e.clientX;
    const y = e.clientY;
    if (this.editing) {
      const b = this.hit(x, y);
      const sb = this.stickBase.getBoundingClientRect();
      const onStick = Math.hypot(x - (sb.left + sb.width / 2), y - (sb.top + sb.height / 2)) < sb.width / 2;
      const id = b?.id ?? (onStick ? 'stick' : null);
      if (id) {
        this.dragging = { id, pointer: e.pointerId };
        this.selected = id;
        if (this.sizeSlider) this.sizeSlider.value = String(this.settings().touch.layout[id].size);
      }
      return;
    }
    const b = this.hit(x, y);
    if (b) {
      b.pointer = e.pointerId;
      b.el.classList.add('down');
      this.haptic?.(8);
      if (b.id === 'pause') this.onPause?.();
      else if (b.id === 'sprint') {
        this.sprintLatched = !this.sprintLatched;
        b.el.classList.toggle('ctx', this.sprintLatched);
      } else if (b.action) {
        this.input.virtual.held.add(b.action);
        this.input.virtual.pressed.add(b.action);
      }
      return;
    }
    const s = this.settings().touch;
    const leftSide = s.leftHanded ? x > window.innerWidth * 0.55 : x < window.innerWidth * 0.45;
    if (leftSide && this.stickPointer === null) {
      this.stickPointer = e.pointerId;
      // floating stick: re-centre where the thumb lands unless it lands on the base
      const d = Math.hypot(x - this.stickOrigin.x, y - this.stickOrigin.y);
      const cx = d < 70 ? this.stickOrigin.x : x;
      const cy = d < 70 ? this.stickOrigin.y : y;
      this.stickBase.dataset.cx = String(cx);
      this.stickBase.dataset.cy = String(cy);
      this.updateStick(x, y);
    } else if (this.lookPointer === null) {
      this.lookPointer = e.pointerId;
      this.lookLast = { x, y };
    }
  };

  private updateStick(x: number, y: number): void {
    const cx = Number(this.stickBase.dataset.cx);
    const cy = Number(this.stickBase.dataset.cy);
    const scale = this.pos('stick').size;
    const R = 62 * scale;
    let dx = x - cx;
    let dy = y - cy;
    const d = Math.hypot(dx, dy);
    if (d > R) {
      dx *= R / d;
      dy *= R / d;
    }
    const mag = Math.min(1, d / R);
    this.placeStick(cx, cy, dx, dy);
    this.input.virtual.mx = dx / R;
    this.input.virtual.mz = -dy / R;
    const auto = this.settings().touch.autoSprint && mag > 0.92;
    const sprint = auto || this.sprintLatched;
    if (sprint) this.input.virtual.held.add('sprint');
    else this.input.virtual.held.delete('sprint');
    this.stickBase.classList.toggle('sprinting', sprint);
  }

  private move = (e: PointerEvent): void => {
    e.preventDefault();
    if (this.editing) {
      if (this.dragging && this.dragging.pointer === e.pointerId) {
        const s = this.settings().touch;
        const W = window.innerWidth;
        const H = window.innerHeight;
        let nx = Math.min(0.98, Math.max(0.02, e.clientX / W));
        const ny = Math.min(0.98, Math.max(0.02, e.clientY / H));
        if (s.leftHanded) nx = 1 - nx;
        s.layout[this.dragging.id] = { ...s.layout[this.dragging.id], x: nx, y: ny };
        this.layout();
      }
      return;
    }
    if (e.pointerId === this.stickPointer) this.updateStick(e.clientX, e.clientY);
    else if (e.pointerId === this.lookPointer) {
      const k = 0.0042 * this.settings().touch.lookSensitivity;
      this.input.virtual.lookDX += (e.clientX - this.lookLast.x) * k;
      this.input.virtual.lookDY += (e.clientY - this.lookLast.y) * k;
      this.lookLast = { x: e.clientX, y: e.clientY };
    }
  };

  private up = (e: PointerEvent): void => {
    if (this.editing) {
      if (this.dragging?.pointer === e.pointerId) {
        this.dragging = null;
        this.saveSettings();
      }
      return;
    }
    for (const b of this.btns) {
      if (b.pointer === e.pointerId) {
        b.pointer = null;
        b.el.classList.remove('down');
        if (b.action) this.input.virtual.held.delete(b.action);
      }
    }
    if (e.pointerId === this.stickPointer) {
      this.stickPointer = null;
      this.input.virtual.mx = 0;
      this.input.virtual.mz = 0;
      if (!this.sprintLatched) this.input.virtual.held.delete('sprint');
      this.placeStick(this.stickOrigin.x, this.stickOrigin.y, 0, 0);
      this.stickBase.classList.remove('sprinting');
    }
    if (e.pointerId === this.lookPointer) this.lookPointer = null;
  };

  releaseAll(): void {
    for (const b of this.btns) {
      b.pointer = null;
      b.el.classList.remove('down');
    }
    this.stickPointer = null;
    this.lookPointer = null;
    this.input.virtual.held.clear();
    this.input.virtual.mx = 0;
    this.input.virtual.mz = 0;
  }

  /** Layout editor: drag controls anywhere, resize the selected one. */
  startEditing(onDone: () => void): void {
    this.editing = true;
    this.setVisible(true);
    this.el.classList.add('editing');
    this.selected = 'jump';
    this.sizeSlider = h('input', { type: 'range', min: '0.6', max: '1.8', step: '0.05', value: String(this.settings().touch.layout.jump.size) }) as HTMLInputElement;
    this.sizeSlider.addEventListener('input', () => {
      if (!this.selected) return;
      const s = this.settings().touch;
      s.layout[this.selected] = { ...s.layout[this.selected], size: Number(this.sizeSlider!.value) };
      this.layout();
    });
    const done = h('button', { class: 'btn box small primary', type: 'button' }, t('touch.edit.done'));
    const reset = h('button', { class: 'btn box small', type: 'button' }, t('touch.edit.reset'));
    done.addEventListener('click', () => {
      this.stopEditing();
      onDone();
    });
    reset.addEventListener('click', () => {
      this.settings().touch.layout = structuredClone(DEFAULT_TOUCH);
      this.saveSettings();
      this.layout();
    });
    this.editBar = h(
      'div',
      { class: 'panel', style: { position: 'absolute', left: '50%', top: '1rem', transform: 'translateX(-50%)', zIndex: '6', width: 'min(34rem, 92vw)' } },
      h('div', { class: 'muted', style: { fontSize: '0.85rem', marginBottom: '0.5rem' } }, t('touch.edit.title')),
      h('div', { class: 'row' }, this.sizeSlider, reset, done),
    );
    this.el.appendChild(this.editBar);
  }

  stopEditing(): void {
    this.editing = false;
    this.el.classList.remove('editing');
    this.editBar?.remove();
    this.editBar = null;
    this.saveSettings();
  }
}
