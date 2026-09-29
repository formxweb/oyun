import { buildWorld } from '../core/world/index';
import { ALL_ABILITIES } from '../core/world/types';
import { InputManager } from './input/input';
import { CameraRig } from './render/camera';
import { RenderSystem } from './render/renderer';
import { Session } from './session';

const canvas = document.getElementById('game') as HTMLCanvasElement;
canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block;background:#000';
const world = buildWorld();
const rs = new RenderSystem(canvas, world, { quality: 'high', resolutionScale: 1, dynamicResolution: true, targetFps: 60, motionBlur: false });
const rig = new CameraRig(canvas.clientWidth / canvas.clientHeight);
const input = new InputManager(canvas);
const params = new URLSearchParams(location.search);
const spawn = world.regionData[0].spawn;
const pos = params.get('pos')?.split(',').map(Number);
const session = new Session(
  world,
  {
    mode: 'story',
    abilities: ALL_ABILITIES,
    flags: (params.get('flags') ?? '').split(',').filter(Boolean),
    collected: [],
    litAnchors: [],
    lastAnchor: null,
    spawn: pos ? { pos: { x: pos[0], y: pos[1], z: pos[2] }, yaw: Number(params.get('yaw') ?? 0) } : spawn,
    recallAnywhere: false,
    ngPlus: false,
  },
  rs,
  rig,
  input,
  () => ({ fov: 72, sensitivity: 1, invertY: false, reducedMotion: false, cameraShake: true, autoCenter: false, distance: 4.4 }),
);
if (params.get('pitch')) rig.pitch = Number(params.get('pitch'));
if (params.get('yaw')) rig.yaw = Number(params.get('yaw'));
window.addEventListener('resize', () => {
  rs.resize();
  rig.camera.aspect = canvas.clientWidth / canvas.clientHeight;
  rig.camera.updateProjectionMatrix();
});
let last = performance.now();
function loop(now: number) {
  const dt = (now - last) / 1000;
  last = now;
  session.frame(dt);
  rs.render(rig.camera);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
(window as unknown as { __session: Session }).__session = session;
