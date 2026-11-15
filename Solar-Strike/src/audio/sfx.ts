// Procedural sound effects with WebAudio: no audio files to download.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = false;
let adMuted = false;
/** Master x effects volume (0..1). */
let volume = 0.8;

function ensure(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new AudioContext();
      master = ctx.createGain();
      // setMuted() may have run before the context existed (saved preference at boot).
      master.gain.value = silent() ? 0 : 0.9 * volume;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 6;
      master.connect(comp).connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** Dev-only hard mute (the `?mute` URL flag): nothing can turn sound back on. */
let devMuted = false;

function silent(): boolean { return muted || adMuted || devMuted; }

function applyMute(): void {
  if (master && ctx) master.gain.setTargetAtTime(silent() ? 0 : 0.9 * volume, ctx.currentTime, 0.02);
}

export function setDevMute(on: boolean): void { devMuted = on; applyMute(); }
/** True when nothing will be heard (any mute: player, platform, ad or dev). */
export function isSilent(): boolean { return silent(); }

export function setMuted(m: boolean): void { muted = m; applyMute(); }
/** Master and effects volume, each 0..1. (Music, when added, gets its own bus under master.) */
export function setVolume(masterVol: number, sfxVol: number): void {
  volume = Math.max(0, Math.min(1, masterVol)) * Math.max(0, Math.min(1, sfxVol));
  applyMute();
}
export function isMuted(): boolean { return muted; }
export function setAdMuted(m: boolean): void { adMuted = m; applyMute(); }

/** Call from a user gesture so browsers allow audio. */
export function unlockAudio(): void { ensure(); }

// iOS can suspend audio (calls, app switches); it only resumes inside a user gesture,
// so retry on every tap/click anywhere, not just on the canvas.
for (const type of ['pointerdown', 'touchend', 'click', 'keydown']) {
  window.addEventListener(type, () => { if (ctx && ctx.state !== 'running') void ctx.resume(); }, { capture: true, passive: true });
}

function noise(c: AudioContext): AudioBufferSourceNode {
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  src.loopStart = Math.random();
  return src;
}

/** Explosion. size: 0 (pop) .. 1 (planet-scale). */
export function explosion(size: number): void {
  const c = ensure();
  if (!c || !master) return;
  const t = c.currentTime;
  const dur = 0.5 + size * 3.2;
  const src = noise(c);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(1800 + size * 2000, t);
  lp.frequency.exponentialRampToValueAtTime(60 + (1 - size) * 120, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5 + size * 0.5, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(lp).connect(g).connect(master);
  src.start(t, Math.random());
  src.stop(t + dur + 0.05);
  // Sub thump
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(90 - size * 40, t);
  o.frequency.exponentialRampToValueAtTime(28, t + 0.4 + size);
  const og = c.createGain();
  og.gain.setValueAtTime(0.0001, t);
  og.gain.exponentialRampToValueAtTime(0.6 + size * 0.4, t + 0.01);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.5 + size * 1.2);
  o.connect(og).connect(master);
  o.start(t);
  o.stop(t + 0.6 + size * 1.3);
}

/** Rising whoosh for launches and incoming objects. */
export function whoosh(duration = 0.6, pitch = 1): void {
  const c = ensure();
  if (!c || !master) return;
  const t = c.currentTime;
  const src = noise(c);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.2;
  bp.frequency.setValueAtTime(300 * pitch, t);
  bp.frequency.exponentialRampToValueAtTime(2400 * pitch, t + duration);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.25, t + duration * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  src.connect(bp).connect(g).connect(master);
  src.start(t, Math.random());
  src.stop(t + duration + 0.05);
}

/** A short pitched tone with an exponential glide and decay. */
function tone(type: OscillatorType, from: number, to: number, dur: number, gain: number, delay = 0): void {
  const c = ensure();
  if (!c || !master) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** Filtered noise burst. */
function noiseBurst(filter: BiquadFilterType, freq: number, q: number, dur: number, gain: number, delay = 0): void {
  const c = ensure();
  if (!c || !master) return;
  const t = c.currentTime + delay;
  const src = noise(c);
  const f = c.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random());
  src.stop(t + dur + 0.05);
}

export type LaunchKind = 'missile' | 'warhead' | 'blob' | 'rock' | 'rod' | 'singularity' | 'split';

/** Each projectile family gets its own launch sound. */
export function launch(kind: LaunchKind, big = false): void {
  switch (kind) {
    case 'missile': whoosh(0.45, 1.3); noiseBurst('highpass', 4200, 0.7, 0.18, 0.08); break;
    case 'warhead': whoosh(1.1, 0.6); tone('sine', 70, 120, 0.9, 0.18); break;
    case 'blob': tone('sine', 150, 48, 0.28, 0.5); noiseBurst('lowpass', 500, 1, 0.22, 0.25); break;
    case 'rock': whoosh(big ? 1.6 : 0.9, big ? 0.45 : 0.7); break;
    case 'rod': tone('triangle', 2200, 700, 0.35, 0.14); noiseBurst('bandpass', 3000, 4, 0.25, 0.1); whoosh(0.3, 1.8); break;
    case 'singularity': tone('sine', 260, 70, 0.9, 0.22); tone('sine', 266, 72, 0.9, 0.12); break;
    case 'split': whoosh(0.5, 1); break;
  }
}

/** Molten hiss after a plasma impact. */
export function sizzle(): void { noiseBurst('highpass', 2600, 0.6, 0.9, 0.12, 0.05); }

/** Sharp metallic crack and ring for kinetic impacts. */
export function crack(): void { noiseBurst('bandpass', 3200, 2, 0.12, 0.35); tone('sine', 1100, 900, 0.6, 0.08); }

/** Long, deep after-rumble for the biggest blasts. */
export function rumble(delay = 0.25): void { tone('sine', 52, 30, 2.4, 0.4, delay); noiseBurst('lowpass', 180, 0.8, 2.2, 0.3, delay); }

export function click(): void {
  const c = ensure();
  if (!c || !master) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(880, t);
  o.frequency.exponentialRampToValueAtTime(1320, t + 0.05);
  const g = c.createGain();
  g.gain.setValueAtTime(0.12, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + 0.1);
}

/** Coin chime for purchases. */
export function purchase(): void {
  const c = ensure();
  if (!c || !master) return;
  const t = c.currentTime;
  [987.77, 1318.51].forEach((f, i) => {
    const o = c.createOscillator();
    o.type = 'square';
    o.frequency.value = f;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t + i * 0.07);
    g.gain.exponentialRampToValueAtTime(0.09, t + i * 0.07 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.07 + 0.25);
    o.connect(g).connect(master!);
    o.start(t + i * 0.07);
    o.stop(t + i * 0.07 + 0.3);
  });
}

export function levelUp(): void {
  const c = ensure();
  if (!c || !master) return;
  const t = c.currentTime;
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t + i * 0.09);
    g.gain.exponentialRampToValueAtTime(0.18, t + i * 0.09 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.4);
    o.connect(g).connect(master!);
    o.start(t + i * 0.09);
    o.stop(t + i * 0.09 + 0.45);
  });
}

/** Continuous beam hum. Returns a stop function. */
export function beamLoop(pitch = 1): () => void {
  const c = ensure();
  if (!c || !master) return () => {};
  const t = c.currentTime;
  const out = c.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(0.22, t + 0.05);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2200 * pitch;
  lp.Q.value = 4;
  const o1 = c.createOscillator();
  o1.type = 'sawtooth';
  o1.frequency.value = 98 * pitch;
  const o2 = c.createOscillator();
  o2.type = 'square';
  o2.frequency.value = 196.8 * pitch;
  const lfo = c.createOscillator();
  lfo.frequency.value = 9;
  const lfoGain = c.createGain();
  lfoGain.gain.value = 700 * pitch;
  lfo.connect(lfoGain).connect(lp.frequency);
  const crackle = noise(c);
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 3000;
  const cg = c.createGain();
  cg.gain.value = 0.25;
  crackle.connect(hp).connect(cg).connect(out);
  o1.connect(lp); o2.connect(lp);
  lp.connect(out).connect(master);
  o1.start(t); o2.start(t); lfo.start(t); crackle.start(t);
  return () => {
    const s = c.currentTime;
    out.gain.cancelScheduledValues(s);
    out.gain.setValueAtTime(out.gain.value, s);
    out.gain.exponentialRampToValueAtTime(0.0001, s + 0.12);
    for (const n of [o1, o2, lfo, crackle]) n.stop(s + 0.15);
  };
}

/** Crystalline ice crackle and sub-zero frost shimmer. */
export function freezeBurst(): void {
  const c = ensure();
  if (!c || !master) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(2400, t);
  o.frequency.exponentialRampToValueAtTime(800, t + 0.35);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(3200, t);
  bp.Q.value = 6;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
  o.connect(bp).connect(g).connect(master);
  o.start(t);
  o.stop(t + 0.4);
}

/** Deep sub-bass gravitational vacuum drone for active singularities. */
export function blackHoleRumble(): void {
  const c = ensure();
  if (!c || !master) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(42, t);
  o.frequency.exponentialRampToValueAtTime(26, t + 1.8);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(140, t);
  lp.frequency.exponentialRampToValueAtTime(60, t + 1.8);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.35, t + 0.1);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 2.0);
  o.connect(lp).connect(g).connect(master);
  o.start(t);
  o.stop(t + 2.1);
}

/** Sucking vacuum reverse whoosh into a violent spatial collapse. */
export function singularityCollapse(): void {
  const c = ensure();
  if (!c || !master) return;
  const t = c.currentTime;
  // Inward suction whoosh
  const src = noise(c);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(120, t);
  bp.frequency.exponentialRampToValueAtTime(1800, t + 0.5);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.4, t + 0.48);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
  src.connect(bp).connect(g).connect(master);
  src.start(t);
  src.stop(t + 0.6);
  // Big detonation at t + 0.48
  setTimeout(() => explosion(0.95), 450);
}
