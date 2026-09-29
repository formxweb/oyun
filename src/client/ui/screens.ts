import { ACHIEVEMENTS } from '../../core/catalog/achievements';
import { COSMETICS, SLOTS, type Cosmetic, type Slot } from '../../core/catalog/cosmetics';
import { PRODUCTS, PRODUCT_BY_SKU } from '../../core/catalog/store';
import { weekKey } from '../../core/daily';
import type { CollectibleKind } from '../../core/world/types';
import { ACTIONS, type Action } from '../input/input';
import { fmtDuration, fmtNumber, fmtTime, getLang, LANGS, setLang, t } from '../i18n/i18n';
import type { QualityLevel } from '../render/renderer';
import { GRANDPARENT_LETTER } from '../services/profile';
import type { UIContext, GhostChoice, TrialResultView } from './context';
import { add, clear, h, paragraphs } from './dom';

export type ScreenName =
  | 'main'
  | 'letterUp'
  | 'new'
  | 'ngplus'
  | 'settings'
  | 'collection'
  | 'customize'
  | 'store'
  | 'leaderboards'
  | 'trials'
  | 'daily'
  | 'pause'
  | 'results'
  | 'reader'
  | 'credits';

export interface ScreenApi {
  push(name: ScreenName, arg?: unknown): void;
  pop(): void;
  replace(name: ScreenName, arg?: unknown): void;
  dialog(text: string, buttons: { label: string; primary?: boolean; action: () => void }[]): void;
  toast(text: string): void;
  rerender(): void;
}

type Build = (ctx: UIContext, ui: ScreenApi, arg?: unknown) => HTMLElement;

// ------------------------------------------------------------------ helpers

function btn(label: string, action: () => void, o: { sub?: string; primary?: boolean; disabled?: boolean; locked?: boolean; cls?: string } = {}): HTMLButtonElement {
  const b = h('button', { class: `btn ${o.primary ? 'primary' : ''} ${o.locked ? 'locked' : ''} ${o.cls ?? ''}`, disabled: o.disabled, type: 'button' }, label, o.sub ? h('span', { class: 'sub' }, o.sub) : null);
  b.addEventListener('click', () => {
    if (o.disabled || o.locked) return;
    action();
  });
  return b;
}

function toggle(value: boolean, onChange: (v: boolean) => void): HTMLButtonElement {
  const b = h('button', { class: 'toggle' + (value ? ' on' : ''), type: 'button' }, value ? t('common.on') : t('common.off'));
  b.addEventListener('click', () => {
    value = !value;
    b.classList.toggle('on', value);
    b.textContent = value ? t('common.on') : t('common.off');
    onChange(value);
  });
  return b;
}

function choice<T extends string | number>(options: { v: T; label: string }[], value: T, onChange: (v: T) => void): HTMLButtonElement {
  let i = Math.max(0, options.findIndex((o) => o.v === value));
  const b = h('button', { class: 'choice', type: 'button' }, options[i].label);
  b.addEventListener('click', () => {
    i = (i + 1) % options.length;
    b.textContent = options[i].label;
    onChange(options[i].v);
  });
  return b;
}

function slider(value: number, min: number, max: number, step: number, onChange: (v: number) => void, fmt: (v: number) => string = (v) => v.toFixed(2)): HTMLElement {
  const out = h('span', { class: 'faint', style: { minWidth: '3.2rem', textAlign: 'right' } }, fmt(value));
  const r = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) }) as HTMLInputElement;
  r.addEventListener('input', () => {
    out.textContent = fmt(Number(r.value));
    onChange(Number(r.value));
  });
  return h('span', { class: 'control', style: { width: '100%' } }, r, out);
}

function row(label: string, control: HTMLElement): HTMLElement {
  return h('div', { class: 'setting' }, h('label', null, label), h('div', { class: 'control' }, control));
}

function header(title: string, back: () => void): HTMLElement {
  return h('div', { class: 'row', style: { marginBottom: '1rem' } }, h('h2', { style: { margin: '0' } }, title), h('div', { class: 'spacer' }), btn(t('common.back'), back, { cls: 'small box' }));
}

function tabs(names: { id: string; label: string }[], active: string, onSelect: (id: string) => void): HTMLElement {
  return h(
    'div',
    { class: 'tabs' },
    names.map((n) => {
      const b = h('button', { class: 'tab' + (n.id === active ? ' active' : ''), type: 'button' }, n.label);
      b.addEventListener('click', () => onSelect(n.id));
      return b;
    }),
  );
}

export function keyName(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map: Record<string, string> = { Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'R-Shift', ControlLeft: 'Ctrl', ControlRight: 'R-Ctrl', Escape: 'Esc', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Tab: 'Tab', Enter: 'Enter', AltLeft: 'Alt' };
  return map[code] ?? code;
}

const PAD_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'L3', 'R3', 'D↑', 'D↓', 'D←', 'D→', 'Home'];
export function padName(i: number): string {
  return PAD_NAMES[i] ?? 'B' + i;
}

// ------------------------------------------------------------------ main menu

const mainMenu: Build = (ctx, ui) => {
  const p = ctx.profile;
  const j = ctx.journeySummary();
  const finished = p.data.journeysCompleted > 0;
  const items: HTMLElement[] = [];
  if (j) items.push(btn(t('menu.continue'), () => ctx.continueJourney(), { primary: true, sub: t('menu.continue.info', { region: t('region.' + j.region), time: fmtDuration(j.time) }) }));
  items.push(btn(t('menu.new'), () => ui.push('new'), { primary: !j }));
  items.push(btn(t('menu.trial'), () => ui.push('trials'), { locked: p.data.regionsReached < 1 && !finished, sub: p.data.regionsReached < 1 && !finished ? t('menu.locked.trial') : undefined }));
  items.push(btn(t('menu.daily'), () => ui.push('daily'), { locked: !ctx.dailyUnlocked(), sub: !ctx.dailyUnlocked() ? t('menu.locked.ngplus') : undefined }));
  items.push(btn(t('menu.ngplus'), () => ui.push('ngplus'), { locked: !finished, sub: !finished ? t('menu.locked.ngplus') : undefined }));
  items.push(btn(t('menu.collection'), () => ui.push('collection')));
  items.push(btn(t('menu.customize'), () => ui.push('customize')));
  items.push(btn(t('menu.store'), () => ui.push('store')));
  items.push(btn(t('menu.leaderboards'), () => ui.push('leaderboards')));
  items.push(btn(t('menu.settings'), () => ui.push('settings')));
  if (ctx.canQuit) items.push(btn(t('menu.quit'), () => ctx.quitGame()));
  return h(
    'div',
    { class: 'screen dim' },
    h(
      'div',
      { class: 'menu-col' },
      h(
        'div',
        { class: 'title-block' },
        h('h1', { class: 'game-title' }, h('span', { class: 'plumb-mark' }), t('game.title')),
        h('div', { class: 'game-sub' }, t('game.subtitle')),
        h('div', { class: 'game-tag' }, t('game.tagline')),
      ),
      h('nav', { class: 'menu main' }, items),
    ),
    h('div', { class: 'spacer' }),
    h('div', { style: { alignSelf: 'flex-end', textAlign: 'right' }, class: 'faint' }, btn(t('menu.credits'), () => ui.push('credits'), { cls: 'small' }), h('div', { style: { fontSize: '0.75rem', marginTop: '0.4rem' } }, `v1.0 · ${ctx.platformName}`)),
  );
};

// ------------------------------------------------------------------ new journey

const newJourney: Build = (ctx, ui) => {
  let diff: 'guided' | 'standard' = 'standard';
  const cards = (['standard', 'guided'] as const).map((d) => {
    const c = h('button', { class: 'card' + (d === diff ? ' selected' : ''), type: 'button', style: { flex: '1', minWidth: '14rem' } }, h('div', { class: 'title' }, t('new.' + d)), h('div', { class: 'desc' }, t('new.' + d + '.desc')));
    c.addEventListener('click', () => {
      diff = d;
      cards.forEach((x, i) => x.classList.toggle('selected', ['standard', 'guided'][i] === d));
    });
    return c;
  });
  const begin = () => ctx.startJourney(diff, false);
  return h(
    'div',
    { class: 'screen dim' },
    h(
      'div',
      { class: 'panel', style: { margin: 'auto', maxWidth: '44rem', width: '100%' } },
      header(t('new.title'), () => ui.pop()),
      h('div', { class: 'row', style: { flexWrap: 'wrap', alignItems: 'stretch' } }, cards),
      ctx.journeySummary() ? h('p', { class: 'muted', style: { fontSize: '0.88rem' } }, t('new.overwrite')) : null,
      h(
        'div',
        { class: 'row', style: { justifyContent: 'flex-end', marginTop: '1rem' } },
        btn(t('new.begin'), () => {
          if (ctx.journeySummary()) ui.dialog(t('new.overwrite'), [{ label: t('common.cancel'), action: () => undefined }, { label: t('new.begin'), primary: true, action: begin }]);
          else begin();
        }, { primary: true, cls: 'box' }),
      ),
    ),
  );
};

const ngPlus: Build = (ctx, ui) => {
  return h(
    'div',
    { class: 'screen dim' },
    h(
      'div',
      { class: 'panel', style: { margin: 'auto', maxWidth: '40rem' } },
      header(t('ngplus.title'), () => ui.pop()),
      h('p', { class: 'muted', style: { lineHeight: '1.5' } }, t('ngplus.desc')),
      ctx.journeySummary() ? h('p', { class: 'faint', style: { fontSize: '0.85rem' } }, t('new.overwrite')) : null,
      h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, btn(t('new.begin'), () => ctx.startJourney('standard', true), { primary: true, cls: 'box' })),
    ),
  );
};

// ------------------------------------------------------------------ settings

let settingsTab = 'graphics';

const settings: Build = (ctx, ui) => {
  const s = ctx.settings.value;
  const save = () => {
    ctx.settings.save();
    ctx.applySettings();
  };
  const body = h('div', { class: 'scroll', style: { flex: '1', paddingRight: '0.6rem' } });
  const tabNames = [
    { id: 'graphics', label: t('settings.graphics') },
    { id: 'audio', label: t('settings.audio') },
    { id: 'controls', label: t('settings.controls') },
    ...(ctx.isTouch ? [{ id: 'touch', label: t('settings.touch') }] : []),
    { id: 'access', label: t('settings.access') },
    { id: 'gameplay', label: t('settings.gameplay') },
    { id: 'account', label: t('settings.account') },
  ];
  const render = () => {
    clear(body);
    switch (settingsTab) {
      case 'graphics': {
        const q = (['low', 'medium', 'high', 'ultra'] as QualityLevel[]).map((v) => ({ v, label: t('q.' + v) }));
        add(body, 
          row(t('settings.language'), choice(LANGS.map((l) => ({ v: l.id, label: l.name })), getLang(), (v) => {
            s.lang = v;
            setLang(v);
            save();
            ui.rerender();
          })),
          row(t('settings.quality'), choice(q, s.graphics.quality, (v) => {
            s.graphics.quality = v;
            save();
          })),
          row(t('settings.resolution'), slider(s.graphics.resolutionScale, 0.5, 1, 0.05, (v) => {
            s.graphics.resolutionScale = v;
            save();
          }, (v) => Math.round(v * 100) + '%')),
          row(t('settings.dynres'), toggle(s.graphics.dynamicResolution, (v) => {
            s.graphics.dynamicResolution = v;
            save();
          })),
          row(t('settings.fps'), choice([30, 60, 90, 120, 144].map((v) => ({ v, label: v + ' fps' })), s.graphics.targetFps, (v) => {
            s.graphics.targetFps = v;
            save();
          })),
          row(t('settings.fov'), slider(s.graphics.fov, 60, 100, 1, (v) => {
            s.graphics.fov = v;
            save();
          }, (v) => v + '°')),
          !ctx.isTouch
            ? row(t('settings.fullscreen'), toggle(s.graphics.fullscreen, (v) => {
                s.graphics.fullscreen = v;
                save();
              }))
            : null,
        );
        break;
      }
      case 'audio': {
        const vol = (k: keyof typeof s.audio, label: string) =>
          row(label, slider(s.audio[k], 0, 1, 0.05, (v) => {
            s.audio[k] = v;
            save();
          }, (v) => Math.round(v * 100) + '%'));
        add(body, vol('master', t('settings.master')), vol('music', t('settings.music')), vol('sfx', t('settings.sfx')), vol('ambience', t('settings.ambience')), vol('voice', t('settings.voice')));
        break;
      }
      case 'controls': {
        const c = s.controls;
        add(body, 
          row(t('settings.sens'), slider(c.sensitivity, 0.2, 3, 0.05, (v) => {
            c.sensitivity = v;
            save();
          })),
          row(t('settings.padsens'), slider(c.padLookSpeed, 1, 6, 0.1, (v) => {
            c.padLookSpeed = v;
            save();
          })),
          row(t('settings.invertY'), toggle(c.invertY, (v) => {
            c.invertY = v;
            save();
          })),
          row(t('settings.autocenter'), toggle(c.autoCenter, (v) => {
            c.autoCenter = v;
            save();
          })),
          row(t('settings.camdist'), slider(c.camDistance, 2.8, 7, 0.1, (v) => {
            c.camDistance = v;
            save();
          }, (v) => v.toFixed(1) + ' m')),
          row(t('settings.sprintMode'), choice([{ v: 'hold', label: t('sprint.hold') }, { v: 'toggle', label: t('sprint.toggle') }, { v: 'auto', label: t('sprint.auto') }] as { v: 'hold' | 'toggle' | 'auto'; label: string }[], c.sprintMode, (v) => {
            c.sprintMode = v;
            save();
          })),
          row(t('settings.vibration'), toggle(c.vibration, (v) => {
            c.vibration = v;
            save();
          })),
          h('h3', null, t('settings.bindings')),
        );
        const rebindable: Action[] = ACTIONS.filter((a) => a !== 'pause');
        for (const a of rebindable) {
          const cur = c.bindings.keys[a];
          const b = h('button', { class: 'choice', type: 'button' }, cur.map(keyName).join(' / '));
          b.addEventListener('click', () => {
            b.textContent = t('settings.rebind');
            (window as unknown as { __vertigoCapture?: (cb: (code: string | number) => void) => void }).__vertigoCapture?.((code) => {
              if (typeof code !== 'string') return;
              // swap if another action uses this key
              for (const other of ACTIONS) c.bindings.keys[other] = c.bindings.keys[other].filter((k) => k !== code);
              c.bindings.keys[a] = [code];
              save();
              render();
            });
          });
          add(body, row(t('action.' + a), b));
        }
        add(body, h('h3', null, t('settings.padBindings')));
        for (const a of rebindable) {
          const b = h('button', { class: 'choice', type: 'button' }, c.bindings.pad[a].map(padName).join(' / '));
          b.addEventListener('click', () => {
            b.textContent = t('settings.rebindPad');
            (window as unknown as { __vertigoCapture?: (cb: (code: string | number) => void) => void }).__vertigoCapture?.((code) => {
              if (typeof code !== 'number') return;
              for (const other of ACTIONS) c.bindings.pad[other] = c.bindings.pad[other].filter((k) => k !== code);
              c.bindings.pad[a] = [code];
              save();
              render();
            });
          });
          add(body, row(t('action.' + a), b));
        }
        add(body, h('div', { style: { marginTop: '1rem' } }, btn(t('common.reset'), () => {
          ctx.settings.reset('controls');
          ctx.applySettings();
          render();
        }, { cls: 'small box' })));
        break;
      }
      case 'touch': {
        const tt = s.touch;
        add(body, 
          row(t('settings.touchLayout'), btn(t('settings.touchLayout'), () => ctx.startTouchEditor(), { cls: 'small box' })),
          row(t('settings.touchOpacity'), slider(tt.opacity, 0.15, 1, 0.05, (v) => {
            tt.opacity = v;
            save();
          }, (v) => Math.round(v * 100) + '%')),
          row(t('settings.touchSize'), slider(tt.scale, 0.7, 1.5, 0.05, (v) => {
            tt.scale = v;
            save();
          }, (v) => Math.round(v * 100) + '%')),
          row(t('settings.leftHanded'), toggle(tt.leftHanded, (v) => {
            tt.leftHanded = v;
            save();
          })),
          row(t('settings.touchSprint'), toggle(tt.autoSprint, (v) => {
            tt.autoSprint = v;
            save();
          })),
          row(t('settings.sens'), slider(tt.lookSensitivity, 0.3, 2.5, 0.05, (v) => {
            tt.lookSensitivity = v;
            save();
          })),
          row(t('settings.haptics'), toggle(tt.haptics, (v) => {
            tt.haptics = v;
            save();
          })),
        );
        break;
      }
      case 'access': {
        const a = s.access;
        const tg = (k: keyof typeof a, label: string) =>
          row(label, toggle(a[k] as boolean, (v) => {
            (a as unknown as Record<string, unknown>)[k] = v;
            save();
          }));
        add(body, 
          tg('subtitles', t('settings.subtitles')),
          row(t('settings.subSize'), slider(a.subSize, 0.8, 1.8, 0.05, (v) => {
            a.subSize = v;
            save();
          }, (v) => Math.round(v * 100) + '%')),
          row(t('settings.uiScale'), slider(a.uiScale, 0.8, 1.5, 0.05, (v) => {
            a.uiScale = v;
            save();
          }, (v) => Math.round(v * 100) + '%')),
          tg('cameraShake', t('settings.shake')),
          tg('motionBlur', t('settings.blur')),
          tg('reducedMotion', t('settings.reduced')),
          tg('slowMo', t('settings.slowmo')),
          tg('colorblind', t('settings.colorblind')),
          tg('highContrast', t('settings.highContrast')),
          tg('hints', t('settings.hints')),
        );
        break;
      }
      case 'gameplay': {
        const g = s.gameplay;
        const j = ctx.profile.data.journey;
        add(body, 
          row(t('settings.showRisk'), toggle(g.showRisk, (v) => {
            g.showRisk = v;
            save();
          })),
          row(t('settings.speedrunTimer'), toggle(g.showTimer, (v) => {
            g.showTimer = v;
            save();
          })),
          j && !j.speedrun
            ? row(t('settings.difficulty'), choice([{ v: 'standard', label: t('new.standard') }, { v: 'guided', label: t('new.guided') }] as { v: 'standard' | 'guided'; label: string }[], j.difficulty, (v) => {
                j.difficulty = v;
                ctx.saveNow();
                ctx.applySettings();
              }))
            : null,
        );
        break;
      }
      case 'account': {
        const acc = ctx.accountInfo();
        add(body, 
          row(
            t('settings.cloud'),
            h('span', { class: 'muted', style: { fontSize: '0.85rem' } }, acc.signedIn ? (acc.error ? t('settings.cloud.status.err') : acc.lastSync ? t('settings.cloud.status.ok', { time: new Date(acc.lastSync).toLocaleTimeString() }) : acc.name) : t('settings.cloud.status.off')),
          ),
        );
        if (acc.signedIn) {
          add(body, 
            h('p', { class: 'muted' }, t('settings.friendCode', { code: acc.friendCode })),
            h(
              'div',
              { class: 'row', style: { flexWrap: 'wrap' } },
              btn(t('settings.cloud.sync'), async () => {
                await ctx.syncCloud();
                render();
              }, { cls: 'small box' }),
              btn(t('settings.addFriend'), async () => {
                const code = prompt(t('settings.addFriend'));
                if (code) ui.toast((await ctx.addFriend(code.trim())) ? '✓' : t('err.generic'));
              }, { cls: 'small box' }),
              btn(t('settings.signout'), () => {
                ctx.signOut();
                render();
              }, { cls: 'small box' }),
            ),
          );
        } else {
          add(body, btn(t('settings.signin'), async () => {
            await ctx.signIn();
            render();
          }, { cls: 'small box' }));
        }
        add(body, 
          h('h3', null, t('settings.export')),
          h(
            'div',
            { class: 'row', style: { flexWrap: 'wrap' } },
            btn(t('settings.export'), () => {
              const s2 = ctx.exportSave();
              navigator.clipboard?.writeText(s2).then(
                () => ui.toast('✓'),
                () => prompt(t('settings.export'), s2),
              );
            }, { cls: 'small box' }),
            btn(t('settings.import'), () => {
              const s2 = prompt(t('settings.import'));
              if (s2) ui.toast(ctx.importSave(s2) ? '✓' : t('save.corrupt.none'));
            }, { cls: 'small box' }),
          ),
        );
        break;
      }
    }
  };
  render();
  return h(
    'div',
    { class: 'screen full' },
    h(
      'div',
      { class: 'panel', style: { margin: 'auto', width: 'min(56rem, 100%)', height: '100%', display: 'flex', flexDirection: 'column' } },
      header(t('settings.title'), () => ui.pop()),
      tabs(tabNames, settingsTab, (id) => {
        settingsTab = id;
        ui.rerender();
      }),
      body,
    ),
  );
};

// ------------------------------------------------------------------ collection

let collectionTab: string = 'letters';

const collection: Build = (ctx, ui) => {
  const p = ctx.profile;
  const w = ctx.world;
  const body = h('div', { class: 'scroll', style: { flex: '1' } });
  const kindTab = (kind: CollectibleKind) => {
    // the grandparent's letter is kept apart from the thirty Letters Down (below)
    const items = w.collectibles.filter((c) => c.kind === kind && c.id !== GRANDPARENT_LETTER);
    if (kind === 'fragment') items.sort((a, b) => Number(b.id.slice(1)) - Number(a.id.slice(1)));
    else items.sort((a, b) => a.region - b.region);
    const grid = h('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(15rem, 1fr))' } });
    for (const c of items) {
      const have = p.data.everCollected.includes(c.id);
      const title = kind === 'fragment' ? t(c.id + '.title') : kind === 'record' ? t(c.id + '.title') : kind === 'lesson' ? t('ability.' + (c.ability ?? 0)) : t('col.echoes');
      const card = h(
        'button',
        { class: 'card' + (have ? '' : ' locked'), type: 'button' },
        h('div', { class: 'title' }, have ? title : t('col.unknown')),
        h('div', { class: 'desc' }, have ? (kind === 'echo' ? t(c.id) : t('region.' + c.region)) : kind === 'echo' ? t('col.unknown.hint.echo', { region: t('region.' + c.region) }) : t('col.unknown.hint.fragment', { region: t('region.' + c.region) })),
      );
      if (have && kind !== 'echo') card.addEventListener('click', () => ui.push('reader', c.id));
      grid.append(card);
    }
    return grid;
  };
  const tabList = [
    { id: 'letters', label: `${t('col.letters')} ${p.countCollected('fragment')}/${p.totals.fragment}` },
    { id: 'records', label: `${t('col.records')} ${p.countCollected('record')}/${p.totals.record}` },
    { id: 'echoes', label: `${t('col.echoes')} ${p.countCollected('echo')}/${p.totals.echo}` },
    { id: 'lessons', label: `${t('col.lessons')} ${p.countCollected('lesson')}/${p.totals.lesson}` },
    { id: 'achievements', label: `${t('col.achievements')} ${Object.keys(p.data.achievements).length}/${ACHIEVEMENTS.length}` },
    { id: 'stats', label: t('col.stats') },
  ];
  switch (collectionTab) {
    case 'letters':
      add(body, kindTab('fragment'));
      if (p.data.journeysCompleted > 0) {
        const aurel = h('button', { class: 'card', type: 'button', style: { marginTop: '0.8rem' } }, h('div', { class: 'title' }, t('f0.title')));
        aurel.addEventListener('click', () => ui.push('reader', GRANDPARENT_LETTER));
        add(body, aurel);
      }
      if (p.data.thirtyFirstLetter) {
        const mine = h('div', { class: 'letter', style: { marginTop: '0.8rem' } }, h('h3', null, t('ending.letter')), ...paragraphs(p.data.thirtyFirstLetter));
        add(body, mine);
      }
      break;
    case 'records':
      add(body, kindTab('record'));
      break;
    case 'echoes':
      add(body, kindTab('echo'));
      break;
    case 'lessons':
      add(body, kindTab('lesson'));
      break;
    case 'achievements': {
      const grid = h('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(17rem, 1fr))' } });
      for (const a of ACHIEVEMENTS) {
        const got = p.data.achievements[a.id];
        if (a.hidden && !got) continue;
        const prog = a.target ? p.data.achievementProgress[a.id] ?? 0 : null;
        grid.append(
          h(
            'div',
            { class: 'card' + (got ? ' selected' : ' locked'), 'data-nav': '' , tabindex: '0'},
            h('div', { class: 'title' }, t('ach.' + a.id)),
            h('div', { class: 'desc' }, t('ach.' + a.id + '.d')),
            prog !== null && !got ? h('div', { class: 'desc faint' }, `${fmtNumber(prog)} / ${fmtNumber(a.target!)}`) : null,
            got ? h('div', { class: 'desc', style: { color: 'var(--gold)' } }, new Date(got).toLocaleDateString()) : null,
          ),
        );
      }
      add(body, grid);
      break;
    }
    case 'stats': {
      const L = p.data.lifetime;
      const st: [string, string][] = [
        [t('stat.playTime'), fmtDuration(L.playTime)],
        [t('stat.climbed'), fmtNumber(L.climbed) + ' m'],
        [t('stat.fallen'), fmtNumber(L.fallen) + ' m'],
        [t('stat.majorFalls'), fmtNumber(L.majorFalls)],
        [t('stat.maxFall'), fmtNumber(L.maxFall) + ' m'],
        [t('stat.maxY'), fmtNumber(L.maxY) + ' m'],
        [t('stat.jumps'), fmtNumber(L.jumps)],
        [t('stat.wallRuns'), fmtNumber(L.wallRuns)],
        [t('stat.journeys'), fmtNumber(p.data.journeysCompleted)],
      ];
      add(body, ...st.map(([k, v]) => h('div', { class: 'setting' }, h('label', null, k), h('div', { class: 'control' }, v))));
      break;
    }
  }
  return h(
    'div',
    { class: 'screen full' },
    h(
      'div',
      { class: 'panel', style: { margin: 'auto', width: 'min(64rem, 100%)', height: '100%', display: 'flex', flexDirection: 'column' } },
      header(t('col.title'), () => ui.pop()),
      tabs(tabList, collectionTab, (id) => {
        collectionTab = id;
        ui.rerender();
      }),
      body,
    ),
  );
};

const reader: Build = (ctx, ui, arg) => {
  const id = String(arg);
  const c = ctx.world.collectibleById.get(id);
  const kind = id === 'f0' ? 'fragment' : c?.kind ?? 'fragment';
  let el: HTMLElement;
  if (kind === 'lesson') {
    el = h('div', { class: 'letter lesson' }, h('h3', null, t('ability.' + (c?.ability ?? 0))), ...paragraphs(t('lesson.' + id)));
  } else if (kind === 'record') {
    el = h('div', { class: 'letter record' }, h('h3', null, t(id + '.title')), ...paragraphs(t(id + '.body')));
  } else {
    el = h('div', { class: 'letter' }, h('h3', null, t(id + '.title')), ...paragraphs(t(id + '.body')));
    if (!ctx.profile.data.lettersRead.includes(id)) ctx.profile.data.lettersRead.push(id);
  }
  el.append(h('div', { style: { marginTop: '1.4rem', textAlign: 'right' } }, btn(t('common.close'), () => ui.pop(), { cls: 'small box', primary: true })));
  return h('div', { class: 'screen full' }, el);
};

/**
 * The thirty-first letter: with every Letter Down found, the climber writes the first Letter Up.
 * `arg` receives the text. The default text is there for anyone who cannot or would rather not
 * type (a controller, a phone held sideways): leaving it is a real answer too.
 */
const letterUp: Build = (ctx, ui, arg) => {
  const done = arg as (text: string) => void;
  const area = h('textarea', { class: 'letter-input', maxlength: 600, rows: 6, 'aria-label': t('ending.letter.prompt') });
  area.value = t('ending.letter.default');
  let sent = false;
  const send = () => {
    if (sent) return;
    sent = true;
    done(area.value.trim() || t('ending.letter.default'));
  };
  void ctx;
  void ui;
  return h(
    'div',
    { class: 'screen full' },
    h(
      'div',
      { class: 'letter' },
      h('h3', null, t('ending.letter')),
      h('p', { class: 'muted' }, t('ending.secret')),
      h('p', null, t('ending.letter.prompt')),
      area,
      h('div', { style: { marginTop: '1.2rem', textAlign: 'right' } }, btn(t('ending.letter.send'), send, { cls: 'small box', primary: true })),
    ),
  );
};

// ------------------------------------------------------------------ customize

let customizeSlot: Slot = 'outfit';

function howToGet(c: Cosmetic, ctx: UIContext): string {
  switch (c.source.kind) {
    case 'default':
      return t('cust.source.default');
    case 'achievement':
      return t('cust.source.achievement', { name: t('ach.' + c.source.id) });
    case 'medal':
      return t('cust.source.medal', { medal: t('medal.' + c.source.medal), trial: c.source.trial });
    case 'purchase': {
      const p = PRODUCT_BY_SKU.get(c.source.sku);
      void ctx;
      return t('cust.source.purchase') + (p ? ` · ${t(p.nameKey)}` : '');
    }
  }
}

const customize: Build = (ctx, ui) => {
  const p = ctx.profile;
  const body = h('div', { class: 'scroll grid', style: { flex: '1', gridTemplateColumns: 'repeat(auto-fill, minmax(13rem, 1fr))', alignContent: 'start' } });
  const items = COSMETICS.filter((c) => c.slot === customizeSlot);
  for (const c of items) {
    const owned = p.owns(c);
    const equipped = p.data.equipped[c.slot] === c.id;
    const swatch = c.look ? (c.look.jacket ?? c.look.scarf ?? c.look.shoes ?? c.look.gloves ?? 0x888888) : c.fx?.color ?? null;
    const card = h(
      'button',
      { class: 'card' + (owned ? '' : ' locked') + (equipped ? ' selected' : ''), type: 'button' },
      h('div', { class: 'row' }, swatch !== null ? h('span', { style: { width: '1rem', height: '1rem', borderRadius: '50%', background: '#' + swatch.toString(16).padStart(6, '0'), border: '1px solid rgba(255,255,255,.3)' } }) : null, h('div', { class: 'title' }, t(c.slot === 'title' ? c.id : 'cos.' + c.id))),
      h('div', { class: 'desc' }, equipped ? t('common.equipped') : owned ? t('common.equip') : t('cust.locked', { how: howToGet(c, ctx) })),
    );
    card.addEventListener('focus', () => ctx.previewLook(c.id));
    card.addEventListener('mouseenter', () => ctx.previewLook(c.id));
    card.addEventListener('click', () => {
      if (!owned) {
        if (c.source.kind === 'purchase') ui.push('store');
        else ctx.playUi('error');
        return;
      }
      p.equip(c.slot, c.id);
      ctx.saveNow();
      ctx.previewLook(null);
      ctx.playUi('select');
      ui.rerender();
    });
    add(body, card);
  }
  return h(
    'div',
    { class: 'screen dim' },
    h(
      'div',
      { class: 'panel', style: { width: 'min(40rem, 100%)', height: '100%', display: 'flex', flexDirection: 'column' } },
      header(t('cust.title'), () => {
        ctx.previewLook(null);
        ui.pop();
      }),
      tabs(
        SLOTS.map((s) => ({ id: s, label: t(s === 'title' ? 'cust.title.slot' : 'cust.' + s) })),
        customizeSlot,
        (id) => {
          customizeSlot = id as Slot;
          ui.rerender();
        },
      ),
      body,
    ),
  );
};

// ------------------------------------------------------------------ store

const store: Build = (ctx, ui) => {
  const list = h('div', { class: 'scroll grid', style: { flex: '1', gridTemplateColumns: 'repeat(auto-fill, minmax(16rem, 1fr))', alignContent: 'start' } }, h('div', { class: 'muted' }, t('common.loading')));
  const status = h('div', { class: 'muted', style: { minHeight: '1.4rem', fontSize: '0.88rem' } });
  const ready = ctx.storeReady();
  const load = async () => {
    const prods = ready ? await ctx.storeProducts().catch(() => []) : [];
    clear(list);
    const priceOf = new Map(prods.map((p) => [p.sku, p]));
    const pending = new Set(ctx.pendingPurchases());
    for (const prod of PRODUCTS) {
      const sp = priceOf.get(prod.sku);
      const owned = prod.grants.every((g) => ctx.profile.data.owned.includes(g));
      // a single item says what kind of thing it is; a bundle lists what is inside
      const slot = prod.grants[0].split('.')[0];
      const contents = prod.bundle ? t('store.bundle.contains', { items: prod.grants.map((g) => t('cos.' + g)).join(', ') }) : t(slot === 'title' ? 'cust.title.slot' : 'cust.' + slot);
      const card = h(
        'button',
        { class: 'card' + (owned ? ' selected' : ''), type: 'button' },
        h('div', { class: 'title' }, t(prod.nameKey)),
        h('div', { class: 'desc' }, contents),
        h('div', { class: 'desc', style: { marginTop: '0.5rem', color: owned ? 'var(--gold)' : 'var(--chalk)' } }, owned ? t('store.owned') : pending.has(prod.sku) ? t('store.pending') : sp?.available ? t('store.buy', { price: sp.priceText }) : '—'),
      );
      card.addEventListener('focus', () => ctx.previewLook(prod.grants[0]));
      card.addEventListener('click', async () => {
        if (owned || !sp?.available || pending.has(prod.sku)) return;
        status.textContent = t('store.verifying');
        const r = await ctx.purchase(prod.sku);
        switch (r.status) {
          case 'success':
            status.textContent = t('store.success', { name: t(prod.nameKey) });
            ctx.playUi('unlock');
            break;
          case 'pending':
            status.textContent = t('store.pending');
            break;
          case 'cancelled':
            status.textContent = t('store.cancelled');
            break;
          case 'failed':
            status.textContent = t('store.failed');
            ctx.playUi('error');
            break;
          case 'unavailable':
            status.textContent = t('store.unavailable');
            break;
        }
        load();
      });
      list.append(card);
    }
  };
  load();
  return h(
    'div',
    { class: 'screen dim' },
    h(
      'div',
      { class: 'panel', style: { width: 'min(52rem, 100%)', height: '100%', display: 'flex', flexDirection: 'column' } },
      header(t('store.title'), () => {
        ctx.previewLook(null);
        ui.pop();
      }),
      h('p', { class: 'muted', style: { fontSize: '0.88rem', lineHeight: '1.45', marginTop: '0' } }, t('store.note')),
      ctx.storePlatform() === 'mock' ? h('p', { class: 'faint', style: { fontSize: '0.8rem' } }, t('store.testMode')) : null,
      !ready ? h('p', { class: 'muted' }, t('store.unavailable')) : null,
      status,
      list,
      h(
        'div',
        { class: 'row', style: { marginTop: '0.8rem' } },
        h('span', { class: 'faint', style: { fontSize: '0.78rem' } }, t('store.price.local')),
        h('div', { class: 'spacer' }),
        btn(t('store.restore'), async () => {
          status.textContent = t('store.verifying');
          const n = await ctx.restorePurchases();
          status.textContent = t('store.restored', { n });
          load();
        }, { cls: 'small box', disabled: !ready }),
      ),
    ),
  );
};

// ------------------------------------------------------------------ trials

let trialTab = 'regions';
let trialGhost: GhostChoice = 'pb';

const trials: Build = (ctx, ui) => {
  const p = ctx.profile;
  const finished = p.data.journeysCompleted > 0;
  const body = h('div', { class: 'scroll', style: { flex: '1' } });
  const ghostChoice = choice(
    [
      { v: 'pb', label: t('trial.ghost.pb') },
      { v: 'last', label: t('trial.ghost.last') },
      { v: 'top', label: t('trial.ghost.top') },
      { v: 'none', label: t('trial.ghost.none') },
    ] as { v: GhostChoice; label: string }[],
    trialGhost,
    (v) => (trialGhost = v),
  );
  if (trialTab === 'regions') {
    const grid = h('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(17rem, 1fr))' } });
    for (const tr of ctx.world.trials) {
      const unlocked = finished || p.data.regionsReached >= tr.region;
      const rec = p.data.trials[tr.id];
      const medal = rec?.medal ?? 'none';
      const card = h(
        'button',
        { class: 'card' + (unlocked ? '' : ' locked'), type: 'button' },
        h('div', { class: 'title' }, h('span', { class: 'medal ' + medal }), `${String(tr.region + 1).padStart(2, '0')} · ${t(tr.nameKey)}`),
        h('div', { class: 'desc' }, t('region.' + tr.region)),
        h('div', { class: 'desc' }, unlocked ? (rec && isFinite(rec.bestTime) ? t('trial.best', { time: fmtTime(rec.bestTime) }) : t('trial.noBest')) : t('menu.locked.trial')),
        unlocked
          ? h(
              'div',
              { class: 'desc faint' },
              `${t('medal.gold')} ${fmtTime(tr.medals.gold)} · ${t('medal.perfect')} ${fmtTime(tr.medals.perfect)}`,
            )
          : null,
      );
      if (unlocked) card.addEventListener('click', () => ctx.startTrial(tr.id, trialGhost));
      grid.append(card);
    }
    add(body, row(t('trial.ghost'), ghostChoice), grid);
  } else if (trialTab === 'speedrun') {
    add(body, 
      h('p', { class: 'muted', style: { lineHeight: '1.5' } }, t('speedrun.desc')),
      p.data.speedrunBest ? h('p', null, t('trial.best', { time: fmtTime(p.data.speedrunBest) })) : null,
      btn(t('common.start'), () => ctx.startJourney('standard', false, true), { primary: true, cls: 'box', locked: !finished }),
      !finished ? h('p', { class: 'faint' }, t('menu.locked.ngplus')) : null,
    );
  } else {
    add(body, h('p', { class: 'muted' }, t('nofall.desc')));
    const grid = h('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(14rem, 1fr))' } });
    for (let r = 0; r < ctx.world.regions.length; r++) {
      const c = h('button', { class: 'card' + (finished ? '' : ' locked'), type: 'button' }, h('div', { class: 'title' }, `${String(r + 1).padStart(2, '0')} · ${t('region.' + r)}`));
      if (finished) c.addEventListener('click', () => ctx.startNoFall(r));
      grid.append(c);
    }
    add(body, grid, !finished ? h('p', { class: 'faint' }, t('menu.locked.ngplus')) : null);
  }
  return h(
    'div',
    { class: 'screen full' },
    h(
      'div',
      { class: 'panel', style: { margin: 'auto', width: 'min(64rem, 100%)', height: '100%', display: 'flex', flexDirection: 'column' } },
      header(t('trial.title'), () => ui.pop()),
      tabs(
        [
          { id: 'regions', label: t('trial.select') },
          { id: 'speedrun', label: t('speedrun.title') },
          { id: 'nofall', label: t('nofall.title') },
        ],
        trialTab,
        (id) => {
          trialTab = id;
          ui.rerender();
        },
      ),
      body,
    ),
  );
};

// ------------------------------------------------------------------ daily

const daily: Build = (ctx, ui) => {
  const route = ctx.daily();
  const rec = route ? ctx.profile.data.daily[route.date] : undefined;
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const left = Math.max(0, (next.getTime() - now.getTime()) / 1000);
  const lbBox = h('div', { class: 'scroll', style: { flex: '1', minHeight: '10rem' } }, h('div', { class: 'muted' }, t('common.loading')));
  if (route) {
    ctx.leaderboard('daily', route.date, 'global').then((rows) => fillBoard(lbBox, rows, ctx, undefined, 'lb.offline.short'));
  }
  return h(
    'div',
    { class: 'screen full' },
    h(
      'div',
      { class: 'panel', style: { margin: 'auto', width: 'min(48rem, 100%)', height: '100%', display: 'flex', flexDirection: 'column' } },
      header(t('daily.title'), () => ui.pop()),
      route
        ? h(
            'div',
            null,
            h('p', null, t('daily.route', { region: t('region.' + route.region) })),
            h('p', { class: 'muted' }, `${t('daily.gates', { n: route.gates.length + 1 })} · ${t('daily.mod.' + route.modifier)}`),
            h('p', { class: 'faint' }, t('daily.resets', { time: `${Math.floor(left / 3600)}h ${Math.floor((left % 3600) / 60)}m` })),
            h('p', null, rec ? [t('daily.best', { score: fmtNumber(rec.bestScore) }), ' · ', t('daily.attempts', { n: rec.attempts })] : t('daily.none')),
            btn(t('common.start'), () => ctx.startDaily(), { primary: true, cls: 'box' }),
          )
        : h('p', { class: 'muted' }, t('menu.locked.ngplus')),
      h('h3', null, t('lb.daily')),
      lbBox,
    ),
  );
};

function fillBoard(box: HTMLElement, rows: import('./context').LeaderboardEntry[] | null, ctx: UIContext, trialId?: string, offlineKey = 'lb.offline'): void {
  clear(box);
  if (rows === null) {
    box.append(h('p', { class: 'muted' }, t(offlineKey)));
    return;
  }
  if (!rows.length) {
    box.append(h('p', { class: 'muted' }, t('lb.empty')));
    return;
  }
  for (const r of rows) {
    const line = h(
      'div',
      { class: 'setting', style: r.you ? { color: 'var(--gold)' } : undefined },
      h('label', null, `${r.rank}. ${r.you ? t('lb.you') : r.name}`),
      h('div', { class: 'control' }, r.valueText, r.replayId && trialId ? btn(t('lb.race'), () => ctx.raceReplay(r.replayId!, trialId), { cls: 'small' }) : null),
    );
    box.append(line);
  }
}

// ------------------------------------------------------------------ leaderboards

let lbKind: 'daily' | 'weekly' | 'trial' | 'speedrun' = 'trial';
let lbScope: 'global' | 'friends' = 'global';
let lbTrial = 'trial.r1';

const leaderboards: Build = (ctx, ui) => {
  const box = h('div', null, h('div', { class: 'muted' }, t('common.loading')));
  const route = ctx.daily();
  const id = lbKind === 'trial' ? lbTrial : lbKind === 'daily' ? route?.date ?? '' : lbKind === 'weekly' ? route?.week ?? '' : 'any';
  ctx.leaderboard(lbKind, id, lbScope).then((rows) => fillBoard(box, rows, ctx, lbKind === 'trial' ? lbTrial : undefined));
  // the player's own records for the board being shown, available offline
  const personal = h('div', null, h('h3', null, t('lb.personal')));
  const line = (label: Node | string, value: string) => personal.append(h('div', { class: 'setting' }, h('label', null, label), h('div', { class: 'control' }, value)));
  const data = ctx.profile.data;
  if (lbKind === 'trial') {
    for (const tr of ctx.world.trials) {
      const rec = data.trials[tr.id];
      if (!rec || !isFinite(rec.bestTime)) continue;
      line(h('span', null, h('span', { class: 'medal ' + rec.medal }), t(tr.nameKey)), fmtTime(rec.bestTime));
    }
  } else if (lbKind === 'daily') {
    const rec = route ? data.daily[route.date] : undefined;
    if (rec) line(t('daily.route', { region: t('region.' + route!.region) }), fmtNumber(rec.bestScore));
  } else if (lbKind === 'weekly') {
    const days = Object.entries(data.daily).filter(([date]) => route && weekKey(new Date(date + 'T12:00:00Z')) === route.week);
    if (days.length) line(t('lb.weekly'), fmtNumber(days.reduce((m, [, r]) => m + r.bestScore, 0)));
  } else if (data.speedrunBest !== null) {
    line(t('lb.speedrun'), fmtTime(data.speedrunBest));
  }
  if (personal.childElementCount === 1) personal.append(h('p', { class: 'muted' }, t('lb.personal.none')));
  const trialPick =
    lbKind === 'trial'
      ? row(
          t('trial.select'),
          choice(
            ctx.world.trials.map((tr) => ({ v: tr.id, label: t(tr.nameKey) })),
            lbTrial,
            (v) => {
              lbTrial = v;
              ui.rerender();
            },
          ),
        )
      : null;
  return h(
    'div',
    { class: 'screen full' },
    h(
      'div',
      { class: 'panel', style: { margin: 'auto', width: 'min(52rem, 100%)', height: '100%', display: 'flex', flexDirection: 'column' } },
      header(t('lb.title'), () => ui.pop()),
      tabs(
        [
          { id: 'trial', label: t('lb.trials') },
          { id: 'daily', label: t('lb.daily') },
          { id: 'weekly', label: t('lb.weekly') },
          { id: 'speedrun', label: t('lb.speedrun') },
        ],
        lbKind,
        (k) => {
          lbKind = k as typeof lbKind;
          ui.rerender();
        },
      ),
      h(
        'div',
        { class: 'row' },
        choice(
          [
            { v: 'global', label: t('lb.global') },
            { v: 'friends', label: t('lb.friends') },
          ] as { v: 'global' | 'friends'; label: string }[],
          lbScope,
          (v) => {
            lbScope = v;
            ui.rerender();
          },
        ),
      ),
      trialPick,
      h('div', { class: 'scroll', style: { flex: '1' } }, box, personal),
    ),
  );
};

// ------------------------------------------------------------------ pause & results

const pause: Build = (ctx, ui, arg) => {
  const info = arg as { mode: string; stats: string } | undefined;
  const story = info?.mode === 'story';
  const items = [
    btn(t('pause.resume'), () => ctx.resume(), { primary: true }),
    story ? btn(t('pause.recall'), () => {
      if (ctx.recall()) ctx.resume();
      else ui.toast(t('pause.recall.locked'));
    }, { sub: ctx.canRecall() ? undefined : t('pause.recall.locked'), locked: !ctx.canRecall() }) : btn(t('pause.restart'), () => ctx.restartRun()),
    story ? btn(t('pause.journal'), () => ui.push('collection')) : null,
    btn(t('pause.settings'), () => ui.push('settings')),
    btn(story ? t('pause.quit') : t('pause.quit.trial'), () => ctx.quitToMenu()),
  ];
  return h(
    'div',
    { class: 'screen dim' },
    h('div', { class: 'menu-col' }, h('h2', null, t('pause.title')), info?.stats ? h('p', { class: 'muted' }, info.stats) : null, h('nav', { class: 'menu' }, items)),
  );
};

const results: Build = (ctx, ui, arg) => {
  const r = arg as TrialResultView;
  const stat = (k: string, v: string) => h('div', { class: 'setting' }, h('label', null, k), h('div', { class: 'control' }, v));
  const submit = r.submit === 'none' ? null : h('p', { class: 'faint' }, t('trial.submit.' + r.submit));
  return h(
    'div',
    { class: 'screen dim' },
    h(
      'div',
      { class: 'panel', style: { margin: 'auto', width: 'min(34rem, 100%)' } },
      h('h2', null, r.title),
      r.pb ? h('p', { style: { color: 'var(--gold)', letterSpacing: '0.2em' } }, t('trial.newpb')) : null,
      h('div', { style: { fontSize: '3rem', fontWeight: '200', margin: '0.4rem 0 1rem' } }, fmtTime(r.seconds)),
      !r.daily ? h('p', null, h('span', { class: 'medal ' + r.medal }), t('medal.' + r.medal)) : null,
      stat(t('trial.falls'), String(r.falls)),
      stat(t('trial.risk'), '×' + r.maxMult.toFixed(1)),
      stat(t('trial.efficiency'), Math.round(r.efficiency * 100) + '%'),
      stat(t('trial.route'), t('trial.route.' + r.route)),
      stat(t('trial.score'), fmtNumber(r.score)),
      r.splits.length > 1 ? stat(t('hud.split', { n: '' }).trim(), r.splits.map((s) => fmtTime(s)).join(' · ')) : null,
      submit,
      h(
        'div',
        { class: 'row', style: { justifyContent: 'flex-end', marginTop: '1rem', flexWrap: 'wrap' } },
        btn(t('pause.quit.trial'), () => ctx.quitToMenu(), { cls: 'small box' }),
        btn(t('trial.retry'), () => ctx.restartRun(), { cls: 'small box', primary: true }),
      ),
    ),
  );
};

const credits: Build = (_ctx, ui) =>
  h('div', { class: 'screen full' }, h('div', { class: 'panel', style: { margin: 'auto', maxWidth: '36rem', whiteSpace: 'pre-line', lineHeight: '1.6' } }, header(t('menu.credits'), () => ui.pop()), t('credits.body')));

export const SCREENS: Record<ScreenName, Build> = {
  main: mainMenu,
  new: newJourney,
  ngplus: ngPlus,
  settings,
  collection,
  customize,
  store,
  leaderboards,
  trials,
  daily,
  pause,
  results,
  reader,
  letterUp,
  credits,
};


