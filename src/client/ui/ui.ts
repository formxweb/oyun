import { t } from '../i18n/i18n';
import type { UIContext } from './context';
import { clear, h } from './dom';
import { FocusNav } from './nav';
import { SCREENS, type ScreenApi, type ScreenName } from './screens';

interface Entry {
  name: ScreenName;
  arg?: unknown;
  el: HTMLElement | null;
}

/** Screen stack + dialogs + focus navigation. The HUD and touch controls live in other layers. */
export class UIManager implements ScreenApi {
  readonly root: HTMLElement;
  readonly screenLayer = h('div', { class: 'layer' });
  readonly hudLayer = h('div', { class: 'layer' });
  readonly touchLayer = h('div', { class: 'layer' });
  readonly dialogLayer = h('div', { class: 'layer' });
  readonly toastLayer = h('div', { class: 'layer', style: { pointerEvents: 'none' } });
  private stack: Entry[] = [];
  readonly nav = new FocusNav();
  onEmpty: (() => void) | null = null;
  onBackFromRoot: (() => void) | null = null;

  constructor(
    root: HTMLElement,
    private readonly ctx: UIContext,
  ) {
    this.root = root;
    root.append(this.hudLayer, this.touchLayer, this.screenLayer, this.dialogLayer, this.toastLayer);
  }

  get open(): boolean {
    return this.stack.length > 0;
  }

  get top(): ScreenName | null {
    return this.stack.length ? this.stack[this.stack.length - 1].name : null;
  }

  private show(): void {
    clear(this.screenLayer);
    const e = this.stack[this.stack.length - 1];
    if (!e) {
      this.nav.detach();
      this.onEmpty?.();
      return;
    }
    e.el = SCREENS[e.name](this.ctx, this, e.arg);
    this.screenLayer.appendChild(e.el);
    this.nav.attach(e.el, () => this.back());
  }

  private back(): void {
    if (this.dialogLayer.childElementCount) {
      clear(this.dialogLayer);
      if (this.stack.length) this.nav.attach(this.stack[this.stack.length - 1].el!, () => this.back());
      return;
    }
    if (this.stack.length === 1 && (this.stack[0].name === 'main' || this.stack[0].name === 'results')) return;
    if (this.stack.length === 1 && this.stack[0].name === 'pause') {
      this.onBackFromRoot?.();
      return;
    }
    this.ctx.playUi('back');
    this.pop();
  }

  push(name: ScreenName, arg?: unknown): void {
    this.ctx.playUi('select');
    this.stack.push({ name, arg, el: null });
    this.show();
  }

  pop(): void {
    this.stack.pop();
    this.show();
  }

  replace(name: ScreenName, arg?: unknown): void {
    this.stack = [{ name, arg, el: null }];
    this.show();
  }

  closeAll(): void {
    this.stack = [];
    clear(this.screenLayer);
    clear(this.dialogLayer);
    this.nav.detach();
  }

  rerender(): void {
    const e = this.stack[this.stack.length - 1];
    if (!e) return;
    const focusedIndex = e.el ? [...e.el.querySelectorAll('button, input')].indexOf(document.activeElement as Element) : -1;
    const scroll = e.el?.querySelector('.scroll')?.scrollTop ?? 0;
    this.show();
    const ne = this.stack[this.stack.length - 1].el!;
    const sc = ne.querySelector('.scroll');
    if (sc) sc.scrollTop = scroll;
    if (focusedIndex >= 0) {
      const els = ne.querySelectorAll<HTMLElement>('button, input');
      requestAnimationFrame(() => els[Math.min(focusedIndex, els.length - 1)]?.focus({ preventScroll: true }));
    }
  }

  dialog(text: string, buttons: { label: string; primary?: boolean; action: () => void }[]): void {
    clear(this.dialogLayer);
    const box = h(
      'div',
      { class: 'panel dialog' },
      h('p', null, text),
      h(
        'div',
        { class: 'row' },
        buttons.map((b) => {
          const el = h('button', { class: 'btn box small' + (b.primary ? ' primary' : ''), type: 'button' }, b.label);
          el.addEventListener('click', () => {
            clear(this.dialogLayer);
            if (this.stack.length) this.nav.attach(this.stack[this.stack.length - 1].el!, () => this.back());
            b.action();
          });
          return el;
        }),
      ),
    );
    const wrap = h('div', { class: 'dialog-wrap' }, box);
    this.dialogLayer.appendChild(wrap);
    this.nav.attach(box, () => {
      clear(this.dialogLayer);
      if (this.stack.length) this.nav.attach(this.stack[this.stack.length - 1].el!, () => this.back());
    });
  }

  toast(text: string): void {
    const el = h('div', { class: 'toast', style: { position: 'absolute', left: '50%', top: '1.5rem', transform: 'translateX(-50%)' } }, text);
    this.toastLayer.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  /** Keyboard hint string for the current device. */
  static keyLabel(label: string): string {
    return `<span class="keycap">${label}</span>`;
  }

  message(textKey: string): void {
    this.dialog(t(textKey), [{ label: t('common.close'), primary: true, action: () => undefined }]);
  }
}
