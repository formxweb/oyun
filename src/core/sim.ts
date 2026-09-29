import type { SimEvent } from './events';
import { toWorld } from './collision';
import { Btn, type InputFrame } from './input';
import { dsin, type V3 } from './math';
import { Mode, PlayerController, newExt, newPlayer, type ExtForces, type PlayerState } from './player';
import { newRisk, riskStep, type RiskState } from './scoring';
import { T, ticks } from './tuning';
import type { Anchor, Collectible, MemoryTrigger, TrialDef, Zone } from './world/types';
import { CRUMBLE_DELAY, CRUMBLE_RESPAWN, TICK_RATE, newWorldState, type World, type WorldState } from './world/world';

export type SimMode = 'story' | 'trial' | 'daily' | 'speedrun';

export interface SimConfig {
  mode: SimMode;
  abilities: number;
  flags: string[];
  collected: string[];
  litAnchors: string[];
  lastAnchor: string | null;
  spawn: { pos: V3; yaw: number };
  /** Guided assist: return to the last anchor at any time. */
  recallAnywhere: boolean;
  ngPlus: boolean;
  trial?: TrialDef;
  /** Daily Summit / custom gate list (overrides trial gates when provided). */
  gates?: { pos: V3; r: number }[];
  finish?: { pos: V3; r: number };
  /** Daily Summit crosswind modifier: steady gusting acceleration (m/s^2). */
  wind?: { x: number; z: number };
}

export interface SimStats {
  jumps: number;
  majorFalls: number;
  fallDistance: number;
  maxFall: number;
  climbed: number;
  maxY: number;
  distance: number;
  wallRuns: number;
  slides: number;
  vaults: number;
  mantles: number;
  rolls: number;
  respawns: number;
  longestChain: number;
}

const newStats = (y: number): SimStats => ({
  jumps: 0,
  majorFalls: 0,
  fallDistance: 0,
  maxFall: 0,
  climbed: 0,
  maxY: y,
  distance: 0,
  wallRuns: 0,
  slides: 0,
  vaults: 0,
  mantles: 0,
  rolls: 0,
  respawns: 0,
  longestChain: 0,
});

export interface SimSnapshot {
  player: PlayerState;
  flags: string[];
  flagTick: [string, number][];
  crumble: [number, number][];
  fallActive: boolean;
  risk: RiskState;
  stats: SimStats;
  collected: string[];
  lit: string[];
  lastAnchor: string | null;
  abilities: number;
  tick: number;
  region: number;
  area: string | null;
  trial: TrialRun | null;
  pending: { flag: string; at: number; trigger: string }[];
  prevBtn: number;
  fired: string[];
  standTicks: [string, number][];
  catchCooldown: number;
  lastGroundY: number;
}

export interface TrialRun {
  def: TrialDef | null;
  gates: { pos: V3; r: number }[];
  finish: { pos: V3; r: number };
  gate: number;
  finished: boolean;
  finishTick: number;
  masterHit: Set<number>;
  splits: number[];
}

/**
 * The deterministic game simulation. Given the same world, config and input stream it
 * produces identical results everywhere (client, ghost playback, server verification).
 */
export class Simulation {
  readonly player: PlayerState;
  readonly st: WorldState;
  readonly ctrl: PlayerController;
  readonly risk: RiskState;
  readonly stats: SimStats;
  readonly collected: Set<string>;
  readonly lit: Set<string>;
  lastAnchor: string | null;
  abilities: number;
  tick = 0;
  events: SimEvent[] = [];
  region: number;
  area: string | null = null;
  trial: TrialRun | null = null;
  /** Memory flags waiting for their delay. */
  private pending: { flag: string; at: number; trigger: string }[] = [];
  private readonly ext: ExtForces = newExt();
  private lastGroundY: number;
  private prevBtn = 0;
  private pressedBtn = 0;
  private readonly firedTriggers = new Set<string>();
  private standTicks = new Map<string, number>();
  private catchCooldown = 0;

  constructor(
    readonly world: World,
    readonly cfg: SimConfig,
  ) {
    this.st = newWorldState(cfg.flags);
    this.collected = new Set(cfg.collected);
    this.lit = new Set(cfg.litAnchors);
    this.lastAnchor = cfg.lastAnchor;
    this.abilities = cfg.abilities;
    const sp = cfg.spawn;
    this.player = newPlayer(sp.pos.x, sp.pos.y, sp.pos.z, sp.yaw);
    this.ctrl = new PlayerController(world);
    this.risk = newRisk(sp.pos.y);
    this.stats = newStats(sp.pos.y);
    this.lastGroundY = sp.pos.y;
    this.region = world.regionAt(sp.pos.y);
    for (const t of world.triggers) if (this.st.flags.has(t.flag)) this.firedTriggers.add(t.id);
    if (cfg.trial || cfg.gates) {
      const def = cfg.trial ?? null;
      this.trial = {
        def,
        gates: cfg.gates ?? def?.gates ?? [],
        finish: cfg.finish ?? def!.finish,
        gate: 0,
        finished: false,
        finishTick: 0,
        masterHit: new Set(),
        splits: [],
      };
    }
    world.applyMovers(0, this.st);
  }

  get seconds(): number {
    return this.tick / TICK_RATE;
  }

  step(inp: InputFrame): void {
    const w = this.world;
    const p = this.player;
    this.events = [];
    const ev = this.events;
    this.tick++;
    const tick = this.tick;
    const st = this.st;
    this.pressedBtn = inp.btn & ~this.prevBtn;
    this.prevBtn = inp.btn;

    // Pending memory changes.
    if (this.pending.length) {
      for (let i = this.pending.length - 1; i >= 0; i--) {
        const pf = this.pending[i];
        if (tick >= pf.at) {
          this.setFlag(pf.flag);
          ev.push({ k: 'memory', trigger: pf.trigger, flag: pf.flag });
          this.pending.splice(i, 1);
        }
      }
    }
    // Crumble cleanup.
    if (st.crumble.size) {
      for (const [id, t0] of st.crumble) if (tick - t0 >= CRUMBLE_DELAY + CRUMBLE_RESPAWN) st.crumble.delete(id);
    }

    w.applyMovers(tick, st);

    // Zones -> external forces.
    this.computeZones();

    const px0 = p.x;
    const py0 = p.y;
    const pz0 = p.z;
    this.ctrl.step(p, inp, st, tick, this.abilities, this.ext, ev);

    // Recall to anchor.
    if (this.pressedBtn & Btn.Recall && this.cfg.mode === 'story') this.tryRecall();

    // Crushed by machinery.
    if (p.squish === 0 && this.ctrl.isCrushed(p)) {
      p.squish = ticks(1);
      this.respawn('squish');
    }
    // Out of the world.
    if (p.y < -40) this.respawn('void');

    // Stats.
    const dx = p.x - px0;
    const dy = p.y - py0;
    const dz = p.z - pz0;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < 5) this.stats.distance += d;
    if (p.y > this.stats.maxY) this.stats.maxY = p.y;
    if (p.grounded) {
      if (p.y > this.lastGroundY) this.stats.climbed += p.y - this.lastGroundY;
      this.lastGroundY = p.y;
    }
    for (const e of ev) {
      switch (e.k) {
        case 'jump':
          this.stats.jumps++;
          break;
        case 'fallEnd':
          if (e.dist > T.majorFallDrop && !e.caught) {
            this.stats.majorFalls++;
            this.stats.fallDistance += e.dist;
            if (e.dist > this.stats.maxFall) this.stats.maxFall = e.dist;
          }
          break;
        case 'wallrun':
          if (e.start) this.stats.wallRuns++;
          break;
        case 'slide':
          if (e.start) this.stats.slides++;
          break;
        case 'vault':
          this.stats.vaults++;
          break;
        case 'mantle':
          this.stats.mantles++;
          break;
        case 'roll':
          this.stats.rolls++;
          break;
        case 'netFound':
          this.setFlag(e.tag);
          break;
      }
    }

    // Region change.
    const r = w.regionAt(p.y);
    if (r !== this.region && p.grounded) {
      this.region = r;
      ev.push({ k: 'region', index: r });
    }

    this.checkAnchors();
    this.checkCollectibles();
    this.checkTriggers();
    this.checkTrial();

    const anchorY = this.lastAnchor ? (w.anchorById.get(this.lastAnchor)?.pos.y ?? p.y) : this.cfg.spawn.pos.y;
    const hs = Math.sqrt(p.vx * p.vx + p.vz * p.vz);
    riskStep(this.risk, ev, p.x, p.y, p.z, hs, p.grounded, anchorY);
    if (this.risk.chain > this.stats.longestChain) this.stats.longestChain = this.risk.chain;
  }

  // ---------------------------------------------------------------- zones

  private computeZones(): void {
    const e = this.ext;
    e.ax = e.ay = e.az = 0;
    e.launch = 0;
    e.shiftAllowed = false;
    e.shiftDuration = 0;
    e.gravReset = false;
    e.kx = e.ky = e.kz = 0;
    const p = this.player;
    const w = this.world;
    const t = this.tick / TICK_RATE;
    // body centre, whichever way gravity currently points
    const [ox, oy, oz] = p.frame === 0 ? [0, 0.9, 0] : toWorld(p.frame, 0, 0.9, 0);
    const cx = p.x + ox;
    const cy = p.y + oy;
    const cz = p.z + oz;
    let area: string | null = null;
    for (const z of w.zones) {
      const inside = cx >= z.min.x && cx <= z.max.x && cy >= z.min.y && cy <= z.max.y && cz >= z.min.z && cz <= z.max.z;
      if (z.kind === 'lightning') {
        // Strikes happen whether or not the player is inside (visible to all).
        const per = ticks(z.period);
        const ph = ticks(z.phase);
        if (per > 0 && (this.tick + ph) % per === 0 && Math.abs(cy - (z.min.y + z.max.y) / 2) < 120) {
          if (!w.isZoneActive(z, this.st)) continue;
          this.events.push({ k: 'lightning', zone: z.id, hit: inside });
          if (inside) {
            const mx = (z.min.x + z.max.x) / 2;
            const mz = (z.min.z + z.max.z) / 2;
            let ox = cx - mx;
            let oz = cz - mz;
            const l = Math.sqrt(ox * ox + oz * oz) || 1;
            ox /= l;
            oz /= l;
            e.kx += ox * z.strength;
            e.kz += oz * z.strength;
            e.ky += 5;
          }
        }
        continue;
      }
      if (!inside || !w.isZoneActive(z, this.st)) continue;
      switch (z.kind) {
        case 'wind': {
          const g = z.period > 0 ? 0.55 + 0.45 * dsin(((t + z.phase) / z.period) * 6.283185307179586) : 1;
          e.ax += z.dir.x * z.strength * g;
          e.ay += z.dir.y * z.strength * g;
          e.az += z.dir.z * z.strength * g;
          break;
        }
        case 'updraft':
          if (p.vy < 13 && p.frame === 0) e.ay += z.strength;
          break;
        case 'vent': {
          const per = z.period;
          const u = per > 0 ? (t + z.phase) % per : 0;
          if (per === 0 || u < z.active) {
            e.launch = Math.max(e.launch, z.strength);
            if (per > 0 && u < 1 / TICK_RATE + 1e-9) this.events.push({ k: 'vent', zone: z.id });
          }
          break;
        }
        case 'shift':
          e.shiftAllowed = true;
          e.shiftDuration = Math.max(e.shiftDuration, z.active || 8);
          break;
        case 'gravityReset':
          e.gravReset = true;
          break;
        case 'trigger':
          if (z.key && !this.st.flags.has(z.key)) {
            this.setFlag(z.key);
            this.events.push({ k: 'flag', flag: z.key });
          }
          break;
        case 'area':
          area = z.key;
          break;
        case 'void':
          if (this.catchCooldown === 0) this.respawn('void');
          break;
      }
    }
    if (this.catchCooldown > 0) this.catchCooldown--;
    if (area !== null && area !== this.area) {
      this.area = area;
      this.events.push({ k: 'area', key: area });
    }
    if (this.cfg.wind) {
      const g = 0.6 + 0.4 * dsin(t * 0.9);
      e.ax += this.cfg.wind.x * g;
      e.az += this.cfg.wind.z * g;
    }
    // The Wind Wall: an invisible-free boundary made of visible air currents that keeps
    // climbers inside the city's footprint so falls always land on architecture.
    const meta = w.regions[w.regionAt(p.y)];
    if (meta) {
      const ox = p.x - meta.center.x;
      const oz = p.z - meta.center.z;
      const dd = Math.sqrt(ox * ox + oz * oz);
      if (dd > meta.radius) {
        const k = Math.min(3, (dd - meta.radius) / 6 + 1);
        e.ax -= (ox / dd) * T.windWallAccel * k;
        e.az -= (oz / dd) * T.windWallAccel * k;
      }
    }
  }

  // ---------------------------------------------------------------- progression hooks

  /** A memory trigger has fired and this flag is waiting out its delay. */
  isPending(flag: string): boolean {
    return this.pending.some((p) => p.flag === flag);
  }

  setFlag(flag: string): void {
    if (this.st.flags.has(flag)) return;
    this.st.flags.add(flag);
    this.st.flagTick.set(flag, this.tick);
  }

  private checkAnchors(): void {
    if (this.cfg.mode !== 'story') return;
    const p = this.player;
    for (const a of this.world.anchors) {
      if (Math.abs(a.region - this.region) > 1) continue;
      const dx = p.x - a.pos.x;
      const dy = p.y - a.pos.y;
      const dz = p.z - a.pos.z;
      if (dx * dx + dz * dz > T.anchorRadius * T.anchorRadius || dy < -0.6 || dy > 2.2) continue;
      if (this.lastAnchor === a.id) continue;
      const first = !this.lit.has(a.id);
      this.lit.add(a.id);
      this.lastAnchor = a.id;
      this.events.push({ k: 'anchor', id: a.id, first });
    }
  }

  private checkCollectibles(): void {
    if (this.cfg.mode !== 'story') return;
    const p = this.player;
    // body centre in the current gravity frame
    const [ox, oy, oz] = p.frame === 0 ? [0, 0.9, 0] : toWorld(p.frame, 0, 0.9, 0);
    const cy = p.y + oy;
    for (const c of this.world.collectibles) {
      if (this.collected.has(c.id)) continue;
      if (Math.abs(c.region - this.region) > 1) continue;
      if (c.show !== null && !this.st.flags.has(c.show)) continue;
      if (c.hide !== null && this.st.flags.has(c.hide)) continue;
      const isEcho = c.kind === 'echo';
      if (isEcho && !p.majorFall) continue;
      const r = isEcho ? T.echoRadius : T.collectRadius;
      const dx = p.x + ox - c.pos.x;
      const dy = cy - c.pos.y;
      const dz = p.z + oz - c.pos.z;
      if (dx * dx + dy * dy + dz * dz > r * r) continue;
      this.collect(c);
    }
  }

  private collect(c: Collectible): void {
    this.collected.add(c.id);
    this.events.push({ k: 'collect', id: c.id, kind: c.kind });
    if (c.kind === 'lesson' && c.ability) {
      this.abilities |= c.ability;
      this.events.push({ k: 'ability', ability: c.ability });
    }
  }

  private countCollected(kind: string, region: number): number {
    let n = 0;
    for (const id of this.collected) {
      const c = this.world.collectibleById.get(id);
      if (!c) continue;
      if (kind !== 'any' && c.kind !== kind) continue;
      if (region >= 0 && c.region !== region) continue;
      n++;
    }
    return n;
  }

  private checkTriggers(): void {
    const pressedInteract = (this.pressedBtn & Btn.Interact) !== 0;
    for (const t of this.world.triggers) {
      if (this.firedTriggers.has(t.id)) continue;
      if (Math.abs(t.region - this.region) > 1 && t.cond.type !== 'collect' && t.cond.type !== 'flags') continue;
      if (t.ngPlusOnly && !this.cfg.ngPlus) continue;
      if (t.storyOnly && this.cfg.ngPlus) continue;
      if (this.cfg.mode !== 'story') continue;
      if (this.evalCond(t, pressedInteract)) this.fire(t);
    }
  }

  private evalCond(t: MemoryTrigger, pressedInteract: boolean): boolean {
    const p = this.player;
    const c = t.cond;
    switch (c.type) {
      case 'land':
        for (const e of this.events) {
          if (e.k !== 'land' || e.fall < c.minFall) continue;
          const so = this.world.solids[p.groundId];
          if (so && so.tag === c.tag) return true;
        }
        return false;
      case 'enter':
        return p.x >= c.min.x && p.x <= c.max.x && p.y >= c.min.y && p.y <= c.max.y && p.z >= c.min.z && p.z <= c.max.z;
      case 'anchor':
        return this.lit.has(c.anchor);
      case 'fallPass': {
        if (!p.majorFall) return false;
        const dx = p.x - c.pos.x;
        const dy = p.y - c.pos.y;
        const dz = p.z - c.pos.z;
        return dx * dx + dy * dy + dz * dz <= c.radius * c.radius;
      }
      case 'collect':
        return this.countCollected(c.kind, c.region) >= c.count;
      case 'flags':
        return c.all.every((f) => this.st.flags.has(f));
      case 'interact': {
        if (!pressedInteract) return false;
        const dx = p.x - c.pos.x;
        const dy = p.y + 1 - c.pos.y;
        const dz = p.z - c.pos.z;
        return dx * dx + dy * dy + dz * dz <= c.radius * c.radius;
      }
      case 'stand': {
        const so = p.grounded ? this.world.solids[p.groundId] : null;
        const on = so !== null && so !== undefined && so.tag === c.tag;
        const n = on ? (this.standTicks.get(t.id) ?? 0) + 1 : 0;
        this.standTicks.set(t.id, n);
        return n >= ticks(c.seconds);
      }
      case 'height':
        return p.y >= c.y && p.grounded;
    }
  }

  private fire(t: MemoryTrigger): void {
    this.firedTriggers.add(t.id);
    if (t.delay > 0) this.pending.push({ flag: t.flag, at: this.tick + ticks(t.delay), trigger: t.id });
    else {
      this.setFlag(t.flag);
      this.events.push({ k: 'memory', trigger: t.id, flag: t.flag });
    }
  }

  private checkTrial(): void {
    const tr = this.trial;
    if (!tr || tr.finished) return;
    const p = this.player;
    const cy = p.y + 0.9;
    const hit = (g: { pos: V3; r: number }): boolean => {
      const dx = p.x - g.pos.x;
      const dy = cy - g.pos.y;
      const dz = p.z - g.pos.z;
      return dx * dx + dy * dy + dz * dz <= g.r * g.r;
    };
    if (tr.def) {
      tr.def.master.forEach((g, i) => {
        if (!tr.masterHit.has(i) && hit(g)) {
          tr.masterHit.add(i);
          this.events.push({ k: 'master', index: i });
        }
      });
    }
    if (tr.gate < tr.gates.length) {
      if (hit(tr.gates[tr.gate])) {
        tr.splits.push(this.tick);
        this.events.push({ k: 'gate', index: tr.gate });
        tr.gate++;
      }
      return;
    }
    if (hit(tr.finish)) {
      tr.finished = true;
      tr.finishTick = this.tick;
      tr.splits.push(this.tick);
      this.events.push({ k: 'finish' });
    }
  }

  // ---------------------------------------------------------------- respawn

  anchorFor(): Anchor | null {
    if (this.lastAnchor) return this.world.anchorById.get(this.lastAnchor) ?? null;
    return null;
  }

  private tryRecall(): void {
    const p = this.player;
    if (p.mode === Mode.Mantle || p.mode === Mode.Vault) return;
    const a = this.anchorFor();
    if (!a) return;
    // In Standard mode recall only works as an "unstuck" (not to undo a fall).
    if (!this.cfg.recallAnywhere && p.y < a.pos.y - 5) return;
    if (!p.grounded && !this.cfg.recallAnywhere) return;
    this.respawn('recall');
  }

  respawn(reason: 'void' | 'squish' | 'recall' | 'catch'): void {
    const p = this.player;
    let pos: V3;
    let yaw: number;
    if (this.trial) {
      // Trials restart at the last passed gate (or the start).
      const def = this.trial.def;
      const gi = this.trial.gate - 1;
      if (gi >= 0) {
        pos = this.trial.gates[gi].pos;
        yaw = def?.startYaw ?? 0;
      } else {
        pos = def?.start ?? this.cfg.spawn.pos;
        yaw = def?.startYaw ?? this.cfg.spawn.yaw;
      }
      pos = { x: pos.x, y: pos.y - 0.8, z: pos.z };
    } else {
      const a = this.anchorFor();
      pos = a ? a.pos : this.cfg.spawn.pos;
      yaw = a ? a.yaw : this.cfg.spawn.yaw;
    }
    if (p.majorFall) {
      this.events.push({ k: 'fallEnd', dist: p.peakY - p.y, caught: false, tag: null });
    }
    this.st.fallActive = false;
    this.ctrl.place(p, pos.x, pos.y + 0.05, pos.z, yaw);
    this.lastGroundY = pos.y;
    this.stats.respawns++;
    this.catchCooldown = ticks(0.5);
    this.events.push({ k: 'respawn', reason });
  }

  /** Capture the complete mutable state (used by the route bot to branch and retry). */
  snapshot(): SimSnapshot {
    return {
      player: { ...this.player },
      flags: [...this.st.flags],
      flagTick: [...this.st.flagTick],
      crumble: [...this.st.crumble],
      fallActive: this.st.fallActive,
      risk: { ...this.risk },
      stats: { ...this.stats },
      collected: [...this.collected],
      lit: [...this.lit],
      lastAnchor: this.lastAnchor,
      abilities: this.abilities,
      tick: this.tick,
      region: this.region,
      area: this.area,
      trial: this.trial ? { ...this.trial, masterHit: new Set(this.trial.masterHit), splits: [...this.trial.splits] } : null,
      pending: this.pending.map((p) => ({ ...p })),
      prevBtn: this.prevBtn,
      fired: [...this.firedTriggers],
      standTicks: [...this.standTicks],
      catchCooldown: this.catchCooldown,
      lastGroundY: this.lastGroundY,
    };
  }

  restore(s: SimSnapshot): void {
    Object.assign(this.player, s.player);
    this.st.flags = new Set(s.flags);
    this.st.flagTick = new Map(s.flagTick);
    this.st.crumble = new Map(s.crumble);
    this.st.fallActive = s.fallActive;
    Object.assign(this.risk, s.risk);
    Object.assign(this.stats, s.stats);
    this.collected.clear();
    for (const c of s.collected) this.collected.add(c);
    this.lit.clear();
    for (const l of s.lit) this.lit.add(l);
    this.lastAnchor = s.lastAnchor;
    this.abilities = s.abilities;
    this.tick = s.tick;
    this.region = s.region;
    this.area = s.area;
    this.trial = s.trial ? { ...s.trial, masterHit: new Set(s.trial.masterHit), splits: [...s.trial.splits] } : null;
    this.pending = s.pending.map((p) => ({ ...p }));
    this.prevBtn = s.prevBtn;
    this.firedTriggers.clear();
    for (const f of s.fired) this.firedTriggers.add(f);
    this.standTicks = new Map(s.standTicks);
    this.catchCooldown = s.catchCooldown;
    this.lastGroundY = s.lastGroundY;
    this.world.applyMovers(this.tick, this.st);
  }

  /** Nearest zone of a kind (for presentation). */
  zonesNear(kind: Zone['kind'], radius: number): Zone[] {
    const p = this.player;
    return this.world.zones.filter(
      (z) =>
        z.kind === kind &&
        p.x > z.min.x - radius &&
        p.x < z.max.x + radius &&
        p.y > z.min.y - radius &&
        p.y < z.max.y + radius &&
        p.z > z.min.z - radius &&
        p.z < z.max.z + radius,
    );
  }
}
