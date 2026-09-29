import { ACHIEVEMENTS } from '../../core/catalog/achievements';
import { COSMETIC_BY_ID, COSMETICS, DEFAULT_EQUIP, type Cosmetic, type Slot } from '../../core/catalog/cosmetics';
import type { SimEvent } from '../../core/events';
import type { SimConfig, Simulation } from '../../core/sim';
import { MAX_MULT } from '../../core/scoring';
import { ALL_ABILITIES, type CollectibleKind } from '../../core/world/types';
import type { World } from '../../core/world/world';
import { newJourney, type Difficulty, type SaveData, type TrialRecord } from './save';

export interface ProfileHooks {
  onAchievement?: (id: string) => void;
  onUnlockCosmetic?: (id: string) => void;
}

import { allMemoryFlags } from '../../core/world/memory';

export { allMemoryFlags };

/**
 * Progression: the journey in progress, lifetime collection, achievements and cosmetics.
 * All rules are local and deterministic; competitive data is verified by the server separately.
 */
export class Profile {
  readonly totals: Record<CollectibleKind, number> = { fragment: 0, record: 0, echo: 0, lesson: 0 };

  constructor(
    public data: SaveData,
    private readonly world: World,
    private readonly hooks: ProfileHooks = {},
  ) {
    for (const c of world.collectibles) this.totals[c.kind]++;
  }

  // ---------------------------------------------------------------- journey

  startJourney(difficulty: Difficulty, ngPlus: boolean, speedrun = false): void {
    const j = newJourney(difficulty, ngPlus, speedrun, ngPlus ? ALL_ABILITIES : undefined);
    if (ngPlus) j.flags = allMemoryFlags(this.world);
    this.data.journey = j;
  }

  simConfig(): SimConfig {
    const j = this.data.journey!;
    const a = j.lastAnchor ? this.world.anchorById.get(j.lastAnchor) : undefined;
    const spawn = a ? { pos: { ...a.pos, y: a.pos.y + 0.05 }, yaw: a.yaw } : this.world.regionData[0].spawn;
    return {
      mode: 'story',
      abilities: j.abilities,
      flags: j.flags,
      collected: j.collected,
      litAnchors: j.lit,
      lastAnchor: j.lastAnchor,
      spawn,
      recallAnywhere: j.difficulty === 'guided',
      ngPlus: j.ngPlus,
    };
  }

  /** Copy authoritative journey state out of the running simulation. */
  syncFromSim(sim: Simulation): void {
    const j = this.data.journey;
    if (!j) return;
    j.abilities = sim.abilities;
    j.flags = [...sim.st.flags];
    j.collected = [...sim.collected];
    j.lit = [...sim.lit];
    j.lastAnchor = sim.lastAnchor;
    j.stats.jumps = sim.stats.jumps;
    j.stats.wallRuns = sim.stats.wallRuns;
    if (sim.stats.maxY > j.stats.maxY) j.stats.maxY = sim.stats.maxY;
    if (sim.stats.longestChain > j.stats.longestChain) j.stats.longestChain = sim.stats.longestChain;
  }

  // ---------------------------------------------------------------- events

  /** React to simulation events during story play. */
  onEvent(e: SimEvent, sim: Simulation): void {
    const d = this.data;
    const j = d.journey;
    const L = d.lifetime;
    switch (e.k) {
      case 'fallEnd':
        if (!e.caught && e.dist > 10) {
          L.majorFalls++;
          L.fallen += e.dist;
          if (e.dist > L.maxFall) L.maxFall = e.dist;
          if (j) {
            j.stats.majorFalls++;
            j.stats.fallDistance += e.dist;
            if (e.dist > j.stats.maxFall) j.stats.maxFall = e.dist;
            const r = this.world.regionAt(sim.player.y + e.dist);
            j.regionFalls[r] = (j.regionFalls[r] ?? 0) + 1;
          }
          if (e.dist >= 20) this.unlock('first_fall');
          if (e.dist >= 250) this.unlock('long_fall');
        }
        break;
      case 'netFound':
        this.unlock('caught');
        break;
      case 'land':
        if (e.fall > 0.5) {
          /* climbed is accumulated from sim stats */
        }
        break;
      case 'roll': {
        const land = sim.events.find((x) => x.k === 'land');
        if (land && land.k === 'land' && land.fall >= 15) this.unlock('roll');
        break;
      }
      case 'collect':
        if (!d.everCollected.includes(e.id)) d.everCollected.push(e.id);
        if (e.kind === 'fragment') this.unlock('first_letter');
        this.checkCollections();
        break;
      case 'memory':
      case 'flag':
        this.onFlag(e.flag);
        break;
      case 'region':
        if (j) {
          if (e.index > j.regionMax) {
            // completed region e.index-1 on this climb
            const done = e.index - 1;
            if (done >= 0 && (j.regionFalls[done] ?? 0) === 0) this.unlock('no_way_down');
            if (done === 7 && j.stats.lightningHits === 0) this.unlock('storm_runner');
            j.regionMax = e.index;
            j.splits.push(j.ticks);
          }
        }
        if (e.index > d.regionsReached) d.regionsReached = e.index;
        break;
      case 'lightning':
        if (e.hit && j) j.stats.lightningHits++;
        break;
      case 'jump':
        L.jumps++;
        break;
      case 'wallrun':
        if (e.start) L.wallRuns++;
        break;
    }
    if (sim.risk.chain >= 25) this.unlock('flow');
    if (sim.risk.mult >= MAX_MULT - 1e-6) this.unlock('all_in');
    if (sim.player.grounded && sim.player.y >= 1000) this.unlock('m1000');
  }

  private onFlag(flag: string): void {
    if (flag === 'r1_bell') this.unlock('bell');
    if (flag === 'r4_winch') this.unlock('winch');
    if (flag === 'r5_rode_ring') this.unlock('ring');
    if (flag === 'r9_tower_top') this.unlock('beyond_gravity');
    if (flag === 'r10_cradle') this.unlock('first_summit');
    if (flag.startsWith('master_')) this.unlock('master_route');
  }

  /** Accumulate climbed metres & play time each second. */
  tickLifetime(seconds: number, climbedDelta: number, maxY: number): void {
    const L = this.data.lifetime;
    L.playTime += seconds;
    L.climbed += climbedDelta;
    if (maxY > L.maxY) L.maxY = maxY;
    if (this.data.journey) this.data.journey.playTime += seconds;
    this.data.achievementProgress.m5000 = Math.min(5000, Math.floor(L.climbed));
    if (L.climbed >= 5000) this.unlock('m5000');
  }

  countCollected(kind: CollectibleKind): number {
    let n = 0;
    for (const id of this.data.everCollected) if (this.world.collectibleById.get(id)?.kind === kind) n++;
    return n;
  }

  private checkCollections(): void {
    const p = this.data.achievementProgress;
    p.complete_journey = this.countCollected('fragment');
    p.archivist = this.countCollected('record');
    p.echo_hunter = this.countCollected('echo');
    p.all_lessons = this.countCollected('lesson');
    if (p.complete_journey >= this.totals.fragment && this.totals.fragment > 0) this.unlock('complete_journey');
    if (p.archivist >= this.totals.record && this.totals.record > 0) this.unlock('archivist');
    if (p.echo_hunter >= this.totals.echo && this.totals.echo > 0) this.unlock('echo_hunter');
    if (p.all_lessons >= this.totals.lesson && this.totals.lesson > 0) this.unlock('all_lessons');
  }

  finishJourney(): void {
    const j = this.data.journey;
    if (!j) return;
    j.finished = true;
    this.data.journeysCompleted++;
    if (j.ngPlus) {
      this.data.ngPlusCompleted++;
      this.unlock('remembered');
    }
    this.unlock('first_summit');
  }

  // ---------------------------------------------------------------- achievements

  unlock(id: string): boolean {
    if (this.data.achievements[id]) return false;
    if (!ACHIEVEMENTS.some((a) => a.id === id)) return false;
    this.data.achievements[id] = Date.now();
    this.hooks.onAchievement?.(id);
    for (const c of COSMETICS) {
      if (c.source.kind === 'achievement' && c.source.id === id) this.hooks.onUnlockCosmetic?.(c.id);
    }
    return true;
  }

  has(id: string): boolean {
    return !!this.data.achievements[id];
  }

  // ---------------------------------------------------------------- trials

  trialRecord(id: string): TrialRecord {
    let r = this.data.trials[id];
    if (!r) {
      r = { bestTime: Infinity, bestFalls: 0, bestScore: 0, medal: 'none', attempts: 0, pbGhost: null, lastGhost: null, masterDone: false };
      this.data.trials[id] = r;
    }
    return r;
  }

  recordTrial(id: string, time: number, falls: number, score: number, medal: TrialRecord['medal'], master: boolean): { pb: boolean } {
    const r = this.trialRecord(id);
    r.attempts++;
    const order = ['none', 'bronze', 'silver', 'gold', 'perfect'];
    if (order.indexOf(medal) > order.indexOf(r.medal)) r.medal = medal;
    if (score > r.bestScore) r.bestScore = score;
    if (master) {
      r.masterDone = true;
      this.unlock('master_route');
    }
    const pb = time < r.bestTime;
    if (pb) {
      r.bestTime = time;
      r.bestFalls = falls;
    }
    if (medal === 'perfect') this.unlock('perfect_run');
    const ids = this.world.trials.map((t) => t.id);
    const medals = ids.map((t) => this.data.trials[t]?.medal ?? 'none');
    this.data.achievementProgress.gold_standard = medals.filter((m) => m === 'gold' || m === 'perfect').length;
    this.data.achievementProgress.unbroken = medals.filter((m) => m === 'perfect').length;
    if (ids.length && medals.every((m) => m === 'gold' || m === 'perfect')) this.unlock('gold_standard');
    if (ids.length && medals.every((m) => m === 'perfect')) this.unlock('unbroken');
    return { pb };
  }

  // ---------------------------------------------------------------- cosmetics

  owns(c: Cosmetic | string): boolean {
    const item = typeof c === 'string' ? COSMETIC_BY_ID.get(c) : c;
    if (!item) return false;
    switch (item.source.kind) {
      case 'default':
        return true;
      case 'achievement':
        return this.has(item.source.id);
      case 'medal': {
        const s = item.source;
        const ok = (m: string) => (s.medal === 'gold' ? m === 'gold' || m === 'perfect' : m === 'perfect');
        if (s.trial === 'any') return Object.values(this.data.trials).some((r) => ok(r.medal));
        if (s.trial === 'all') return this.world.trials.every((t) => ok(this.data.trials[t.id]?.medal ?? 'none'));
        return ok(this.data.trials[s.trial]?.medal ?? 'none');
      }
      case 'purchase':
        return this.data.owned.includes(item.id);
    }
  }

  equip(slot: Slot, id: string): boolean {
    const c = COSMETIC_BY_ID.get(id);
    if (!c || c.slot !== slot || !this.owns(c)) return false;
    this.data.equipped[slot] = id;
    return true;
  }

  /** Remove equipped items the player no longer owns (e.g. refunded purchases). */
  sanitizeEquipped(): void {
    for (const slot of Object.keys(DEFAULT_EQUIP) as Slot[]) {
      if (!this.owns(this.data.equipped[slot])) this.data.equipped[slot] = DEFAULT_EQUIP[slot];
    }
  }

  grantPurchase(cosmeticIds: string[]): void {
    for (const id of cosmeticIds) if (!this.data.owned.includes(id)) this.data.owned.push(id);
  }

  setOwnedFromServer(cosmeticIds: string[]): void {
    this.data.owned = [...new Set(cosmeticIds)];
    this.sanitizeEquipped();
  }
}
