import * as THREE from 'three';
import type { Anchor, Collectible, Rope } from '../../core/world/types';
import type { World, WorldState } from '../../core/world/world';
import { getGlyphAtlas, glyphUV } from './glyphs';

interface CollectView {
  c: Collectible;
  obj: THREE.Object3D;
  base: THREE.Vector3;
  kind: Collectible['kind'];
}

interface AnchorView {
  a: Anchor;
  obj: THREE.Group;
  flame: THREE.Mesh;
  light: THREE.Mesh;
}

interface RopeView {
  r: Rope;
  obj: THREE.Object3D;
  line?: THREE.Mesh;
}

const glowTex = (() => {
  let t: THREE.Texture | null = null;
  return () => {
    if (t) return t;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.3, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    t = new THREE.CanvasTexture(c);
    return t;
  };
})();

export function glowSprite(color: number, size: number, opacity = 0.8): THREE.Sprite {
  const m = new THREE.SpriteMaterial({ map: glowTex(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
  const s = new THREE.Sprite(m);
  s.scale.set(size, size, size);
  return s;
}

function glyphPlane(key: string, size: number, color: number): THREE.Mesh {
  const g = new THREE.PlaneGeometry(size, size);
  const [u0, v0, u1, v1] = glyphUV(key);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  uv.setXY(0, u0, v1);
  uv.setXY(1, u1, v1);
  uv.setXY(2, u0, v0);
  uv.setXY(3, u1, v0);
  const m = new THREE.MeshBasicMaterial({ map: getGlyphAtlas(), color, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  return new THREE.Mesh(g, m);
}

/** Collectibles, anchors and traversal props (ropes, bars, ladders, hooks). */
export class Entities {
  readonly group = new THREE.Group();
  private collects: CollectView[] = [];
  private anchors: AnchorView[] = [];
  private ropes: RopeView[] = [];
  private readonly ropeMat = new THREE.MeshLambertMaterial({ color: 0x8a7658 });
  private readonly cableMat = new THREE.MeshLambertMaterial({ color: 0x3a3d42 });
  private readonly brassMat = new THREE.MeshLambertMaterial({ color: 0xc9a24a, emissive: 0x3a2a08 });
  private readonly metalMat = new THREE.MeshLambertMaterial({ color: 0x5c6168 });
  private readonly stoneMat = new THREE.MeshLambertMaterial({ color: 0x9a9184 });
  private readonly woodMat = new THREE.MeshLambertMaterial({ color: 0x6b4f35 });

  constructor(private readonly world: World) {
    for (const c of world.collectibles) this.addCollectible(c);
    for (const a of world.anchors) this.addAnchor(a);
    for (const r of world.ropes) this.addRope(r);
  }

  private addCollectible(c: Collectible): void {
    const g = new THREE.Group();
    g.position.set(c.pos.x, c.pos.y, c.pos.z);
    switch (c.kind) {
      case 'fragment': {
        // a folded letter, drifting and glowing warm
        const paper = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.02, 0.24), new THREE.MeshLambertMaterial({ color: 0xf3e6c4, emissive: 0x6b5220 }));
        paper.rotation.x = 0.35;
        const fold = paper.clone();
        fold.rotation.x = -0.45;
        fold.position.y = 0.05;
        g.add(paper, fold, glowSprite(0xffcf80, 1.4, 0.7));
        break;
      }
      case 'record': {
        const slab = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.08), this.stoneMat);
        const gl = glyphPlane('record', 0.4, 0x9fe0ff);
        gl.position.z = 0.045;
        g.add(slab, gl, glowSprite(0x9fe0ff, 1.2, 0.45));
        break;
      }
      case 'lesson': {
        const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.32, 0.9, 10), this.stoneMat);
        ped.position.y = -0.55;
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.1), new THREE.MeshLambertMaterial({ color: 0x6f8aa0, emissive: 0x1a3a5a }));
        plate.position.y = 0.35;
        const gl = glyphPlane('lesson', 0.55, 0xbfe8ff);
        gl.position.set(0, 0.35, 0.055);
        g.add(ped, plate, gl, glowSprite(0x8fd0ff, 2.2, 0.6));
        break;
      }
      case 'echo': {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.06, 8, 32), new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
        const core = glowSprite(0xffd890, 2.8, 0.9);
        const beam = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.4, 30, 8, 1, true),
          new THREE.MeshBasicMaterial({ color: 0xffd890, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }),
        );
        beam.position.y = 15;
        g.add(ring, core, beam);
        g.visible = false;
        break;
      }
    }
    this.group.add(g);
    this.collects.push({ c, obj: g, base: g.position.clone(), kind: c.kind });
  }

  private addAnchor(a: Anchor): void {
    // The plumb stone: a tripod with a hanging stone bob. Lit anchors hold a small flame.
    const g = new THREE.Group();
    g.position.set(a.pos.x, a.pos.y, a.pos.z);
    const legGeo = new THREE.CylinderGeometry(0.035, 0.045, 2.3, 6);
    for (let i = 0; i < 3; i++) {
      const ang = (i / 3) * Math.PI * 2;
      const leg = new THREE.Mesh(legGeo, this.woodMat);
      leg.position.set(Math.cos(ang) * 0.45, 1.05, Math.sin(ang) * 0.45);
      leg.rotation.z = Math.cos(ang) * 0.38;
      leg.rotation.x = -Math.sin(ang) * 0.38;
      g.add(leg);
    }
    const line = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.2, 4), this.cableMat);
    line.position.y = 1.55;
    const bob = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 8), this.stoneMat);
    bob.rotation.x = Math.PI;
    bob.position.y = 0.82;
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffb04a }));
    flame.position.y = 2.22;
    const light = glowSprite(0xffa040, a.major ? 4.2 : 3, 0.85);
    light.position.y = 2.22;
    g.add(line, bob, flame, light);
    flame.visible = false;
    light.visible = false;
    this.group.add(g);
    this.anchors.push({ a, obj: g, flame, light: light as unknown as THREE.Mesh });
  }

  private addRope(r: Rope): void {
    let obj: THREE.Object3D;
    const a = new THREE.Vector3(r.a.x, r.a.y, r.a.z);
    const b = new THREE.Vector3(r.b.x, r.b.y, r.b.z);
    switch (r.kind) {
      case 'line':
      case 'zip': {
        obj = new THREE.Group();
        const m = this.cylinderBetween(a, b, r.kind === 'zip' ? 0.028 : 0.022, r.kind === 'zip' ? this.cableMat : this.ropeMat);
        obj.add(m);
        break;
      }
      case 'swing': {
        obj = new THREE.Group();
        const m = this.cylinderBetween(a, b, 0.035, this.ropeMat);
        obj.add(m);
        const knot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), this.ropeMat);
        knot.position.copy(b);
        obj.add(knot);
        const hook = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.03, 6, 12), this.brassMat);
        hook.position.copy(a);
        obj.add(hook);
        this.ropes.push({ r, obj, line: m });
        this.group.add(obj);
        return;
      }
      case 'bar': {
        obj = new THREE.Group();
        obj.add(this.cylinderBetween(a, b, 0.04, this.metalMat));
        break;
      }
      case 'ladder': {
        obj = new THREE.Group();
        const n = new THREE.Vector3(r.n.x, 0, r.n.z).normalize();
        const side = new THREE.Vector3(n.z, 0, -n.x).multiplyScalar(0.28);
        const off = n.clone().multiplyScalar(0.08);
        const a1 = a.clone().add(side).add(off);
        const b1 = b.clone().add(side).add(off);
        const a2 = a.clone().sub(side).add(off);
        const b2 = b.clone().sub(side).add(off);
        obj.add(this.cylinderBetween(a1, b1.clone().setY(b1.y + 0.6), 0.03, this.metalMat));
        obj.add(this.cylinderBetween(a2, b2.clone().setY(b2.y + 0.6), 0.03, this.metalMat));
        for (let y = a.y + 0.3; y < b.y; y += 0.32) {
          obj.add(this.cylinderBetween(a1.clone().setY(y), a2.clone().setY(y), 0.02, this.metalMat));
        }
        break;
      }
      case 'hook': {
        obj = new THREE.Group();
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.05, 8, 20), this.brassMat);
        ring.position.copy(a);
        const glow = glowSprite(0xffd070, 1.6, 0.5);
        glow.position.copy(a);
        obj.add(ring, glow);
        break;
      }
    }
    this.group.add(obj);
    this.ropes.push({ r, obj });
  }

  private cylinderBetween(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material): THREE.Mesh {
    const d = b.clone().sub(a);
    const len = d.length();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 6, 1), mat);
    m.scale.set(1, len, 1);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    m.castShadow = false;
    return m;
  }

  update(
    st: WorldState,
    collected: ReadonlySet<string>,
    lit: ReadonlySet<string>,
    fallActive: boolean,
    time: number,
    cam: THREE.Vector3,
    activeRope: number,
    handPos: THREE.Vector3 | null,
  ): void {
    for (const v of this.collects) {
      const c = v.c;
      let vis = !collected.has(c.id);
      if (c.show !== null && !st.flags.has(c.show)) vis = false;
      if (c.hide !== null && st.flags.has(c.hide)) vis = false;
      if (v.kind === 'echo') vis = vis && fallActive;
      const d = v.base.distanceTo(cam);
      v.obj.visible = vis && d < (v.kind === 'echo' ? 420 : 180);
      if (!v.obj.visible) continue;
      const bob = Math.sin(time * 1.7 + v.base.x) * 0.12;
      v.obj.position.set(v.base.x, v.base.y + (v.kind === 'lesson' ? 0 : bob), v.base.z);
      if (v.kind === 'fragment') v.obj.rotation.y = time * 0.8;
      if (v.kind === 'record') v.obj.rotation.y = Math.sin(time * 0.5) * 0.6;
      if (v.kind === 'echo') {
        v.obj.lookAt(cam);
        const s = 1 + Math.sin(time * 6) * 0.12;
        v.obj.scale.setScalar(s);
      }
    }
    for (const v of this.anchors) {
      const on = lit.has(v.a.id);
      v.flame.visible = on;
      v.light.visible = on;
      if (on) {
        const f = 1 + Math.sin(time * 11 + v.a.pos.x) * 0.08 + Math.sin(time * 23) * 0.04;
        v.flame.scale.setScalar(f);
      }
      v.obj.visible = v.obj.position.distanceTo(cam) < 400;
    }
    for (const v of this.ropes) {
      const r = v.r;
      let vis = true;
      if (r.show !== null && !st.flags.has(r.show)) vis = false;
      if (r.hide !== null && st.flags.has(r.hide)) vis = false;
      v.obj.visible = vis;
      if (!vis) continue;
      if (r.mover >= 0 && r.kind !== 'swing') {
        // Rope geometry is authored relative to its mover origin.
        const m = this.world.movers[r.mover];
        v.obj.position.set(m.origin.x + m.ox, m.origin.y + m.oy, m.origin.z + m.oz);
        v.obj.rotation.y = m.oyaw;
      }
      if (r.kind === 'swing' && v.line) {
        const a = this.world.ropePoint(r, 'a');
        const top = new THREE.Vector3(a.x, a.y, a.z);
        let bottom: THREE.Vector3;
        if (activeRope === r.id && handPos) bottom = handPos.clone();
        else {
          const b = this.world.ropePoint(r, 'b');
          bottom = new THREE.Vector3(b.x + Math.sin(time * 0.9 + r.id) * 0.15, b.y, b.z + Math.cos(time * 0.7 + r.id) * 0.15);
        }
        const d = bottom.clone().sub(top);
        const len = d.length();
        v.line.scale.set(1, len, 1);
        v.line.position.copy(top).add(bottom).multiplyScalar(0.5);
        v.line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
        const knot = v.obj.children[1];
        knot.position.copy(bottom);
      }
    }
  }

  /** Brief pulse at a collectible when picked up is handled by FX; this returns its position. */
  positionOf(id: string): THREE.Vector3 | null {
    const v = this.collects.find((x) => x.c.id === id);
    return v ? v.obj.position.clone() : null;
  }
}
