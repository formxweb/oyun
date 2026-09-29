import type { SimEvent } from './events';

/**
 * Risk multiplier and score. Deterministic, driven only by simulation events and
 * player state, so the server can recompute it from a replay.
 *
 * Risk grows with: height above your last safety point, sustained speed,
 * long jumps, unbroken movement chains and master-route gates.
 * A major fall resets the multiplier and forfeits unbanked points.
 * Touching an anchor banks points (story); trials bank at the finish.
 */
export interface RiskState {
  mult: number;
  heightBonus: number;
  chainBonus: number;
  speedBonus: number;
  routeBonus: number;
  chain: number;
  idleTicks: number;
  banked: number;
  unbanked: number;
  bestY: number;
  airStartX: number;
  airStartZ: number;
  airborne: boolean;
  longJumps: number;
  maxMult: number;
  styleMoves: number;
}

export const MAX_MULT = 5;

export function newRisk(y: number): RiskState {
  return {
    mult: 1,
    heightBonus: 0,
    chainBonus: 0,
    speedBonus: 0,
    routeBonus: 0,
    chain: 0,
    idleTicks: 0,
    banked: 0,
    unbanked: 0,
    bestY: y,
    airStartX: 0,
    airStartZ: 0,
    airborne: false,
    longJumps: 0,
    maxMult: 1,
    styleMoves: 0,
  };
}

const STYLE: Partial<Record<SimEvent['k'], number>> = {
  jump: 1,
  vault: 3,
  mantle: 1,
  wallrun: 4,
  wallclimb: 3,
  roll: 4,
  slide: 2,
  grab: 2,
  bounce: 2,
};

export function riskStep(
  r: RiskState,
  events: readonly SimEvent[],
  px: number,
  py: number,
  pz: number,
  hspeed: number,
  grounded: boolean,
  anchorY: number,
): void {
  for (const e of events) {
    const style = STYLE[e.k];
    if (style !== undefined) {
      if (e.k === 'wallrun' && !e.start) continue;
      if (e.k === 'slide' && !e.start) continue;
      r.chain++;
      r.styleMoves++;
      r.unbanked += style * 5 * r.mult;
    }
    if (e.k === 'jump') {
      r.airborne = true;
      r.airStartX = e.x;
      r.airStartZ = e.z;
    }
    if (e.k === 'land') {
      if (r.airborne) {
        const dx = e.x - r.airStartX;
        const dz = e.z - r.airStartZ;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d > 4.6) {
          r.longJumps++;
          r.chain += 2;
          r.unbanked += 25 * r.mult;
        }
      }
      r.airborne = false;
    }
    if (e.k === 'fallEnd' && e.dist > 12 && !e.caught) {
      // A major fall breaks the run of risk.
      r.unbanked = 0;
      r.chain = 0;
      r.chainBonus = 0;
      r.routeBonus = Math.max(0, r.routeBonus - 0.25);
    }
    if (e.k === 'anchor') {
      r.banked += r.unbanked;
      r.unbanked = 0;
    }
    if (e.k === 'master') r.routeBonus = Math.min(1.5, r.routeBonus + 0.5);
    if (e.k === 'respawn') {
      r.unbanked = 0;
      r.chain = 0;
    }
  }
  // Idle resets the chain.
  if (grounded && hspeed < 1) {
    r.idleTicks++;
    if (r.idleTicks > 72) r.chain = 0;
  } else r.idleTicks = 0;
  r.chainBonus = Math.min(1.5, r.chain * 0.04);
  r.speedBonus = hspeed > 7 ? Math.min(0.5, r.speedBonus + 0.002) : Math.max(0, r.speedBonus - 0.004);
  r.heightBonus = Math.min(1.0, Math.max(0, (py - anchorY) / 60));
  if (py > r.bestY + 1) {
    const gained = Math.floor(py - r.bestY);
    r.bestY += gained;
    r.unbanked += gained * 10 * r.mult;
  }
  r.mult = Math.min(MAX_MULT, 1 + r.heightBonus + r.chainBonus + r.speedBonus + r.routeBonus);
  if (r.mult > r.maxMult) r.maxMult = r.mult;
  void px;
  void pz;
}

export type Medal = 'none' | 'bronze' | 'silver' | 'gold' | 'perfect';

export function medalFor(seconds: number, falls: number, m: { bronze: number; silver: number; gold: number; perfect: number }): Medal {
  if (seconds <= m.perfect && falls === 0) return 'perfect';
  if (seconds <= m.gold) return 'gold';
  if (seconds <= m.silver) return 'silver';
  if (seconds <= m.bronze) return 'bronze';
  return 'none';
}

/**
 * Final score for trials and the Daily Summit.
 * Time dominates; falls cut it; risk and efficiency reward mastery.
 */
export function trialScore(seconds: number, par: number, falls: number, maxMult: number, efficiency: number, style: number): number {
  const timeScore = 10000 * Math.min(3, par / Math.max(1, seconds));
  const fallFactor = falls === 0 ? 1.15 : 1 / (1 + 0.3 * falls);
  const riskFactor = 1 + (maxMult - 1) * 0.15;
  const eff = 0.85 + 0.15 * Math.max(0, Math.min(1, efficiency));
  return Math.round(timeScore * fallFactor * riskFactor * eff + style);
}
