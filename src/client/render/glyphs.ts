import * as THREE from 'three';

/**
 * Procedural glyph atlas. The builders of the city marked everything with a small
 * vocabulary of symbols; players learn to read them over the course of the climb.
 *
 *  plumb   – the builders' sign: a plumb bob hanging from its line (points DOWN)
 *  n1..n40 – generation numerals (tally strokes). They DECREASE as you climb.
 *  hand    – a child's handprint
 *  chalk   – the climber's own chalk mark (routes you discovered)
 *  net     – fall-line knot pattern
 *  cradle  – crescent, the first home
 *  wind    – spiral
 *  eye     – the watcher's sign (lighthouse keepers of the Storm)
 *  arrow   – a builders' arrow (always pointing down)
 */
const CELL = 128;
const COLS = 8;
const NAMES: string[] = ['plumb', 'hand', 'chalk', 'net', 'cradle', 'wind', 'eye', 'arrow', 'lesson', 'record', 'echo', 'fragment'];
for (let i = 1; i <= 40; i++) NAMES.push('n' + i);

let atlas: THREE.CanvasTexture | null = null;
const index = new Map<string, number>();

export function glyphUV(key: string): [number, number, number, number] {
  getGlyphAtlas();
  const i = index.get(key) ?? 0;
  const rows = Math.ceil(NAMES.length / COLS);
  const cx = i % COLS;
  const cy = Math.floor(i / COLS);
  const u0 = cx / COLS;
  const u1 = (cx + 1) / COLS;
  const v1 = 1 - cy / rows;
  const v0 = 1 - (cy + 1) / rows;
  return [u0, v0, u1, v1];
}

export function getGlyphAtlas(): THREE.CanvasTexture {
  if (atlas) return atlas;
  const rows = Math.ceil(NAMES.length / COLS);
  const canvas = document.createElement('canvas');
  canvas.width = CELL * COLS;
  canvas.height = CELL * rows;
  const g = canvas.getContext('2d')!;
  g.clearRect(0, 0, canvas.width, canvas.height);
  NAMES.forEach((name, i) => {
    index.set(name, i);
    const x = (i % COLS) * CELL;
    const y = Math.floor(i / COLS) * CELL;
    g.save();
    g.translate(x + CELL / 2, y + CELL / 2);
    g.strokeStyle = '#fff';
    g.fillStyle = '#fff';
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.lineWidth = 7;
    drawGlyph(g, name);
    g.restore();
  });
  atlas = new THREE.CanvasTexture(canvas);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 4;
  atlas.generateMipmaps = true;
  return atlas;
}

function drawGlyph(g: CanvasRenderingContext2D, name: string): void {
  const R = CELL * 0.4;
  if (name.startsWith('n')) {
    // Tally numerals: groups of four strokes crossed by a fifth.
    const n = parseInt(name.slice(1), 10);
    const groups = Math.floor(n / 5);
    const rest = n % 5;
    const total = groups + (rest ? 1 : 0);
    const perRow = 4;
    const rowsN = Math.ceil(total / perRow);
    const gw = 24;
    const gh = 30;
    let k = 0;
    g.lineWidth = 5;
    for (let r = 0; r < rowsN; r++) {
      const inRow = Math.min(perRow, total - r * perRow);
      const ox = -((inRow * gw) / 2) + 2;
      const oy = -((rowsN * (gh + 8)) / 2) + r * (gh + 8);
      for (let c = 0; c < inRow; c++, k++) {
        const strokes = k < groups ? 4 : rest;
        const bx = ox + c * gw;
        for (let s = 0; s < strokes; s++) {
          g.beginPath();
          g.moveTo(bx + s * 5, oy);
          g.lineTo(bx + s * 5, oy + gh);
          g.stroke();
        }
        if (k < groups) {
          g.beginPath();
          g.moveTo(bx - 3, oy + gh - 4);
          g.lineTo(bx + 18, oy + 4);
          g.stroke();
        }
      }
    }
    return;
  }
  switch (name) {
    case 'plumb':
      g.beginPath();
      g.moveTo(0, -R);
      g.lineTo(0, R * 0.2);
      g.stroke();
      g.beginPath();
      g.moveTo(-R * 0.35, R * 0.2);
      g.lineTo(R * 0.35, R * 0.2);
      g.lineTo(0, R);
      g.closePath();
      g.fill();
      g.beginPath();
      g.arc(0, -R, 6, 0, Math.PI * 2);
      g.fill();
      break;
    case 'hand':
      g.beginPath();
      g.ellipse(0, 12, 22, 26, 0, 0, Math.PI * 2);
      g.fill();
      for (let f = 0; f < 4; f++) {
        g.beginPath();
        g.ellipse(-18 + f * 12, -22 - (f === 1 || f === 2 ? 8 : 0), 5, 16, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.beginPath();
      g.ellipse(26, 4, 6, 14, -0.7, 0, Math.PI * 2);
      g.fill();
      break;
    case 'chalk':
      g.lineWidth = 9;
      g.beginPath();
      g.moveTo(0, R);
      g.lineTo(0, -R);
      g.moveTo(-R * 0.5, -R * 0.45);
      g.lineTo(0, -R);
      g.lineTo(R * 0.5, -R * 0.45);
      g.stroke();
      break;
    case 'net':
      g.lineWidth = 3;
      for (let i = -3; i <= 3; i++) {
        g.beginPath();
        g.moveTo(i * 15 - 30, -R);
        g.lineTo(i * 15 + 30, R);
        g.moveTo(i * 15 + 30, -R);
        g.lineTo(i * 15 - 30, R);
        g.stroke();
      }
      break;
    case 'cradle':
      g.beginPath();
      g.arc(0, -8, R * 0.8, 0.15 * Math.PI, 0.85 * Math.PI);
      g.stroke();
      g.beginPath();
      g.arc(0, -R * 0.2, 7, 0, Math.PI * 2);
      g.fill();
      break;
    case 'wind':
      g.beginPath();
      for (let a = 0; a < Math.PI * 5; a += 0.1) {
        const r = 3 + a * 3;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (a === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.stroke();
      break;
    case 'eye':
      g.beginPath();
      g.moveTo(-R, 0);
      g.quadraticCurveTo(0, -R, R, 0);
      g.quadraticCurveTo(0, R, -R, 0);
      g.stroke();
      g.beginPath();
      g.arc(0, 0, 12, 0, Math.PI * 2);
      g.fill();
      break;
    case 'arrow':
      g.lineWidth = 9;
      g.beginPath();
      g.moveTo(0, -R);
      g.lineTo(0, R);
      g.moveTo(-R * 0.5, R * 0.45);
      g.lineTo(0, R);
      g.lineTo(R * 0.5, R * 0.45);
      g.stroke();
      break;
    case 'lesson':
      g.strokeRect(-R * 0.7, -R * 0.8, R * 1.4, R * 1.6);
      g.beginPath();
      g.moveTo(0, -R * 0.5);
      g.lineTo(0, R * 0.3);
      g.stroke();
      g.beginPath();
      g.arc(0, R * 0.45, 6, 0, Math.PI * 2);
      g.fill();
      break;
    case 'record':
      g.beginPath();
      g.moveTo(-R * 0.8, R * 0.7);
      g.lineTo(-R * 0.8, -R * 0.2);
      g.lineTo(0, -R * 0.8);
      g.lineTo(R * 0.8, -R * 0.2);
      g.lineTo(R * 0.8, R * 0.7);
      g.closePath();
      g.stroke();
      break;
    case 'echo':
      for (let r = 1; r <= 3; r++) {
        g.beginPath();
        g.arc(0, 0, r * 14, 0, Math.PI * 2);
        g.lineWidth = 8 - r * 2;
        g.stroke();
      }
      break;
    case 'fragment':
      g.beginPath();
      g.moveTo(-R * 0.6, -R * 0.7);
      g.lineTo(R * 0.4, -R * 0.7);
      g.lineTo(R * 0.6, -R * 0.5);
      g.lineTo(R * 0.6, R * 0.7);
      g.lineTo(-R * 0.6, R * 0.7);
      g.closePath();
      g.stroke();
      for (let l = 0; l < 4; l++) {
        g.beginPath();
        g.moveTo(-R * 0.4, -R * 0.35 + l * 18);
        g.lineTo(R * 0.4, -R * 0.35 + l * 18);
        g.lineWidth = 4;
        g.stroke();
      }
      break;
  }
}
