/**
 * Shared world layout: region heights and the hand-off points between regions.
 * Each region file builds its own geometry but must meet its neighbours here.
 */
export const REGION_BASE = [0, 100, 330, 580, 820, 1100, 1380, 1650, 1950, 2250, 2500] as const;

/** Pillar radius by altitude (the spire tapers as it rises). */
export function pillarRadius(y: number): number {
  if (y < 100) return 40;
  if (y < 330) return 38;
  if (y < 580) return 36;
  if (y < 820) return 34;
  if (y < 1100) return 32;
  if (y < 1380) return 30;
  if (y < 1650) return 28;
  if (y < 1950) return 26;
  if (y < 2250) return 24;
  return 20;
}

/** Ground -> Blocks: the Underside Gate, a shaft up through the Blocks' foundation. */
export const GATE_1_2 = { x: 46.5, z: 8.5, y: 104 };
