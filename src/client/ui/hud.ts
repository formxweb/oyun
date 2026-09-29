import { fmtTime, t } from '../i18n/i18n';
import { clear, h } from './dom';

export interface HudFrame {
  y: number;
  peakY: number;
  majorFall: boolean;
  fallDist: number;
  risk: { mult: number; unbanked: number; banked: number } | null;
  timer: { seconds: number; gate: number; total: number; label?: string } | null;
  gravity: number | null;
  prompt: string | null;
}

/** In-game heads-up display. Minimal by design: the world should do most of the talking. */
export class Hud {
  readonly el: HTMLElement;
  private alt: HTMLElement;
  private you: HTMLElement;
  private peak: HTMLElement;
  private label: HTMLElement;
  private titleCard: HTMLElement;
  private areaCard: HTMLElement;
  private toasts: HTMLElement;
  private sub: HTMLElement;
  private hintEl: HTMLElement;
  private promptEl: HTMLElement;
  private fall: HTMLElement;
  private riskEl: HTMLElement;
  private timerEl: HTMLElement;
  private gravEl: HTMLElement;
  private countEl: HTMLElement;
  private vignette: HTMLElement;
  readonly fadeEl: HTMLElement;
  private subT = 0;
  private hintT = 0;
  private areaT = 0;
  private titleT = 0;
  private maxY: number;
  private splitEl: HTMLElement;
  private splitT = 0;
  visible = true;

  constructor(bands: { y: number; name: string }[], maxY: number) {
    this.maxY = maxY;
    this.alt = h('div', { class: 'altimeter' }, h('div', { class: 'rail' }));
    for (const b of bands) this.alt.appendChild(h('div', { class: 'band', style: { bottom: `${(b.y / maxY) * 100}%` }, title: b.name }));
    this.peak = h('div', { class: 'peak' });
    this.you = h('div', { class: 'you' });
    this.label = h('div', { class: 'label' });
    this.alt.append(this.peak, this.you, this.label);
    this.titleCard = h('div', { class: 'title-card' });
    this.areaCard = h('div', { class: 'area-card' });
    this.toasts = h('div', { class: 'toasts' });
    this.sub = h('div', { class: 'subtitle' });
    this.hintEl = h('div', { class: 'hint' });
    this.promptEl = h('div', { class: 'prompt' });
    this.fall = h('div', { class: 'fallmeter' });
    this.riskEl = h('div', { class: 'risk' });
    this.timerEl = h('div', { class: 'timer' });
    this.splitEl = h('div', { class: 'split' });
    this.gravEl = h('div', { class: 'gravity-ring' });
    this.gravEl.innerHTML = '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" fill="none" stroke="rgba(242,230,200,.25)" stroke-width="3"/><circle class="arc" cx="20" cy="20" r="17" fill="none" stroke="#8fb8e8" stroke-width="3" stroke-dasharray="106.8" stroke-dashoffset="0" transform="rotate(-90 20 20)"/></svg>';
    this.countEl = h('div', { class: 'countdown' });
    this.vignette = h('div', { class: 'vignette' });
    this.fadeEl = h('div', { class: 'fade' });
    this.el = h(
      'div',
      { class: 'hud' },
      this.vignette,
      this.alt,
      this.titleCard,
      this.areaCard,
      this.fall,
      this.toasts,
      this.sub,
      this.hintEl,
      this.promptEl,
      this.riskEl,
      this.timerEl,
      this.gravEl,
      this.countEl,
      this.fadeEl,
    );
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.el.style.display = v ? '' : 'none';
  }

  update(f: HudFrame, dt: number, opts: { showRisk: boolean; showTimer: boolean }): void {
    const k = Math.max(0, Math.min(1, f.y / this.maxY));
    this.you.style.bottom = `${k * 100}%`;
    this.label.style.bottom = `${k * 100}%`;
    this.label.textContent = t('hud.height', { m: Math.max(0, Math.round(f.y)) });
    this.peak.style.bottom = `${Math.max(0, Math.min(1, f.peakY / this.maxY)) * 100}%`;
    this.fall.classList.toggle('show', f.majorFall && f.fallDist > 12);
    this.vignette.classList.toggle('show', f.majorFall);
    if (f.majorFall) {
      this.fall.innerHTML = '';
      this.fall.append(t('hud.fall'), h('b', null, `${Math.round(f.fallDist)} m`));
    }
    if (f.risk && opts.showRisk) {
      this.riskEl.style.display = '';
      const m = f.risk.mult;
      clear(this.riskEl);
      this.riskEl.append(
        h('div', { class: 'k' }, t('hud.risk')),
        h('div', { class: 'mult' }, `×${m.toFixed(1)}`),
        h('div', { class: 'bar' }, h('i', { style: { width: `${Math.min(100, ((m - 1) / 4) * 100)}%` } })),
        h('div', { class: 'k', style: { marginTop: '0.35rem' } }, `${Math.round(f.risk.unbanked)} · ${t('hud.banked')} ${Math.round(f.risk.banked)}`),
      );
    } else this.riskEl.style.display = 'none';
    if (f.timer && (opts.showTimer || f.timer.total > 0)) {
      this.timerEl.style.display = '';
      clear(this.timerEl);
      this.timerEl.append(h('div', { class: 't' }, fmtTime(f.timer.seconds)));
      if (f.timer.total > 0) this.timerEl.append(h('div', { class: 'g' }, t('hud.checkpointTrial', { n: f.timer.gate, total: f.timer.total })));
      if (this.splitT > 0) this.timerEl.append(this.splitEl);
    } else this.timerEl.style.display = 'none';
    if (this.splitT > 0) this.splitT -= dt;
    if (f.gravity !== null) {
      this.gravEl.classList.add('show');
      const arc = this.gravEl.querySelector('.arc') as SVGCircleElement;
      arc.setAttribute('stroke-dashoffset', String(106.8 * (1 - f.gravity)));
    } else this.gravEl.classList.remove('show');
    this.promptEl.classList.toggle('show', !!f.prompt);
    if (f.prompt && this.promptEl.textContent !== f.prompt) this.promptEl.textContent = f.prompt;

    if (this.subT > 0) {
      this.subT -= dt;
      if (this.subT <= 0) this.sub.classList.remove('show');
    }
    if (this.hintT > 0) {
      this.hintT -= dt;
      if (this.hintT <= 0) this.hintEl.classList.remove('show');
    }
    if (this.areaT > 0) {
      this.areaT -= dt;
      if (this.areaT <= 0) this.areaCard.classList.remove('show');
    }
    if (this.titleT > 0) {
      this.titleT -= dt;
      if (this.titleT <= 0) this.titleCard.classList.remove('show');
    }
  }

  showRegion(index: number): void {
    clear(this.titleCard);
    this.titleCard.append(
      h('div', { class: 'n' }, t('hud.region', { n: String(index + 1).padStart(2, '0') })),
      h('div', { class: 't' }, t('region.' + index)),
      h('div', { class: 's' }, t('region.' + index + '.sub')),
    );
    this.titleCard.classList.add('show');
    this.titleT = 5;
    this.areaT = 0;
    this.areaCard.classList.remove('show');
  }

  showArea(key: string): void {
    if (this.titleT > 0) return;
    this.areaCard.textContent = t(key);
    this.areaCard.classList.add('show');
    this.areaT = 3.2;
  }

  toast(kind: string, text: string, color: '' | 'gold' | 'sky' = ''): void {
    const el = h('div', { class: 'toast ' + color }, h('span', { class: 'k' }, kind), text);
    this.toasts.appendChild(el);
    setTimeout(() => el.classList.add('out'), 4200);
    setTimeout(() => el.remove(), 5000);
    while (this.toasts.children.length > 4) this.toasts.firstElementChild?.remove();
  }

  subtitle(text: string, seconds = 5, bg = false): void {
    clear(this.sub);
    this.sub.appendChild(h('span', null, text));
    this.sub.classList.toggle('bg', bg);
    this.sub.classList.add('show');
    this.subT = seconds;
  }

  hint(text: string, seconds = 6): void {
    this.hintEl.innerHTML = text;
    this.hintEl.classList.add('show');
    this.hintT = seconds;
  }

  clearHint(): void {
    this.hintT = 0;
    this.hintEl.classList.remove('show');
  }

  split(delta: number): void {
    this.splitEl.className = 'split ' + (delta <= 0 ? 'ahead' : 'behind');
    this.splitEl.textContent = delta <= 0 ? t('hud.ahead', { t: fmtTime(-delta) }) : t('hud.behind', { t: fmtTime(delta) });
    this.splitT = 3;
  }

  countdown(text: string | null): void {
    this.countEl.textContent = text ?? '';
    this.countEl.style.display = text ? '' : 'none';
  }

  fade(on: boolean): void {
    this.fadeEl.classList.toggle('show', on);
  }

  setSubSize(s: number): void {
    this.el.style.setProperty('--sub-size', String(s));
  }
}
