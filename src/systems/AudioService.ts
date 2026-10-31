// Sound effects and music, synthesised with the Web Audio API: no audio files,
// nothing to license, tiny download. No Phaser imports.
//
// Browsers only allow sound after a tap, so nothing plays until unlock() is
// called from a pointer event (the "Tap to start" on the loading screen).

export type Sfx =
  | 'tap'
  | 'drop'
  | 'flip'
  | 'ding'
  | 'pour'
  | 'shake'
  | 'trash'
  | 'burn'
  | 'lid'
  | 'cash'
  | 'chime'
  | 'fanfare';

export interface AudioSettings {
  sound: boolean;
  music: boolean;
}

/** Music: a gentle loop of chords (root notes in Hz) and a pentatonic melody. */
const BPM = 92;
const CHORDS = [
  [261.63, 329.63, 392.0, 493.88], // Cmaj7
  [220.0, 261.63, 329.63, 392.0], // Am7
  [174.61, 220.0, 261.63, 329.63], // Fmaj7
  [196.0, 246.94, 293.66, 349.23], // G7
];
/** Eighth-note melody per bar (index into the chord's notes, an octave up; -1 = rest). */
const MELODY = [
  [0, -1, 2, 1, -1, 3, 2, -1],
  [2, -1, 1, 0, -1, 1, 2, -1],
  [3, -1, 2, -1, 1, 2, -1, 0],
  [1, -1, 2, 3, -1, 2, 1, -1],
];
const MUSIC_VOLUME = 0.05;
const SFX_VOLUME = 0.5;

type Ctx = AudioContext;

export class AudioService {
  private ctx: Ctx | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  /** Next eighth note to schedule (counts up forever) and when it plays. */
  private step = 0;
  private nextNoteAt = 0;
  private hidden = false;

  constructor(
    private settings: AudioSettings,
    private readonly createContext: () => Ctx | null = () => {
      const C = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
        (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      return C ? new C() : null;
    },
  ) {}

  get soundOn(): boolean {
    return this.settings.sound;
  }

  get musicOn(): boolean {
    return this.settings.music;
  }

  get unlocked(): boolean {
    return this.ctx !== null;
  }

  /** Call from a tap. Creates the audio context (once) and starts the music if it's on. */
  unlock(): void {
    if (!this.ctx) {
      this.ctx = this.createContext();
      if (!this.ctx) return;
      const ctx = this.ctx;
      this.sfxGain = ctx.createGain();
      this.sfxGain.gain.value = SFX_VOLUME;
      this.sfxGain.connect(ctx.destination);
      this.musicGain = ctx.createGain();
      this.musicGain.gain.value = MUSIC_VOLUME;
      this.musicGain.connect(ctx.destination);
      // One second of white noise, reused for every noisy sound.
      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    void this.ctx.resume?.();
    if (this.settings.music) this.startMusic();
  }

  setSound(on: boolean): void {
    this.settings.sound = on;
  }

  setMusic(on: boolean): void {
    this.settings.music = on;
    if (on && this.ctx) this.startMusic();
    if (!on) this.stopMusic();
  }

  /** Pause everything (the page was hidden) or carry on. */
  setSuspended(suspended: boolean): void {
    if (!this.ctx) return;
    this.hidden = suspended;
    if (suspended) void this.ctx.suspend?.();
    else this.wake();
  }

  /**
   * Call on every tap. Phones suspend (or "interrupt") an audio context on their
   * own, for a notification, another app's sound or a long stretch without taps,
   * and only a tap may resume it: so the music carries on after the next one.
   */
  wake(): void {
    const ctx = this.ctx;
    if (!ctx || this.hidden) return;
    if (ctx.state !== 'running') void ctx.resume?.();
    if (this.settings.music) this.startMusic();
  }

  play(name: Sfx): void {
    const ctx = this.ctx;
    if (!ctx || !this.settings.sound || !this.sfxGain) return;
    const t = ctx.currentTime + 0.005;
    switch (name) {
      case 'tap':
        this.tone(t, 0.05, 700, 'sine', 0.25);
        break;
      case 'drop': // a plop into the oil, then a sizzle
        this.tone(t, 0.14, 320, 'sine', 0.5, 110);
        this.hiss(t + 0.05, 0.45, 0.12, 'bandpass', 4200);
        break;
      case 'flip':
        this.tone(t, 0.07, 480, 'triangle', 0.3, 720);
        break;
      case 'ding': // golden!
        this.tone(t, 0.5, 1318.5, 'triangle', 0.3);
        this.tone(t, 0.5, 1975.5, 'sine', 0.12);
        break;
      case 'pour':
        this.hiss(t, 0.16, 0.08, 'lowpass', 900);
        break;
      case 'shake':
        this.hiss(t, 0.04, 0.12, 'highpass', 3000);
        break;
      case 'trash':
        this.hiss(t, 0.22, 0.3, 'lowpass', 500);
        this.tone(t, 0.18, 140, 'sine', 0.4, 60);
        break;
      case 'burn':
        this.tone(t, 0.35, 110, 'sawtooth', 0.15, 80);
        break;
      case 'lid':
        this.tone(t, 0.12, 180, 'sine', 0.5, 90);
        this.hiss(t, 0.08, 0.15, 'lowpass', 1200);
        break;
      case 'cash': // cha-ching
        this.hiss(t, 0.06, 0.15, 'highpass', 5000);
        this.tone(t + 0.05, 0.12, 1568, 'triangle', 0.25);
        this.tone(t + 0.13, 0.35, 2093, 'triangle', 0.25);
        break;
      case 'chime': // a customer walks up
        this.tone(t, 0.18, 880, 'sine', 0.2);
        this.tone(t + 0.12, 0.3, 1174.7, 'sine', 0.2);
        break;
      case 'fanfare':
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(t + i * 0.11, 0.35, f, 'triangle', 0.25));
        break;
    }
  }

  // ---- Synthesis -------------------------------------------------------------------

  /** A note with a quick attack and exponential fade; optionally sliding to another pitch. */
  private tone(at: number, dur: number, freq: number, type: OscillatorType, vol: number, slideTo?: number, out?: AudioNode): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(g).connect(out ?? this.sfxGain!);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  /** Filtered noise (sizzle, pour, crumbs, thud). */
  private hiss(at: number, dur: number, vol: number, type: BiquadFilterType, freq: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(this.sfxGain!);
    src.start(at, Math.random() * 0.5);
    src.stop(at + dur + 0.02);
  }

  // ---- Music -----------------------------------------------------------------------

  private startMusic(): void {
    if (this.musicTimer || !this.ctx) return;
    this.nextNoteAt = this.ctx.currentTime + 0.1;
    // Schedule a little ahead every 50 ms, so timing stays tight even if the page stutters.
    this.musicTimer = setInterval(() => this.scheduleMusic(), 50);
  }

  private stopMusic(): void {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  private scheduleMusic(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain) return;
    const eighth = 60 / BPM / 2;
    // Fell behind (the context was paused or the timer throttled): pick up from now, not with a burst of old notes.
    if (this.nextNoteAt < ctx.currentTime - 0.1) this.nextNoteAt = ctx.currentTime + 0.05;
    while (this.nextNoteAt < ctx.currentTime + 0.25) {
      const bar = Math.floor(this.step / 8) % CHORDS.length;
      const beat = this.step % 8;
      const chord = CHORDS[bar]!;
      const at = this.nextNoteAt;
      if (beat === 0) {
        // Soft bass on the root, and the chord as a quiet pad.
        this.tone(at, eighth * 7, chord[0]! / 2, 'sine', 0.5, undefined, this.musicGain);
        for (const f of chord) this.tone(at, eighth * 8, f, 'sine', 0.08, undefined, this.musicGain);
      }
      const m = MELODY[bar]![beat]!;
      if (m >= 0) this.tone(at, eighth * 1.6, chord[m]! * 2, 'triangle', 0.22, undefined, this.musicGain);
      this.step++;
      this.nextNoteAt += eighth;
    }
  }
}
