/**
 * Spatial focus navigation so every menu works with a controller, keyboard or touch.
 * D-pad / stick / arrows move focus to the nearest element in that direction.
 */
const SELECTOR = '.btn:not([disabled]), .tab, .toggle, .choice, .card, input[type="range"], textarea, [data-nav]';

export class FocusNav {
  private root: HTMLElement | null = null;
  private back: (() => void) | null = null;
  private repeatT = 0;
  private lastDir = '';
  private padPrev: boolean[] = [];
  enabled = true;

  constructor() {
    window.addEventListener('keydown', this.onKey, true);
  }

  attach(root: HTMLElement, back: (() => void) | null): void {
    this.root = root;
    this.back = back;
    requestAnimationFrame(() => {
      if (this.root !== root) return;
      const preferred = root.querySelector<HTMLElement>('[autofocus], .btn.primary:not([disabled])') ?? this.items()[0];
      preferred?.focus({ preventScroll: false });
    });
  }

  detach(root?: HTMLElement): void {
    if (!root || root === this.root) {
      this.root = null;
      this.back = null;
    }
  }

  private items(): HTMLElement[] {
    if (!this.root) return [];
    return [...this.root.querySelectorAll<HTMLElement>(SELECTOR)].filter((e) => e.offsetParent !== null);
  }

  private onKey = (e: KeyboardEvent): void => {
    if (!this.root || !this.enabled) return;
    const k = e.code;
    const active = document.activeElement as HTMLElement | null;
    const inRange = active instanceof HTMLInputElement && active.type === 'range';
    // typing: only Escape leaves the field; every other key belongs to the text
    const typing = active instanceof HTMLTextAreaElement || (active instanceof HTMLInputElement && active.type === 'text');
    if (k === 'Escape' || (k === 'Backspace' && !typing)) {
      if (this.back) {
        e.preventDefault();
        e.stopPropagation();
        this.back();
      }
      return;
    }
    if (typing) return;
    const dirs: Record<string, string> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right' };
    if (dirs[k]) {
      if (inRange && (dirs[k] === 'left' || dirs[k] === 'right')) return; // native range handling
      e.preventDefault();
      e.stopPropagation();
      this.move(dirs[k]);
    } else if (k === 'Enter' || k === 'Space') {
      if (active && this.root.contains(active) && !(active instanceof HTMLInputElement)) {
        e.preventDefault();
        e.stopPropagation();
        active.click();
      }
    } else if (k === 'KeyQ' || k === 'KeyE' || k === 'PageUp' || k === 'PageDown') {
      this.tab(k === 'KeyQ' || k === 'PageUp' ? -1 : 1);
    }
  };

  /** Called every frame with the current gamepad (menus only). */
  pollPad(gp: Gamepad | null, dt: number): void {
    if (!this.root || !gp || !this.enabled) {
      this.padPrev = gp ? gp.buttons.map((b) => b.pressed) : [];
      return;
    }
    const pressed = gp.buttons.map((b) => b.pressed);
    const edge = (i: number) => pressed[i] && !this.padPrev[i];
    this.padPrev = pressed;
    const active = document.activeElement as HTMLElement | null;
    if (edge(0) && active && this.root.contains(active)) {
      if (active instanceof HTMLInputElement && active.type === 'range') {
        /* no-op */
      } else active.click();
    }
    if (edge(1) && this.back) this.back();
    if (edge(4)) this.tab(-1);
    if (edge(5)) this.tab(1);
    let dir = '';
    const ax = gp.axes[0] ?? 0;
    const ay = gp.axes[1] ?? 0;
    if (pressed[12] || ay < -0.6) dir = 'up';
    else if (pressed[13] || ay > 0.6) dir = 'down';
    else if (pressed[14] || ax < -0.6) dir = 'left';
    else if (pressed[15] || ax > 0.6) dir = 'right';
    if (!dir) {
      this.lastDir = '';
      this.repeatT = 0;
      return;
    }
    if (dir !== this.lastDir) {
      this.lastDir = dir;
      this.repeatT = 0.4;
      this.step(dir, active);
    } else {
      this.repeatT -= dt;
      if (this.repeatT <= 0) {
        this.repeatT = 0.12;
        this.step(dir, active);
      }
    }
  }

  private step(dir: string, active: HTMLElement | null): void {
    if (active instanceof HTMLInputElement && active.type === 'range' && (dir === 'left' || dir === 'right')) {
      const step = Number(active.step || '0.05');
      const v = Number(active.value) + (dir === 'left' ? -step : step);
      active.value = String(Math.min(Number(active.max), Math.max(Number(active.min), v)));
      active.dispatchEvent(new Event('input', { bubbles: true }));
      active.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    this.move(dir);
  }

  private tab(d: number): void {
    if (!this.root) return;
    const tabs = [...this.root.querySelectorAll<HTMLElement>('.tab')];
    if (!tabs.length) return;
    const i = tabs.findIndex((t) => t.classList.contains('active'));
    const n = tabs[(i + d + tabs.length) % tabs.length];
    n.click();
    n.focus();
  }

  move(dir: string): void {
    const items = this.items();
    if (!items.length) return;
    const cur = document.activeElement as HTMLElement | null;
    if (!cur || !items.includes(cur)) {
      items[0].focus();
      return;
    }
    const r = cur.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let best: HTMLElement | null = null;
    let bestScore = Infinity;
    for (const it of items) {
      if (it === cur) continue;
      const b = it.getBoundingClientRect();
      const x = b.left + b.width / 2;
      const y = b.top + b.height / 2;
      const dx = x - cx;
      const dy = y - cy;
      let primary = 0;
      let secondary = 0;
      if (dir === 'up') {
        primary = -dy;
        secondary = Math.abs(dx);
      } else if (dir === 'down') {
        primary = dy;
        secondary = Math.abs(dx);
      } else if (dir === 'left') {
        primary = -dx;
        secondary = Math.abs(dy);
      } else {
        primary = dx;
        secondary = Math.abs(dy);
      }
      if (primary <= 2) continue;
      const score = primary + secondary * 2.2;
      if (score < bestScore) {
        bestScore = score;
        best = it;
      }
    }
    if (best) {
      best.focus();
      best.scrollIntoView({ block: 'nearest' });
    } else if (dir === 'down' || dir === 'up') {
      // wrap vertically in simple lists
      const i = items.indexOf(cur);
      const n = items[(i + (dir === 'down' ? 1 : -1) + items.length) % items.length];
      n.focus();
      n.scrollIntoView({ block: 'nearest' });
    }
  }
}
