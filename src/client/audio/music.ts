/**
 * Generative, adaptive soundtrack. Each region has its own key, mode, tempo and timbre;
 * layers (pad, bass, arpeggio, percussion) enter and leave with intensity (risk, speed,
 * height above your last anchor). Falls strip the music back to a rising pad; discoveries
 * and memories get their own stingers.
 */
interface RegionMusic {
  root: number;
  scale: number[];
  bpm: number;
  prog: number[];
  pad: OscillatorType;
  pluck: OscillatorType;
  bright: number;
  arpDensity: number;
  swing: number;
}

const MAJ = [0, 2, 4, 5, 7, 9, 11];
const MIX = [0, 2, 4, 5, 7, 9, 10];
const DOR = [0, 2, 3, 5, 7, 9, 10];
const AEO = [0, 2, 3, 5, 7, 8, 10];
const LYD = [0, 2, 4, 6, 7, 9, 11];
const PHR = [0, 1, 3, 5, 7, 8, 10];
const PENTA = [0, 2, 4, 7, 9, 12, 14];

const REGIONS: RegionMusic[] = [
  { root: 50, scale: PENTA, bpm: 76, prog: [0, 3, 4, 2], pad: 'triangle', pluck: 'sine', bright: 0.7, arpDensity: 0.45, swing: 0.08 },
  { root: 55, scale: MIX, bpm: 86, prog: [0, 6, 3, 4], pad: 'triangle', pluck: 'triangle', bright: 0.65, arpDensity: 0.55, swing: 0.1 },
  { root: 52, scale: DOR, bpm: 94, prog: [0, 3, 0, 6], pad: 'sawtooth', pluck: 'square', bright: 0.45, arpDensity: 0.6, swing: 0.04 },
  { root: 45, scale: AEO, bpm: 104, prog: [0, 5, 6, 4], pad: 'sawtooth', pluck: 'square', bright: 0.4, arpDensity: 0.7, swing: 0 },
  { root: 48, scale: LYD, bpm: 92, prog: [0, 1, 4, 5], pad: 'triangle', pluck: 'sine', bright: 0.8, arpDensity: 0.55, swing: 0.06 },
  { root: 53, scale: LYD, bpm: 82, prog: [0, 4, 1, 5], pad: 'sine', pluck: 'triangle', bright: 0.9, arpDensity: 0.35, swing: 0.05 },
  { root: 47, scale: AEO, bpm: 70, prog: [0, 5, 3, 4], pad: 'triangle', pluck: 'sine', bright: 0.4, arpDensity: 0.3, swing: 0.1 },
  { root: 49, scale: PHR, bpm: 112, prog: [0, 1, 0, 6], pad: 'sawtooth', pluck: 'square', bright: 0.35, arpDensity: 0.75, swing: 0 },
  { root: 46, scale: [0, 2, 4, 6, 8, 10, 12], bpm: 60, prog: [0, 2, 4, 1], pad: 'sine', pluck: 'sine', bright: 0.5, arpDensity: 0.25, swing: 0 },
  { root: 51, scale: MAJ, bpm: 72, prog: [0, 5, 3, 4], pad: 'triangle', pluck: 'sine', bright: 0.95, arpDensity: 0.4, swing: 0.05 },
];

const MENU: RegionMusic = { root: 50, scale: PENTA, bpm: 64, prog: [0, 3, 5, 4], pad: 'triangle', pluck: 'sine', bright: 0.6, arpDensity: 0.2, swing: 0.1 };

const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

export class MusicDirector {
  private readonly out: GainNode;
  private readonly lp: BiquadFilterNode;
  private cur: RegionMusic = MENU;
  private next: RegionMusic | null = null;
  private step = 0;
  private nextTime = 0;
  private acc = 0;
  private intensity = 0;
  private falling = false;
  private paused = false;
  private menu = true;
  private seed = 1;

  constructor(
    private readonly ctx: AudioContext,
    bus: AudioNode,
    private readonly reverb: AudioNode,
  ) {
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.frequency.value = 6000;
    this.out = ctx.createGain();
    this.out.gain.value = 0.9;
    this.out.connect(this.lp).connect(bus);
    this.nextTime = ctx.currentTime + 0.1;
  }

  private rand(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  update(dt: number, s: { region: number; intensity: number; falling: boolean; menu: boolean; paused: boolean; altitude: number }): void {
    const target = s.menu ? MENU : REGIONS[Math.max(0, Math.min(REGIONS.length - 1, s.region))];
    if (target !== this.cur && target !== this.next) this.next = target;
    this.intensity += (s.intensity - this.intensity) * Math.min(1, dt * 0.8);
    this.falling = s.falling;
    this.paused = s.paused;
    this.menu = s.menu;
    const t = this.ctx.currentTime;
    this.lp.frequency.setTargetAtTime(this.paused ? 700 : this.falling ? 2400 : 7000, t, 0.25);
    this.out.gain.setTargetAtTime(this.paused ? 0.5 : 0.9, t, 0.3);
    this.acc += dt;
    if (this.acc < 0.025) return;
    this.acc = 0;
    // schedule ahead
    while (this.nextTime < t + 0.15) {
      this.scheduleStep(this.nextTime);
      const sixteenth = 60 / this.cur.bpm / 4;
      const swing = this.step % 2 === 0 ? 1 + this.cur.swing : 1 - this.cur.swing;
      this.nextTime += sixteenth * swing;
      this.step++;
    }
    if (this.nextTime < t) this.nextTime = t + 0.05;
  }

  private chordNotes(m: RegionMusic, degree: number): number[] {
    const sc = m.scale;
    const n = (d: number) => m.root + sc[((d % sc.length) + sc.length) % sc.length] + 12 * Math.floor(d / sc.length);
    return [n(degree), n(degree + 2), n(degree + 4), n(degree + 6)];
  }

  private scheduleStep(time: number): void {
    const stepInBar = this.step % 16;
    if (stepInBar === 0 && this.next) {
      this.cur = this.next;
      this.next = null;
    }
    const m = this.cur;
    const bar = Math.floor(this.step / 16);
    const degree = m.prog[bar % m.prog.length];
    const chord = this.chordNotes(m, degree);
    const I = this.falling ? 0 : this.intensity;
    // Pad: every bar, long and soft.
    if (stepInBar === 0) {
      const barLen = (60 / m.bpm) * 4;
      for (let i = 0; i < 3; i++) this.voice(mtof(chord[i] - 12 + (i === 0 ? 0 : 12)), m.pad, 0.028 + (this.falling ? 0.02 : 0), barLen * 0.3, barLen * 0.9, time, 0.5, 1200 + m.bright * 1500 + (this.falling ? 1500 : 0));
    }
    if (this.falling) return;
    // Bass on beats 1 and 3 once things get going.
    if (I > 0.18 && (stepInBar === 0 || (stepInBar === 8 && I > 0.4))) this.voice(mtof(chord[0] - 24), 'sine', 0.09 * Math.min(1, I * 1.5), 0.01, 0.5, time, 0.05, 500);
    // Arpeggio.
    const density = m.arpDensity * (this.menu ? 0.4 : 0.35 + I * 0.9);
    if (stepInBar % 2 === 0 && this.rand() < density) {
      const idx = Math.floor(this.rand() * 4);
      const oct = this.rand() < 0.3 ? 12 : 0;
      this.voice(mtof(chord[idx] + 12 + oct), m.pluck, 0.03 + I * 0.02, 0.004, 0.45, time, 0.45, 2000 + m.bright * 3000);
    }
    // Percussion enters with danger.
    if (I > 0.45 && stepInBar % 4 === 2) this.hat(time, 0.02 + (I - 0.45) * 0.05);
    if (I > 0.65 && stepInBar % 8 === 0) this.kick(time, 0.12 * (I - 0.5));
  }

  private voice(freq: number, type: OscillatorType, peak: number, attack: number, dur: number, time: number, rev: number, cutoff: number): void {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = (this.rand() - 0.5) * 8;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(peak, time + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, time + attack + dur);
    o.connect(f).connect(g).connect(this.out);
    if (rev > 0) {
      const r = c.createGain();
      r.gain.value = rev;
      g.connect(r).connect(this.reverb);
    }
    o.start(time);
    o.stop(time + attack + dur + 0.05);
  }

  private hat(time: number, peak: number): void {
    const c = this.ctx;
    const len = 0.05;
    const b = c.createBuffer(1, Math.floor(c.sampleRate * len), c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = c.createBufferSource();
    s.buffer = b;
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = c.createGain();
    g.gain.value = peak;
    s.connect(f).connect(g).connect(this.out);
    s.start(time);
  }

  private kick(time: number, peak: number): void {
    const c = this.ctx;
    const o = c.createOscillator();
    o.frequency.setValueAtTime(120, time);
    o.frequency.exponentialRampToValueAtTime(42, time + 0.18);
    const g = c.createGain();
    g.gain.setValueAtTime(peak, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.3);
    o.connect(g).connect(this.out);
    o.start(time);
    o.stop(time + 0.35);
  }

  stinger(kind: 'discovery' | 'memory' | 'fall'): void {
    const c = this.ctx;
    const t = c.currentTime + 0.02;
    const m = this.cur;
    const chord = this.chordNotes(m, 0);
    if (kind === 'discovery') {
      chord.forEach((n, i) => this.voice(mtof(n + 12), 'triangle', 0.05, 0.01, 1.6, t + i * 0.06, 0.7, 5000));
    } else if (kind === 'memory') {
      this.voice(mtof(chord[0] - 12), 'sawtooth', 0.05, 1.2, 3, t, 0.9, 900);
      this.voice(mtof(chord[2] - 12), 'triangle', 0.04, 1.4, 3, t, 0.9, 1400);
    } else {
      [chord[3] + 12, chord[2] + 12, chord[1] + 12, chord[0] + 12].forEach((n, i) => this.voice(mtof(n), 'sine', 0.035, 0.02, 1.2, t + i * 0.09, 0.8, 4000));
    }
  }
}
