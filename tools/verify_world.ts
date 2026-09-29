/**
 * Physics verification of every region's authored main route.
 * Usage: npx tsx tools/verify_world.ts [regionIndex]
 * Exits non-zero if any leg cannot be completed with the real simulation.
 */
import { solidsAt, verifyRoute } from '../src/core/bot';
import { buildWorld } from '../src/core/world/index';
import { BASE_ABILITIES, Shape, SolidFlag } from '../src/core/world/types';

const world = buildWorld();
const only = process.argv[2] !== undefined ? Number(process.argv[2]) : -1;
let failures = 0;

// ---------------------------------------------------------------- static lint
const lint = (msg: string): void => {
  failures++;
  console.log(`LINT ${msg}`);
};
const ids: number[] = [];
for (const r of world.ropes) {
  if (r.kind !== 'ladder' || (only >= 0 && r.region !== only)) continue;
  // Nothing may overhang the climbing column in front of a ladder (the climber would be trapped).
  const fx = r.a.x + r.n.x * 0.45;
  const fz = r.a.z + r.n.z * 0.45;
  world.querySolids(fx - 0.3, r.a.y + 0.3, fz - 0.3, fx + 0.3, r.b.y + 1.6, fz + 0.3, ids);
  for (const i of ids) {
    const so = world.solids[i];
    if (so.mover >= 0 || so.flags & SolidFlag.FallOnly) continue;
    if (!solidsOverlapCircle(so, fx, fz, 0.25)) continue;
    lint(`region ${r.region}: ladder ${r.id} at (${r.a.x.toFixed(1)},${r.a.y.toFixed(1)},${r.a.z.toFixed(1)}) is overhung by solid ${i} (y ${so.minY.toFixed(1)}..${so.maxY.toFixed(1)})`);
  }
}
for (const a of world.anchors) {
  if (only >= 0 && a.region !== only) continue;
  if (solidsAt(world, a.pos, 0.3, 0.2).length === 0) lint(`region ${a.region}: anchor ${a.id} is not standing on anything`);
}

function solidsOverlapCircle(so: (typeof world.solids)[number], x: number, z: number, r: number): boolean {
  const dx = x - so.x;
  const dz = z - so.z;
  if (so.shape === Shape.Cyl) return Math.hypot(dx, dz) < so.hx + r;
  const lx = dx * so.c - dz * so.s;
  const lz = dx * so.s + dz * so.c;
  const ex = Math.max(0, Math.abs(lx) - so.hx);
  const ez = Math.max(0, Math.abs(lz) - so.hz);
  return ex * ex + ez * ez < r * r;
}

for (const r of world.regionData) {
  const idx = r.meta.index;
  if (only >= 0 && idx !== only) continue;
  if (r.route.length < 2) {
    console.log(`region ${idx}: no route`);
    continue;
  }
  const t0 = Date.now();
  // Only the techniques a player can have learned by the end of this region.
  let abilities = BASE_ABILITIES;
  for (const c of world.collectibles) if (c.kind === 'lesson' && c.region <= idx && c.ability) abilities |= c.ability;
  const rep = verifyRoute(world, idx, r.route, { abilities, flags: [] });
  const secs = (rep.ticks / 120).toFixed(1);
  console.log(`region ${idx} (${r.meta.id}): ${rep.legs - rep.failed.length}/${rep.legs} legs ok, bot time ${secs}s, ${((Date.now() - t0) / 1000).toFixed(1)}s wall`);
  for (const f of rep.failed) {
    failures++;
    console.log(`   FAIL leg ${f.index} [${f.action}] (${f.from.x.toFixed(1)},${f.from.y.toFixed(1)},${f.from.z.toFixed(1)}) -> (${f.to.x.toFixed(1)},${f.to.y.toFixed(1)},${f.to.z.toFixed(1)})`);
  }
  for (const f of rep.forced) console.log(`   note: leg ${f.index} needed memory '${f.flag}' that the run had not triggered`);
  for (const br of r.branches) {
    const flags = [...(br.route[0]?.flags ?? [])];
    const brep = verifyRoute(world, idx, br.route, { abilities, flags });
    console.log(`   ${br.kind} ${br.id}: ${brep.legs - brep.failed.length}/${brep.legs} legs ok, bot time ${(brep.ticks / 120).toFixed(1)}s`);
    for (const f of brep.failed) {
      failures++;
      console.log(`      FAIL leg ${f.index} [${f.action}] (${f.from.x.toFixed(1)},${f.from.y.toFixed(1)},${f.from.z.toFixed(1)}) -> (${f.to.x.toFixed(1)},${f.to.y.toFixed(1)},${f.to.z.toFixed(1)})`);
    }
  }
}
process.exit(failures ? 1 : 0);
