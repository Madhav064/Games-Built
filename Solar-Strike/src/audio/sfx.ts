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
      master.gain.value = muted || adMuted ? 0 : 0.9 * volume;
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

function applyMute(): void {
  if (master && ctx) master.gain.setTargetAtTime(muted || adMuted ? 0 : 0.9 * volume, ctx.currentTime, 0.02);
}

export function setMuted(m: boolean): void { muted = m; applyMute(); }
export function isMuted(): boolean { return muted; }
export function setAdMuted(m: boolean): void { adMuted = m; applyMute(); }

/** Call from a user gesture so browsers allow audio. */
export function unlockAudio(): void { ensure(); }

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
