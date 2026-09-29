import * as THREE from 'three';
import { Mode } from '../core/player';
import type { World } from '../core/world/world';
import { newWorldState, type WorldState } from '../core/world/world';
import { t } from './i18n/i18n';
import type { RenderSystem } from './render/renderer';
import type { Hud } from './ui/hud';
import type { AudioEngine } from './audio/audio';

/**
 * The Last Fall: a single continuous descent from the Cradle to the orchard at Lowmark.
 * Falling down the city replays its history in the right order for the first time:
 * generation 1 at the top, generation 30 at the bottom, every Fall Line lighting up.
 */
export class EndingDirector {
  private tSec = 0;
  private readonly duration = 52;
  private readonly start: THREE.Vector3;
  private readonly end = new THREE.Vector3(6, 1.1, 80);
  private readonly pos = new THREE.Vector3();
  private readonly st: WorldState;
  private lastRegion = -1;
  private shownLines = 0;
  done = false;
  private landed = false;

  constructor(
    private readonly world: World,
    private readonly rs: RenderSystem,
    private readonly cam: THREE.PerspectiveCamera,
    private readonly hud: Hud,
    private readonly audio: AudioEngine,
    flags: string[],
  ) {
    const top = world.regions[world.regions.length - 1].topY;
    this.start = new THREE.Vector3(150, top + 10, 60);
    this.st = newWorldState(flags);
    this.st.fallActive = true;
  }

  /** Height along the fall: quick acceleration, long terminal descent, gentle end. */
  private height(u: number): number {
    const s = u < 0.06 ? (u / 0.06) * (u / 0.06) * 0.06 * 0.5 : u > 0.94 ? 1 - ((1 - u) / 0.06) * ((1 - u) / 0.06) * 0.06 * 0.5 : 0.03 + (u - 0.06) * (0.94 / 0.88);
    return this.start.y + (this.end.y - this.start.y) * Math.min(1, s);
  }

  update(dt: number): void {
    if (this.done) return;
    this.tSec += dt;
    const u = Math.min(1, this.tSec / this.duration);
    const y = this.height(u);
    // spiral outward path so the city is always in view below and beside us
    const a = 0.6 + u * Math.PI * 1.6;
    const r = 150 - Math.max(0, u - 0.8) * 5 * 130;
    const k = Math.max(0, (u - 0.85) / 0.15);
    this.pos.set(Math.cos(a) * Math.max(10, r), y, Math.sin(a) * Math.max(10, r));
    this.pos.lerp(new THREE.Vector3(this.end.x, y, this.end.z), k * k);
    const reg = this.world.regionAt(y);
    if (reg !== this.lastRegion && u < 0.97) {
      this.lastRegion = reg;
      this.hud.showRegion(reg);
      this.audio.memory();
    }
    const lines = ['ending.1', 'ending.2', 'ending.3'];
    const at = [0.2, 0.5, 0.78];
    if (this.shownLines < lines.length && u > at[this.shownLines]) {
      this.hud.subtitle(t(lines[this.shownLines]), 8);
      this.shownLines++;
    }
    const falling = u < 0.985;
    const vel = new THREE.Vector3(0, falling ? -52 : 0, 0);
    this.rs.character.update({
      pos: this.pos,
      fx: -Math.sin(a),
      fz: Math.cos(a),
      up: new THREE.Vector3(0, 1, 0),
      mode: falling ? Mode.Air : Mode.Ground,
      modeT: 0,
      vel,
      grounded: !falling,
      crouch: false,
      majorFall: falling,
      wallSide: 0,
      animU: 0,
      pivot: null,
      wind: new THREE.Vector3(0, 60, 0),
      dt,
    });
    // camera: above and outside, looking down past the climber at the city
    const camOff = new THREE.Vector3(Math.cos(a + 0.5) * 16, 9 - k * 6, Math.sin(a + 0.5) * 16);
    this.cam.position.copy(this.pos).add(camOff);
    this.cam.up.set(0, 1, 0);
    this.cam.lookAt(this.pos.clone().add(new THREE.Vector3(-Math.cos(a) * 20, -18 * (1 - k), -Math.sin(a) * 20)));
    this.cam.fov = 78;
    this.cam.updateProjectionMatrix();
    this.rs.worldView.update(this.st, this.tSec * 120, this.cam.position, falling, dt);
    this.rs.entities.update(this.st, new Set(), new Set(), falling, this.tSec, this.cam.position, -1, null);
    this.rs.updateEnvironment(this.cam, this.pos, this.tSec, falling ? 1 : 0);
    if (!falling && !this.landed) {
      this.landed = true;
      this.audio.land(3, 15, true);
      this.hud.subtitle(t('ending.4'), 7);
    }
    if (this.tSec > this.duration + 5) this.done = true;
  }
}
