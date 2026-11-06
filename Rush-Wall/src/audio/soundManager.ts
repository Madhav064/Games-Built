// ============================================================
// Wall Duel — Procedural sound (Web Audio API, no audio files)
// Silent when: the player turns sound off, CrazyGames asks to
// mute, or an ad is playing.
// ============================================================

type SoundName =
  | 'pawnMove' | 'wallPlace' | 'turnStart' | 'win' | 'lose' | 'timerUrgent'
  | 'click' | 'invalidMove' | 'emote' | 'coinEarn' | 'purchase' | 'levelUp' | 'star';

type MuteReason = 'player' | 'platform' | 'ad';

class SoundManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muteReasons = new Set<MuteReason>();
  private volume = 0.5;

  /** Create the audio context. Browsers require a user gesture first. */
  unlock(): void {
    if (!this.ctx) {
      try {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
        this.applyGain();
      } catch (e) {
        console.warn('Web Audio API not supported', e);
        return;
      }
    }
    if (this.ctx.state === 'suspended' && !this.muteReasons.has('ad')) void this.ctx.resume();
  }

  setMuted(reason: MuteReason, muted: boolean): void {
    if (muted) this.muteReasons.add(reason);
    else this.muteReasons.delete(reason);
    this.applyGain();
    // Fully suspend during ads so nothing leaks through.
    if (reason === 'ad' && this.ctx) void (muted ? this.ctx.suspend() : this.ctx.resume());
  }

  get isSilent(): boolean {
    return this.muteReasons.size > 0;
  }

  private applyGain(): void {
    if (this.master) this.master.gain.value = this.isSilent ? 0 : this.volume;
  }

  play(name: SoundName): void {
    if (!this.ctx || !this.master || this.isSilent) return;
    const t = this.ctx.currentTime;
    const tone = (f: number, d: number, type: OscillatorType, v: number, at = 0) => this.tone(f, d, type, v, t + at);

    switch (name) {
      case 'pawnMove': tone(440, 0.08, 'sine', 0.3); tone(660, 0.08, 'sine', 0.2, 0.05); break;
      case 'wallPlace': this.noise(0.1, 0.4, t); tone(200, 0.15, 'square', 0.12); break;
      case 'turnStart': tone(523, 0.06, 'sine', 0.15); tone(659, 0.06, 'sine', 0.15, 0.06); break;
      case 'win': [523, 659, 784].forEach((f, i) => tone(f, 0.15, 'sine', 0.3, i * 0.12)); tone(1047, 0.3, 'sine', 0.4, 0.36); break;
      case 'lose': [440, 370, 311].forEach((f, i) => tone(f, 0.22, 'sawtooth', 0.18, i * 0.15)); break;
      case 'timerUrgent': tone(1000, 0.05, 'square', 0.15); tone(800, 0.05, 'square', 0.1, 0.05); break;
      case 'click': tone(600, 0.04, 'sine', 0.15); break;
      case 'invalidMove': tone(200, 0.1, 'sawtooth', 0.2); tone(180, 0.1, 'sawtooth', 0.15, 0.08); break;
      case 'emote': [800, 1000, 1200].forEach((f, i) => tone(f, 0.05, 'sine', 0.18, i * 0.04)); break;
      case 'coinEarn': [880, 1100, 1320].forEach((f, i) => tone(f, 0.1, 'sine', 0.22, i * 0.06)); break;
      case 'purchase': [660, 880, 1100].forEach((f, i) => tone(f, 0.08, 'sine', 0.22, i * 0.05)); break;
      case 'star': tone(1320, 0.12, 'triangle', 0.25); tone(1760, 0.18, 'triangle', 0.2, 0.08); break;
      case 'levelUp': [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.14, 'triangle', 0.28, i * 0.08)); break;
    }
  }

  private tone(freq: number, duration: number, type: OscillatorType, volume: number, start: number): void {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(start);
    osc.stop(start + duration + 0.01);
  }

  private noise(duration: number, volume: number, start: number): void {
    if (!this.ctx || !this.master) return;
    const size = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, size, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2000;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start(start);
    source.stop(start + duration + 0.01);
  }
}

export const soundManager = new SoundManager();
