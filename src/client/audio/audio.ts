import { Mat } from '../../core/world/types';
import { MusicDirector } from './music';

export interface AudioVolumes {
  master: number;
  music: number;
  sfx: number;
  ambience: number;
  voice: number;
}

/**
 * Procedural audio. Every sound is synthesized at runtime from oscillators and filtered
 * noise, so there are no audio assets to load and the soundscape can react continuously
 * to altitude, speed, weather and falling.
 */
export class AudioEngine {
  ctx: AudioContext | null = null;
  /** Altitude of the summit, for altitude-scaled wind. */
  worldTop = 1000;
  private master!: GainNode;
  private sfx!: GainNode;
  private amb!: GainNode;
  private voice!: GainNode;
  private musicBus!: GainNode;
  private reverb!: ConvolverNode;
  private reverbSend!: GainNode;
  private noise!: AudioBuffer;
  private windSrc: AudioBufferSourceNode | null = null;
  private windFilter!: BiquadFilterNode;
  private windGain!: GainNode;
  private fallFilter!: BiquadFilterNode;
  private fallGain!: GainNode;
  private rainGain!: GainNode;
  private rainFilter!: BiquadFilterNode;
  private humGain!: GainNode;
  private humOsc: OscillatorNode[] = [];
  private slideGain!: GainNode;
  private slideFilter!: BiquadFilterNode;
  music: MusicDirector | null = null;
  private vol: AudioVolumes = { master: 0.85, music: 0.7, sfx: 0.9, ambience: 0.8, voice: 0.9 };
  private birdT = 0;
  private region = 0;
  private started = false;

  /** Must be called from a user gesture on mobile/web. */
  start(): void {
    if (this.started) {
      if (this.ctx?.state === 'suspended') this.ctx.resume().catch(() => undefined);
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC({ latencyHint: 'interactive' });
    } catch {
      return;
    }
    this.started = true;
    const c = this.ctx;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 3;
    comp.attack.value = 0.005;
    comp.release.value = 0.2;
    comp.connect(c.destination);
    this.master = c.createGain();
    this.master.connect(comp);
    this.sfx = c.createGain();
    this.amb = c.createGain();
    this.voice = c.createGain();
    this.musicBus = c.createGain();
    for (const g of [this.sfx, this.amb, this.voice, this.musicBus]) g.connect(this.master);
    this.reverb = c.createConvolver();
    this.reverb.buffer = this.impulse(3.2, 2.4);
    this.reverbSend = c.createGain();
    this.reverbSend.gain.value = 0.35;
    this.reverbSend.connect(this.reverb);
    this.reverb.connect(this.master);
    this.noise = this.makeNoise(4);
    // continuous beds
    this.windFilter = c.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.Q.value = 0.7;
    this.windGain = c.createGain();
    this.windGain.gain.value = 0;
    this.loopNoise(this.windFilter, this.windGain, this.amb);
    this.fallFilter = c.createBiquadFilter();
    this.fallFilter.type = 'lowpass';
    this.fallFilter.frequency.value = 400;
    this.fallGain = c.createGain();
    this.fallGain.gain.value = 0;
    this.loopNoise(this.fallFilter, this.fallGain, this.sfx);
    this.rainFilter = c.createBiquadFilter();
    this.rainFilter.type = 'highpass';
    this.rainFilter.frequency.value = 1800;
    this.rainGain = c.createGain();
    this.rainGain.gain.value = 0;
    this.loopNoise(this.rainFilter, this.rainGain, this.amb);
    this.slideFilter = c.createBiquadFilter();
    this.slideFilter.type = 'bandpass';
    this.slideFilter.frequency.value = 900;
    this.slideGain = c.createGain();
    this.slideGain.gain.value = 0;
    this.loopNoise(this.slideFilter, this.slideGain, this.sfx);
    this.humGain = c.createGain();
    this.humGain.gain.value = 0;
    this.humGain.connect(this.amb);
    for (const f of [55, 110.5, 164]) {
      const o = c.createOscillator();
      o.type = f < 100 ? 'sawtooth' : 'sine';
      o.frequency.value = f;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 240;
      o.connect(lp).connect(this.humGain);
      o.start();
      this.humOsc.push(o);
    }
    this.music = new MusicDirector(c, this.musicBus, this.reverbSend);
    this.applyVolumes();
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend().catch(() => undefined);
      else this.ctx.resume().catch(() => undefined);
    });
  }

  setVolumes(v: AudioVolumes): void {
    this.vol = { ...v };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.master, t, 0.05);
    this.sfx.gain.setTargetAtTime(this.vol.sfx, t, 0.05);
    this.amb.gain.setTargetAtTime(this.vol.ambience, t, 0.05);
    this.voice.gain.setTargetAtTime(this.vol.voice, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.vol.music * 0.55, t, 0.05);
  }

  private makeNoise(seconds: number): AudioBuffer {
    const c = this.ctx!;
    const b = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      last = last * 0.6 + w * 0.4; // slightly pink
      d[i] = last * 1.6;
    }
    return b;
  }

  private impulse(seconds: number, decay: number): AudioBuffer {
    const c = this.ctx!;
    const len = Math.floor(c.sampleRate * seconds);
    const b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }

  private loopNoise(filter: AudioNode, gain: GainNode, bus: AudioNode): void {
    const c = this.ctx!;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.playbackRate.value = 0.5 + Math.random() * 0.1;
    s.connect(filter);
    filter.connect(gain);
    gain.connect(bus);
    s.start(0, Math.random() * 3);
    if (!this.windSrc) this.windSrc = s;
  }

  // ---------------------------------------------------------------- primitives

  private env(g: GainNode, t: number, a: number, peak: number, d: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private noiseHit(freq: number, q: number, type: BiquadFilterType, peak: number, dur: number, pan = 0, bus?: AudioNode, when = 0, rate = 1): void {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + when;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    s.playbackRate.value = rate;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    this.env(g, t, 0.002, peak, dur);
    const p = c.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    s.connect(f).connect(g).connect(p).connect(bus ?? this.sfx);
    s.start(t, Math.random() * 3, dur + 0.05);
  }

  private tone(freq: number, type: OscillatorType, peak: number, attack: number, dur: number, opts: { bus?: AudioNode; when?: number; glide?: number; reverb?: number; pan?: number } = {}): void {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + (opts.when ?? 0);
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (opts.glide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * opts.glide), t + attack + dur);
    const g = c.createGain();
    this.env(g, t, attack, peak, dur);
    const p = c.createStereoPanner();
    p.pan.value = opts.pan ?? 0;
    o.connect(g).connect(p).connect(opts.bus ?? this.sfx);
    if (opts.reverb) {
      const r = c.createGain();
      r.gain.value = opts.reverb;
      g.connect(r).connect(this.reverbSend);
    }
    o.start(t);
    o.stop(t + attack + dur + 0.1);
  }

  // ---------------------------------------------------------------- game sounds

  footstep(mat: Mat, speed: number): void {
    const v = Math.min(1, 0.35 + speed * 0.07);
    const pan = (Math.random() - 0.5) * 0.2;
    switch (mat) {
      case Mat.Wood:
        this.noiseHit(700, 1.2, 'lowpass', 0.22 * v, 0.07, pan);
        this.tone(160 + Math.random() * 30, 'sine', 0.12 * v, 0.002, 0.06);
        break;
      case Mat.Metal:
      case Mat.Girder:
      case Mat.Rust:
      case Mat.Brass:
        this.noiseHit(2600, 2, 'bandpass', 0.16 * v, 0.06, pan);
        this.tone(700 + Math.random() * 400, 'triangle', 0.05 * v, 0.001, 0.12, { reverb: 0.2 });
        break;
      case Mat.Grass:
      case Mat.Moss:
        this.noiseHit(3000, 0.5, 'highpass', 0.1 * v, 0.09, pan);
        break;
      case Mat.Dirt:
        this.noiseHit(900, 0.8, 'lowpass', 0.16 * v, 0.08, pan);
        break;
      case Mat.Glass:
      case Mat.Crystal:
        this.noiseHit(4200, 3, 'bandpass', 0.1 * v, 0.05, pan);
        this.tone(1800 + Math.random() * 600, 'sine', 0.04 * v, 0.001, 0.2, { reverb: 0.3 });
        break;
      case Mat.Cloth:
        this.noiseHit(600, 0.7, 'lowpass', 0.12 * v, 0.1, pan);
        break;
      case Mat.Water:
        this.noiseHit(1500, 0.6, 'bandpass', 0.2 * v, 0.14, pan);
        break;
      case Mat.Tile:
      case Mat.Marble:
      case Mat.Obsidian:
        this.noiseHit(1800, 1.4, 'bandpass', 0.2 * v, 0.05, pan);
        break;
      default:
        this.noiseHit(1200, 1, 'bandpass', 0.2 * v, 0.06, pan);
    }
  }

  jump(): void {
    this.noiseHit(1400, 0.6, 'bandpass', 0.07, 0.12, 0, undefined, 0, 1.4);
  }

  land(fall: number, mat: Mat, soft: boolean): void {
    const k = Math.min(1, fall / 20);
    if (soft) {
      this.tone(120, 'sine', 0.25, 0.01, 0.35, { glide: 1.6 });
      this.noiseHit(500, 0.6, 'lowpass', 0.15, 0.25);
      return;
    }
    this.footstep(mat, 6);
    if (fall > 1.2) {
      this.tone(90 - k * 35, 'sine', 0.2 + k * 0.5, 0.004, 0.18 + k * 0.4, { glide: 0.5 });
      this.noiseHit(400, 0.7, 'lowpass', 0.12 + k * 0.4, 0.12 + k * 0.4);
    }
    if (fall > 9) this.noiseHit(180, 0.8, 'lowpass', 0.5 * k, 0.9, 0, undefined, 0.02);
  }

  roll(): void {
    this.noiseHit(800, 0.6, 'lowpass', 0.18, 0.35, 0, undefined, 0, 0.8);
  }

  mantle(): void {
    this.noiseHit(1000, 0.8, 'bandpass', 0.12, 0.08);
    this.noiseHit(700, 0.8, 'lowpass', 0.1, 0.2, 0, undefined, 0.12);
  }

  vault(): void {
    this.noiseHit(1600, 0.8, 'bandpass', 0.12, 0.08);
    this.noiseHit(900, 0.6, 'bandpass', 0.1, 0.22, 0, undefined, 0.05, 1.3);
  }

  grab(kind: string): void {
    if (kind === 'bar' || kind === 'hook' || kind === 'zip' || kind === 'ladder') {
      this.tone(kind === 'hook' ? 1320 : 900, 'triangle', 0.12, 0.001, 0.4, { reverb: 0.3 });
      this.tone(kind === 'hook' ? 1980 : 1350, 'sine', 0.05, 0.001, 0.3);
    } else {
      this.noiseHit(300, 3, 'bandpass', 0.2, 0.25, 0, undefined, 0, 0.6);
    }
  }

  wallrun(start: boolean): void {
    if (start) this.noiseHit(1100, 0.9, 'bandpass', 0.14, 0.15, 0, undefined, 0, 1.2);
  }

  setSlide(active: boolean, speed: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.slideGain.gain.setTargetAtTime(active ? Math.min(0.25, speed * 0.025) : 0, t, active ? 0.03 : 0.08);
    this.slideFilter.frequency.setTargetAtTime(500 + speed * 90, t, 0.1);
  }

  collect(kind: string): void {
    const chords: Record<string, number[]> = {
      fragment: [523.25, 659.25, 783.99, 880],
      record: [440, 554.37, 659.25, 830.61],
      echo: [392, 587.33, 783.99, 1174.66],
      lesson: [587.33, 739.99, 880, 1174.66],
    };
    const ch = chords[kind] ?? chords.fragment;
    ch.forEach((f, i) => this.tone(f, i % 2 ? 'sine' : 'triangle', 0.08, 0.01, 1.8, { when: i * 0.07, reverb: 0.6, bus: kind === 'echo' ? this.voice : this.sfx }));
    this.music?.stinger('discovery');
  }

  anchor(first: boolean): void {
    this.tone(196, 'sine', 0.22, 0.01, 2.4, { reverb: 0.6 });
    this.tone(294, 'sine', 0.1, 0.01, 2.0, { reverb: 0.6 });
    if (first) this.tone(392, 'triangle', 0.08, 0.05, 2.2, { when: 0.15, reverb: 0.7 });
    this.noiseHit(900, 0.5, 'bandpass', 0.1, 0.5, 0, undefined, 0.02, 0.7);
  }

  memory(): void {
    this.tone(55, 'sawtooth', 0.12, 0.8, 3.5, { reverb: 0.8, glide: 0.9 });
    this.tone(82.4, 'sine', 0.18, 0.6, 3.2, { reverb: 0.8 });
    this.noiseHit(220, 2, 'bandpass', 0.2, 2.2, 0, undefined, 0.3, 0.4);
    this.music?.stinger('memory');
  }

  bell(): void {
    for (const [f, a, d] of [
      [220, 0.25, 5],
      [440 * 1.19, 0.12, 3.5],
      [440 * 1.5, 0.08, 3],
      [440 * 2.76, 0.05, 2],
      [440 * 5.4, 0.02, 1],
    ] as [number, number, number][])
      this.tone(f, 'sine', a, 0.002, d, { reverb: 0.8 });
  }

  thunder(dist: number, hit: boolean): void {
    const k = Math.max(0.15, 1 - dist / 300);
    if (hit || dist < 60) this.noiseHit(3000, 0.5, 'highpass', 0.5 * k, 0.15);
    this.noiseHit(120, 0.7, 'lowpass', 0.8 * k, 3.5, (Math.random() - 0.5) * 0.6, this.amb, dist / 340);
    this.noiseHit(60, 0.7, 'lowpass', 0.6 * k, 4, 0, this.amb, dist / 340 + 0.2, 0.5);
  }

  vent(): void {
    this.noiseHit(2500, 0.4, 'highpass', 0.3, 1.2, 0, undefined, 0, 1.2);
    this.tone(70, 'sine', 0.2, 0.05, 0.8, { glide: 1.5 });
  }

  hazard(): void {
    this.noiseHit(4000, 2, 'bandpass', 0.25, 0.2);
    this.tone(1400, 'square', 0.05, 0.001, 0.15, { glide: 0.5 });
  }

  crumble(): void {
    this.noiseHit(300, 0.5, 'lowpass', 0.2, 0.7, 0, undefined, 0, 0.5);
    this.noiseHit(1400, 1.5, 'bandpass', 0.08, 0.4, 0, undefined, 0.3, 0.8);
  }

  shift(): void {
    this.tone(220, 'sine', 0.2, 0.05, 1.2, { glide: 2, reverb: 0.7 });
    this.tone(330, 'triangle', 0.1, 0.05, 1.2, { glide: 0.5, reverb: 0.7 });
  }

  fallStart(): void {
    this.music?.stinger('fall');
  }

  respawn(): void {
    this.tone(392, 'sine', 0.12, 0.05, 0.9, { reverb: 0.6, glide: 1.5 });
  }

  achievement(): void {
    [659.25, 830.61, 987.77, 1318.5].forEach((f, i) => this.tone(f, 'triangle', 0.08, 0.01, 1.4, { when: i * 0.09, reverb: 0.5 }));
  }

  ui(kind: 'move' | 'select' | 'back' | 'error' | 'unlock'): void {
    if (!this.ctx) return;
    switch (kind) {
      case 'move':
        this.tone(880, 'sine', 0.03, 0.002, 0.05);
        break;
      case 'select':
        this.tone(660, 'triangle', 0.05, 0.002, 0.12);
        this.tone(990, 'sine', 0.03, 0.002, 0.12, { when: 0.04 });
        break;
      case 'back':
        this.tone(520, 'triangle', 0.05, 0.002, 0.1, { glide: 0.8 });
        break;
      case 'error':
        this.tone(180, 'square', 0.04, 0.002, 0.18);
        break;
      case 'unlock':
        this.achievement();
        break;
    }
  }

  countdown(go: boolean): void {
    this.tone(go ? 880 : 440, 'triangle', 0.12, 0.002, go ? 0.6 : 0.2, { reverb: 0.3 });
  }

  gate(): void {
    this.tone(1046.5, 'triangle', 0.09, 0.002, 0.4, { reverb: 0.3 });
  }

  // ---------------------------------------------------------------- continuous update

  /**
   * Per-frame update of the ambient beds and music state.
   * altitudeNorm 0..1, speed m/s, falling, weather kind, region index.
   */
  update(dt: number, s: { y: number; speed: number; falling: boolean; fallSpeed: number; weather: number; region: number; danger: number; paused: boolean; menu: boolean; wind: number }): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const alt = Math.min(1, s.y / this.worldTop);
    const windLevel = s.menu ? 0.05 : 0.05 + alt * 0.12 + Math.min(0.2, s.speed * 0.012) + s.wind * 0.02;
    this.windGain.gain.setTargetAtTime(s.paused ? 0.01 : windLevel, t, 0.3);
    this.windFilter.frequency.setTargetAtTime(300 + alt * 500 + s.speed * 60, t, 0.4);
    this.fallGain.gain.setTargetAtTime(s.falling ? Math.min(0.55, 0.1 + s.fallSpeed * 0.012) : 0, t, s.falling ? 0.2 : 0.35);
    this.fallFilter.frequency.setTargetAtTime(300 + s.fallSpeed * 55, t, 0.3);
    const rain = s.weather === 3 ? 0.28 : s.weather === 2 ? 0.14 : 0;
    this.rainGain.gain.setTargetAtTime(s.paused ? 0 : rain, t, 1);
    const hum = s.region === 3 ? 0.07 : s.region === 4 ? 0.03 : s.region === 8 ? 0.02 : 0;
    this.humGain.gain.setTargetAtTime(s.paused ? 0 : hum, t, 1.2);
    if (this.humOsc.length && s.region === 8) this.humOsc[0].frequency.setTargetAtTime(41, t, 2);
    else if (this.humOsc.length) this.humOsc[0].frequency.setTargetAtTime(55, t, 2);
    // birds near the ground in daylight
    if (s.region <= 1 && !s.paused && !s.menu) {
      this.birdT -= dt;
      if (this.birdT <= 0) {
        this.birdT = 1.5 + Math.random() * 4;
        const base = 2200 + Math.random() * 1400;
        const n = 2 + Math.floor(Math.random() * 4);
        for (let i = 0; i < n; i++) this.tone(base * (1 + (Math.random() - 0.5) * 0.2), 'sine', 0.015, 0.005, 0.08, { when: i * 0.11, glide: 1.25, bus: this.amb, pan: (Math.random() - 0.5) * 1.4 });
      }
    }
    if (s.region !== this.region) this.region = s.region;
    this.music?.update(dt, { region: s.region, intensity: s.danger, falling: s.falling, menu: s.menu, paused: s.paused, altitude: alt });
  }
}
