import { describe, expect, it } from 'vitest';
import { Mode } from '../src/core/player';
import { T } from '../src/core/tuning';
import { Ability, ALL_ABILITIES, Mat, Slope } from '../src/core/world/types';
import { v3 } from '../src/core/math';
import { B, inp, run, sim, testWorld } from './helpers';

// yaw 0 => forward is -Z

describe('ground movement', () => {
  const w = testWorld((b) => {
    b.plat(0, 0, 0, 40, 200, 1, { mat: Mat.Concrete });
  });

  it('settles on the ground and stays put', () => {
    const s = sim(w, 0, 0.5, 0);
    run(s, 120, inp());
    expect(s.player.grounded).toBe(true);
    expect(s.player.y).toBeCloseTo(0, 5);
    expect(s.player.x).toBeCloseTo(0, 5);
    expect(s.player.mode).toBe(Mode.Ground);
  });

  it('runs at run speed and sprints at sprint speed, reaching them quickly', () => {
    const s = sim(w, 0, 0, 90);
    run(s, 30, inp(1));
    expect(-s.player.vz).toBeCloseTo(T.runSpeed, 1);
    run(s, 30, inp(1, 0, 0, B.Sprint));
    expect(-s.player.vz).toBeCloseTo(T.sprintSpeed, 1);
  });

  it('stops quickly (no ice skating)', () => {
    const s = sim(w, 0, 0, 90);
    run(s, 60, inp(1, 0, 0, B.Sprint));
    const z0 = s.player.z;
    run(s, 60, inp());
    expect(Math.abs(s.player.z - z0)).toBeLessThan(0.9);
    expect(Math.abs(s.player.vz)).toBeLessThan(1e-6);
  });

  it('jump height is ~1.35 m and variable jump is lower', () => {
    const s = sim(w, 0, 0, 0);
    run(s, 10, inp());
    let maxY = 0;
    run(s, 80, (t) => {
      maxY = Math.max(maxY, s.player.y);
      return inp(0, 0, 0, t < 60 ? B.Jump : 0);
    });
    expect(maxY).toBeGreaterThan(1.3);
    expect(maxY).toBeLessThan(1.6);
    const s2 = sim(w, 0, 0, 0);
    run(s2, 10, inp());
    let maxY2 = 0;
    run(s2, 80, (t) => {
      maxY2 = Math.max(maxY2, s2.player.y);
      return inp(0, 0, 0, t < 6 ? B.Jump : 0);
    });
    expect(maxY2).toBeLessThan(maxY - 0.4);
  });
});

describe('edges: coyote time and jump buffer', () => {
  const w = testWorld((b) => {
    b.plat(0, 0, 0, 4, 4, 1);
    b.plat(0, 0, -20, 4, 4, 1);
  });

  it('coyote jump works shortly after running off an edge', () => {
    const s = sim(w, 0, 0, 1.5);
    run(s, 5, inp());
    let leftTick = -1;
    let jumped = false;
    for (let t = 0; t < 120; t++) {
      const wasGrounded = s.player.grounded;
      const doJump = leftTick >= 0 && t - leftTick === 8;
      s.step(inp(1, 0, 0, doJump ? B.Jump : 0));
      if (wasGrounded && !s.player.grounded && leftTick < 0) leftTick = t;
      if (s.events.some((e) => e.k === 'jump' && e.kind === 'coyote')) jumped = true;
    }
    expect(jumped).toBe(true);
  });

  it('buffered jump fires on landing', () => {
    const s = sim(w, 0, 1.5, 0);
    let jumps = 0;
    for (let t = 0; t < 60; t++) {
      // press jump while still falling, ~8 ticks before touchdown
      const y = s.player.y;
      const press = !s.player.grounded && y < 0.35 && y > 0.05;
      s.step(inp(0, 0, 0, press ? B.Jump : 0));
      jumps += s.events.filter((e) => e.k === 'jump').length;
    }
    expect(jumps).toBe(1);
  });
});

describe('gaps', () => {
  const gapWorld = (gap: number) =>
    testWorld((b) => {
      b.plat(0, 0, 0, 4, 20, 1);
      b.plat(0, 0, -10 - gap - 5, 4, 10, 1);
      b.plat(0, -30, -10, 60, 60, 1);
    });

  const attempt = (gap: number, btn: number) => {
    const w = gapWorld(gap);
    const s = sim(w, 0, 0, 2, 0);
    run(s, 5, inp());
    let jumped = false;
    for (let t = 0; t < 600; t++) {
      const nearEdge = s.player.z < -9.75 && s.player.grounded && !jumped;
      if (nearEdge) jumped = true;
      const done = jumped && s.player.grounded && s.player.z < -10;
      s.step(done ? inp() : inp(1, 0, 0, btn | (nearEdge ? B.Jump : 0)));
    }
    return s.player.y > -1;
  };

  it('sprint jump clears 4.5 m but not 6.5 m', () => {
    expect(attempt(4.5, B.Sprint)).toBe(true);
    expect(attempt(6.5, B.Sprint)).toBe(false);
  });

  it('run jump clears 3 m but not 4.5 m', () => {
    expect(attempt(3.0, 0)).toBe(true);
    expect(attempt(4.5, 0)).toBe(false);
  });
});

describe('mantle and ledges', () => {
  const w = testWorld((b) => {
    b.plat(0, 0, 0, 20, 20, 1);
    b.block(0, 0, -6, 6, 1.2, 4); // low ledge top 1.2
    b.block(6, 0, -6, 4, 3.1, 4); // high ledge top 3.1 (needs a jump + hang)
  });

  it('jumping onto a 1.2 m ledge gets on top', () => {
    const s = sim(w, 0, 0, -3.2);
    run(s, 5, inp());
    run(s, 60, (t) => inp(1, 0, 0, t < 20 ? B.Jump : 0));
    run(s, 30, inp());
    expect(s.player.y).toBeCloseTo(1.2, 3);
    expect(s.player.grounded).toBe(true);
  });

  it('a 2.4 m wall is mantled from a standing jump', () => {
    const w2 = testWorld((b) => {
      b.plat(0, 0, 0, 20, 20, 1);
      b.block(0, 0, -6, 6, 2.4, 4);
    });
    const s = sim(w2, 0, 0, -3.6, 0, { abilities: ALL_ABILITIES & ~Ability.WallClimb });
    run(s, 5, inp());
    let mantled = false;
    run(s, 80, (t) => {
      if (s.events.some((e) => e.k === 'mantle')) mantled = true;
      return inp(t < 50 ? 1 : 0, 0, 0, t < 20 ? B.Jump : 0);
    });
    run(s, 30, inp());
    expect(mantled).toBe(true);
    expect(s.player.y).toBeCloseTo(2.4, 3);
  });

  it('grabs a high ledge, hangs, then climbs', () => {
    const s = sim(w, 6, 0, -3.5);
    run(s, 5, inp());
    let hung = false;
    run(s, 110, (t) => {
      if (s.player.mode === Mode.Hang) hung = true;
      // jump, then keep pushing forward so we auto-climb
      return inp(1, 0, 0, t < 30 ? B.Jump : 0);
    });
    run(s, 30, inp());
    expect(hung).toBe(true);
    expect(s.player.y).toBeCloseTo(3.1, 3);
  });

  it('without ledge-grab ability a 3.1 m ledge is unreachable', () => {
    const s = sim(w, 6, 0, -3.5, 0, { abilities: ALL_ABILITIES & ~Ability.LedgeGrab & ~Ability.WallClimb });
    run(s, 5, inp());
    run(s, 200, (t) => inp(1, 0, 0, t < 30 ? B.Jump : 0));
    expect(s.player.y).toBeLessThan(0.5);
  });
});

describe('vault', () => {
  const w = testWorld((b) => {
    b.plat(0, 0, 0, 10, 40, 1);
    b.block(0, 0, -8, 10, 1.0, 0.5); // low thin fence
  });
  it('sprinting into a low fence vaults over it without stopping', () => {
    const s = sim(w, 0, 0, 0);
    let vaulted = false;
    run(s, 240, () => {
      if (s.events.some((e) => e.k === 'vault')) vaulted = true;
      return inp(1, 0, 0, B.Sprint);
    });
    expect(vaulted).toBe(true);
    expect(s.player.z).toBeLessThan(-12);
  });
});

describe('slide', () => {
  const w = testWorld((b) => {
    b.plat(0, 0, 0, 10, 60, 1);
    b.block(0, 1.1, -10, 10, 3, 1); // low beam: gap 1.1 m
  });
  it('sliding passes under a 1.1 m gap', () => {
    const s = sim(w, 0, 0, 0);
    run(s, 70, inp(1, 0, 0, B.Sprint));
    run(s, 80, inp(1, 0, 0, B.Sprint | B.Crouch));
    run(s, 200, inp(1, 0, 0, B.Sprint));
    expect(s.player.z).toBeLessThan(-11);
    expect(s.player.crouch).toBe(false);
  });
  it('without sliding the beam blocks', () => {
    const s = sim(w, 0, 0, 0);
    run(s, 200, inp(1, 0, 0, B.Sprint));
    expect(s.player.z).toBeGreaterThan(-9.6);
  });
});

describe('wall run and wall jump', () => {
  const w = testWorld((b) => {
    b.plat(0, 0, 10, 6, 20, 1);
    b.plat(0, 0, -13, 6, 10, 1); // landing edge at z=-8
    b.block(-3.2, -5, -6, 0.4, 12, 16); // wall along z on the left, z in [-14, 2]
    b.plat(0, -20, -10, 60, 60, 1);
  });
  it('can wall run across an 8 m gap', () => {
    const s = sim(w, -2.4, 0, 8);
    let ran = false;
    run(s, 300, (t) => {
      if (s.player.mode === Mode.WallRun) ran = true;
      const jump = s.player.z < 1 && s.player.z > 0 && s.player.grounded;
      return inp(1, 0, 0, B.Sprint | (jump ? B.Jump : 0));
    });
    expect(ran).toBe(true);
    expect(s.player.y).toBeGreaterThan(-1);
    expect(s.player.z).toBeLessThan(-11);
  });
});

describe('chimney wall jumps', () => {
  const w = testWorld((b) => {
    b.plat(0, 0, 0, 20, 20, 1);
    b.block(-1.6, 0, 0, 0.6, 12, 4);
    b.block(1.6, 0, 0, 0.6, 12, 4);
  });
  it('alternating wall jumps gain height between two walls', () => {
    const s = sim(w, -1.0, 0, 0, Math.PI / 2); // facing -x
    run(s, 5, inp());
    let maxY = 0;
    let dir = -1;
    run(s, 400, (t) => {
      maxY = Math.max(maxY, s.player.y);
      // steer toward the wall we're heading to, jump when touching it
      if (s.events.some((e) => e.k === 'jump' && e.kind === 'wall')) dir = -dir;
      const yaw = dir < 0 ? Math.PI / 2 : -Math.PI / 2;
      return inp(1, 0, yaw, t % 8 === 0 ? B.Jump : 0);
    });
    expect(maxY).toBeGreaterThan(3.5);
  });
  it('the same wall cannot be climbed alone', () => {
    const w2 = testWorld((b) => {
      b.plat(0, 0, 0, 20, 20, 1);
      b.block(-1.6, 0, 0, 0.6, 12, 4);
    });
    const s = sim(w2, -1.0, 0, 0, Math.PI / 2, { abilities: ALL_ABILITIES & ~Ability.WallClimb });
    run(s, 5, inp());
    let maxY = 0;
    run(s, 400, (t) => {
      maxY = Math.max(maxY, s.player.y);
      return inp(1, 0, Math.PI / 2, t % 8 === 0 ? B.Jump : 0);
    });
    expect(maxY).toBeLessThan(3.0);
  });
});

describe('steps and ramps', () => {
  const w = testWorld((b) => {
    b.plat(0, 0, 0, 10, 60, 1);
    b.stairs(0, 0, -2, 3, 3, 6, 3);
    b.plat(0, 3, -12, 6, 8, 1);
    b.plat(6, 0, 0, 3, 6, 1);
    b.ramp(6, 0, -8, 3, 3, 10, Slope.NegZ);
  });
  it('walks up stairs without jumping', () => {
    const s = sim(w, 0, 0, 0);
    run(s, 240, inp(1));
    expect(s.player.y).toBeCloseTo(3, 3);
  });
  it('walks up a ramp', () => {
    const s = sim(w, 6, 0, 1);
    let maxY = 0;
    run(s, 320, () => {
      maxY = Math.max(maxY, s.player.grounded ? s.player.y : 0);
      return inp(1);
    });
    expect(maxY).toBeGreaterThan(2.8);
  });
});

describe('moving platforms', () => {
  const w = testWorld((b) => {
    b.mover({ kind: 'path', origin: v3(0, 0, 0), points: [v3(0, 0, 0), v3(10, 0, 0)], segTime: [4], ease: false }, () => {
      b.plat(0, 0, 0, 3, 3, 0.5);
    });
  });
  it('carries the player', () => {
    const s = sim(w, 0, 0.1, 0);
    run(s, 240, inp());
    expect(s.player.grounded).toBe(true);
    expect(s.player.x).toBeGreaterThan(4);
  });
});

describe('falls', () => {
  const w = testWorld((b) => {
    b.plat(0, 60, 0, 4, 4, 1);
    b.plat(0, 0, 0, 40, 40, 1);
  });
  it('a big drop becomes a major fall and ends with a heavy landing', () => {
    const s = sim(w, 0, 60, 0);
    const kinds: string[] = [];
    run(s, 400, () => {
      for (const e of s.events) kinds.push(e.k);
      return inp(1);
    });
    expect(kinds).toContain('fallStart');
    expect(kinds).toContain('fallEnd');
    expect(kinds).toContain('stagger');
    expect(s.stats.majorFalls).toBe(1);
    expect(s.player.y).toBeCloseTo(0, 3);
  });
  it('rolling on landing avoids the stagger', () => {
    const s = sim(w, 0, 60, 0);
    const kinds: string[] = [];
    run(s, 400, () => {
      for (const e of s.events) kinds.push(e.k);
      const pressCrouch = !s.player.grounded && s.player.y < 1.5 && s.player.y > 0.5;
      return inp(1, 0, 0, pressCrouch ? B.Crouch : 0);
    });
    expect(kinds).toContain('roll');
    expect(kinds).not.toContain('stagger');
  });
});

describe('ropes', () => {
  const w = testWorld((b) => {
    b.plat(0, 0, 0, 4, 4, 1);
    b.plat(0, 0, -16, 4, 4, 1);
    b.plat(0, -20, -8, 40, 40, 1);
    b.rope('line', v3(0, 2.6, -1.5), v3(0, 2.6, -14.5));
    b.plat(20, 10, 0, 4, 4, 1);
    b.plat(20, 0, -30, 4, 4, 1);
    b.rope('zip', v3(20, 12.4, -1.5), v3(20, 2.6, -28));
  });
  it('hand-over-hand along a line across a gap', () => {
    const s = sim(w, 0, 0, 0.5);
    run(s, 5, inp());
    let grabbed = false;
    run(s, 900, (t) => {
      if (s.player.mode === Mode.Line) grabbed = true;
      const atEnd = s.player.mode === Mode.Line && s.player.z < -14.2;
      if (grabbed && s.player.grounded) return inp();
      return inp(1, 0, 0, (t === 20 ? B.Jump : 0) | (atEnd ? B.Jump : 0));
    });
    expect(grabbed).toBe(true);
    expect(s.player.y).toBeGreaterThan(-1);
    expect(s.player.z).toBeLessThan(-14);
  });
  it('zip line carries the player down and across', () => {
    const s = sim(w, 20, 10, -0.9);
    run(s, 5, inp());
    let zipped = false;
    run(s, 600, (t) => {
      if (s.player.mode === Mode.Zip) zipped = true;
      if (zipped && s.player.grounded) return inp();
      return inp(t < 30 ? 1 : 0, 0, 0, t > 5 && t < 25 ? B.Jump : 0);
    });
    expect(zipped).toBe(true);
    expect(s.player.z).toBeLessThan(-25);
    expect(s.player.y).toBeGreaterThan(-1);
  });
});

describe('determinism', () => {
  const w = testWorld((b) => {
    b.plat(0, 0, 0, 30, 80, 1);
    b.block(-3, 0, -20, 0.4, 10, 20);
    b.block(0, 0, -45, 4, 1.2, 4);
    b.mover({ kind: 'rotate', origin: v3(8, 0, -10), angVel: 0.7 }, () => {
      b.plat(0, 1, 0, 6, 1.2, 0.5);
    });
  });
  it('same inputs give bit-identical results', () => {
    const script = (t: number) => inp(Math.sin(t * 0.05) > -0.3 ? 1 : 0.4, Math.cos(t * 0.031) * 0.5, t * 0.01, (t % 90 < 3 ? B.Jump : 0) | (t % 200 > 150 ? B.Sprint : 0) | (t % 333 === 0 ? B.Crouch : 0));
    const a = sim(w, 0, 0.1, 0);
    const b = sim(w, 0, 0.1, 0);
    run(a, 3000, script);
    run(b, 3000, script);
    expect(a.player.x).toBe(b.player.x);
    expect(a.player.y).toBe(b.player.y);
    expect(a.player.z).toBe(b.player.z);
    expect(a.player.vx).toBe(b.player.vx);
    expect(a.risk.unbanked).toBe(b.risk.unbanked);
  });
});
