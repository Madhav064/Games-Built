// ============================================================
// Rush Wall — Web Audio Procedural Sound Manager
// ============================================================

type SoundName =
  | 'pawnMove'
  | 'wallPlace'
  | 'turnStart'
  | 'win'
  | 'lose'
  | 'timerTick'
  | 'timerUrgent'
  | 'click'
  | 'hover'
  | 'invalidMove'
  | 'emote'
  | 'coinEarn'
  | 'purchase';

class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private _muted: boolean = false;
  private _volume: number = 0.5;
  private initialized: boolean = false;

  /**
   * Initialize the audio context (must be called on user interaction).
   */
  init(): void {
    if (this.initialized) return;
    try {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this._volume;
      this.masterGain.connect(this.ctx.destination);
      this.initialized = true;
    } catch (e) {
      console.warn('Web Audio API not supported:', e);
    }
  }

  get muted(): boolean { return this._muted; }
  get volume(): number { return this._volume; }

  setVolume(v: number): void {
    this._volume = Math.max(0, Math.min(1, v));
    if (this.masterGain) {
      this.masterGain.gain.value = this._muted ? 0 : this._volume;
    }
  }

  toggleMute(): void {
    this._muted = !this._muted;
    if (this.masterGain) {
      this.masterGain.gain.value = this._muted ? 0 : this._volume;
    }
  }

  /**
   * Play a sound by name.
   */
  play(name: SoundName): void {
    if (!this.ctx || !this.masterGain || this._muted) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    const t = this.ctx.currentTime;

    switch (name) {
      case 'pawnMove':
        this.playTone(440, 0.08, 'sine', 0.3, t);
        this.playTone(660, 0.08, 'sine', 0.2, t + 0.05);
        break;

      case 'wallPlace':
        this.playNoise(0.1, 0.4, t);
        this.playTone(200, 0.15, 'square', 0.15, t);
        break;

      case 'turnStart':
        this.playTone(523, 0.06, 'sine', 0.2, t);
        this.playTone(659, 0.06, 'sine', 0.2, t + 0.06);
        break;

      case 'win':
        this.playTone(523, 0.15, 'sine', 0.3, t);
        this.playTone(659, 0.15, 'sine', 0.3, t + 0.12);
        this.playTone(784, 0.15, 'sine', 0.3, t + 0.24);
        this.playTone(1047, 0.3, 'sine', 0.4, t + 0.36);
        break;

      case 'lose':
        this.playTone(440, 0.2, 'sawtooth', 0.2, t);
        this.playTone(370, 0.2, 'sawtooth', 0.2, t + 0.15);
        this.playTone(311, 0.3, 'sawtooth', 0.25, t + 0.30);
        break;

      case 'timerTick':
        this.playTone(800, 0.03, 'sine', 0.1, t);
        break;

      case 'timerUrgent':
        this.playTone(1000, 0.05, 'square', 0.2, t);
        this.playTone(800, 0.05, 'square', 0.15, t + 0.05);
        break;

      case 'click':
        this.playTone(600, 0.04, 'sine', 0.15, t);
        break;

      case 'hover':
        this.playTone(400, 0.02, 'sine', 0.05, t);
        break;

      case 'invalidMove':
        this.playTone(200, 0.1, 'sawtooth', 0.2, t);
        this.playTone(180, 0.1, 'sawtooth', 0.15, t + 0.08);
        break;

      case 'emote':
        this.playTone(800, 0.05, 'sine', 0.2, t);
        this.playTone(1000, 0.05, 'sine', 0.15, t + 0.04);
        this.playTone(1200, 0.05, 'sine', 0.1, t + 0.08);
        break;

      case 'coinEarn':
        this.playTone(880, 0.08, 'sine', 0.2, t);
        this.playTone(1100, 0.08, 'sine', 0.25, t + 0.06);
        this.playTone(1320, 0.12, 'sine', 0.3, t + 0.12);
        break;

      case 'purchase':
        this.playTone(660, 0.06, 'sine', 0.2, t);
        this.playTone(880, 0.06, 'sine', 0.2, t + 0.05);
        this.playTone(1100, 0.1, 'sine', 0.25, t + 0.1);
        break;
    }
  }

  /**
   * Play a simple oscillator tone.
   */
  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    startTime: number
  ): void {
    if (!this.ctx || !this.masterGain) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.value = freq;

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.01);
  }

  /**
   * Play filtered noise (for impact sounds).
   */
  private playNoise(duration: number, volume: number, startTime: number): void {
    if (!this.ctx || !this.masterGain) return;

    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.5;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2000;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    source.start(startTime);
    source.stop(startTime + duration + 0.01);
  }
}

// Singleton
export const soundManager = new SoundManager();
