/**
 * Movement tuning. All values in metres / seconds.
 * These numbers define the "feel" and are also used by level-design validation,
 * so changing them requires re-running `npm run verify-world`.
 */
export const T = {
  radius: 0.3,
  footRadius: 0.2,
  height: 1.8,
  crouchHeight: 1.0,

  walkSpeed: 3.0,
  runSpeed: 5.8,
  sprintSpeed: 8.4,
  crouchSpeed: 2.4,
  groundAccel: 44,
  groundDecel: 62,
  slipAccel: 12,
  slipDecel: 7,

  jumpVel: 8.2,
  gravityUp: 25,
  gravityDown: 34,
  apexHangGravity: 17,
  apexHangBand: 1.2,
  jumpCutFactor: 0.45,
  terminalVel: 52,
  airAccel: 16,
  coyoteTime: 0.1,
  jumpBuffer: 0.13,
  stepUp: 0.4,
  airStepUp: 0.22,
  stepDown: 0.35,

  slideMinSpeed: 5.0,
  slideBoostSpeed: 9.4,
  slideDecel: 4.6,
  slideMinTime: 0.55,
  slideCooldown: 0.9,
  slideEndSpeed: 3.2,
  slideJumpFactor: 0.94,
  slideSteer: 1.6,

  mantleMax: 1.4,
  hangMax: 2.35,
  hangHandOffset: 2.05,
  shimmySpeed: 1.8,
  vaultMaxHeight: 1.25,
  vaultMaxDepth: 1.6,
  vaultTime: 0.3,

  wallRunMinSpeed: 4.5,
  wallRunSpeed: 6.8,
  wallRunTime: 1.35,
  wallRunGravityEarly: 6,
  wallRunGravityLate: 14,
  wallRunEarlyTime: 0.45,
  wallJumpOut: 6.2,
  wallJumpUp: 8.3,
  wallRunJumpOut: 5.2,
  wallRunJumpUp: 7.8,
  wallClimbVel: 6.3,
  wallClimbTime: 0.3,

  rollMinFall: 4.5,
  rollTime: 0.42,
  staggerFall: 9,
  heavyFall: 20,

  majorFallDrop: 10,
  majorFallSpeed: 16,
  maxGrabFallSpeed: 24,

  lineSpeed: 2.8,
  zipMaxSpeed: 17,
  ladderSpeed: 3.2,
  ropeGrabRadius: 0.6,
  swingPump: 7.5,
  swingReleaseBoost: 1.08,
  barLength: 1.25,
  hookRange: 11,
  hookMaxLength: 9,

  anchorRadius: 1.8,
  collectRadius: 1.5,
  echoRadius: 3.4,
  windWallAccel: 30,
} as const;

export const TICK = 120;
export const ticks = (seconds: number): number => Math.round(seconds * TICK);
