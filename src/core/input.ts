import { TAU } from './math';

export const enum Btn {
  Jump = 1,
  Sprint = 2,
  Crouch = 4,
  Interact = 8,
  Recall = 16,
}

/**
 * One tick of player intent. Values are quantized before entering the simulation so
 * that a recorded replay reproduces the run exactly.
 */
export interface InputFrame {
  /** strafe -1..1 */
  mx: number;
  /** forward -1..1 */
  mz: number;
  /** camera yaw in the player's gravity frame, radians */
  yaw: number;
  btn: number;
}

export const emptyInput = (): InputFrame => ({ mx: 0, mz: 0, yaw: 0, btn: 0 });

const YAW_STEPS = 65536;

export function quantizeAxis(v: number): number {
  const q = Math.round(Math.max(-1, Math.min(1, v)) * 127);
  // never -0: a replay stores the axis as an integer and reads back +0, and signed zeros steer
  // differently (atan2), so live play must use exactly what a replay reproduces
  return q === 0 ? 0 : q / 127;
}

export function quantizeYaw(yaw: number): number {
  let q = Math.round((yaw / TAU) * YAW_STEPS) % YAW_STEPS;
  if (q < 0) q += YAW_STEPS;
  return (q * TAU) / YAW_STEPS;
}

export function quantizeInput(i: InputFrame): InputFrame {
  return { mx: quantizeAxis(i.mx), mz: quantizeAxis(i.mz), yaw: quantizeYaw(i.yaw), btn: i.btn & 31 };
}

/** Pack to 5 bytes: mx(int8) mz(int8) yaw(uint16) btn(uint8). */
export function packInput(i: InputFrame, out: Uint8Array, off: number): void {
  out[off] = Math.round(i.mx * 127) & 0xff;
  out[off + 1] = Math.round(i.mz * 127) & 0xff;
  let q = Math.round((i.yaw / TAU) * YAW_STEPS) % YAW_STEPS;
  if (q < 0) q += YAW_STEPS;
  out[off + 2] = q & 0xff;
  out[off + 3] = (q >> 8) & 0xff;
  out[off + 4] = i.btn & 0xff;
}

export function unpackInput(buf: Uint8Array, off: number): InputFrame {
  const mx = ((buf[off] << 24) >> 24) / 127;
  const mz = ((buf[off + 1] << 24) >> 24) / 127;
  const q = buf[off + 2] | (buf[off + 3] << 8);
  return { mx, mz, yaw: (q * TAU) / YAW_STEPS, btn: buf[off + 4] };
}

export const inputEquals = (a: InputFrame, b: InputFrame): boolean =>
  a.mx === b.mx && a.mz === b.mz && a.yaw === b.yaw && a.btn === b.btn;
