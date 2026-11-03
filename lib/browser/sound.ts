import { paperCues } from "@/lib/browser/paper-cues";

const STORAGE_KEY = "zahavania:sound";
const MASTER_VOLUME = 0.55;
const MUSIC_VOLUME = 0.16;
const PAPER_VOLUME = 0.5;
const TEMPO = 104;
const STEPS_PER_BAR = 12;
const LOOKAHEAD_S = 0.12;
const TICK_MS = 30;

const CHORDS: readonly (readonly number[])[] = [
  [60, 64, 67],
  [55, 59, 62],
  [57, 60, 64],
  [53, 57, 60],
];
const BASS: readonly number[] = [36, 31, 33, 29];
const MELODY: readonly (readonly (number | null)[])[] = [
  [72, null, 76, 79, null, 76, 74, null, 72, 74, null, 76],
  [74, null, 71, 74, null, 79, 77, null, 76, 74, null, 71],
  [72, null, 76, 81, null, 79, 76, null, 79, 81, null, 84],
  [81, null, 77, 79, null, 76, 74, null, 72, 74, 76, null],
];
const BASS_STEPS = new Set([0, 3, 6, 9]);
const SHAKER_STEPS = new Set([1, 2, 4, 5, 7, 8, 10, 11]);

type Listener = () => void;

function midiToHz(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

function readPreference(): boolean | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "on" ? true : value === "off" ? false : null;
  } catch {
    return null;
  }
}

function writePreference(enabled: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    return;
  }
}

function prefersCalm(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

class SoundEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private paperBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private timer: number | null = null;
  private nextStepTime = 0;
  private step = 0;
  private bar = 0;
  private musicWanted = false;
  private enabled = false;
  private ready = false;
  private listeners = new Set<Listener>();
  private lastFlutter = 0;
  private lastLand = 0;

  init(): void {
    if (this.ready || typeof window === "undefined") return;
    this.ready = true;
    this.enabled = readPreference() ?? !prefersCalm();
    document.addEventListener("visibilitychange", () => this.syncPlayback());
  }

  isEnabled(): boolean {
    this.init();
    return this.enabled;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    writePreference(enabled);
    this.listeners.forEach((listener) => listener());
    if (enabled) this.unlock();
    this.syncPlayback();
  }

  unlock(): void {
    if (!this.enabled) return;
    const context = this.ensureContext();
    if (context && context.state === "suspended") void context.resume().then(() => this.syncPlayback());
    else this.syncPlayback();
  }

  setMusic(wanted: boolean): void {
    this.musicWanted = wanted;
    this.syncPlayback();
  }

  flutter(intensity: number): void {
    const context = this.playableContext();
    if (!context) return;
    const now = context.currentTime;
    if (now - this.lastFlutter < 0.07) return;
    this.lastFlutter = now;
    const grains = 2 + Math.round(Math.min(1, intensity) * 6);
    for (let i = 0; i < grains; i += 1) {
      this.grain(now + Math.random() * 0.22, 0.03 + Math.random() * 0.09, 1800 + Math.random() * 4200, 0.25 + Math.min(1, intensity) * 0.55);
    }
  }

  land(count: number): void {
    const context = this.playableContext();
    if (!context) return;
    const now = context.currentTime;
    if (now - this.lastLand < 0.06) return;
    this.lastLand = now;
    for (let i = 0; i < Math.min(6, count); i += 1) {
      this.grain(now + i * 0.035 + Math.random() * 0.02, 0.025 + Math.random() * 0.03, 2600 + Math.random() * 1800, 0.45);
    }
  }

  settle(): void {
    const context = this.playableContext();
    if (!context) return;
    const now = context.currentTime;
    let at = now;
    for (let i = 0; i < 9; i += 1) {
      this.grain(at, 0.03 + Math.random() * 0.03, 3200 - i * 180, 0.5 - i * 0.03);
      at += 0.055 - i * 0.004;
    }
    this.thump(at + 0.02);
  }

  private ensureContext(): AudioContext | null {
    if (this.context) return this.context;
    if (typeof window === "undefined" || typeof window.AudioContext === "undefined") return null;
    const context = new AudioContext();
    const master = context.createGain();
    master.gain.value = MASTER_VOLUME;
    master.connect(context.destination);
    const musicBus = context.createGain();
    musicBus.gain.value = 0;
    musicBus.connect(master);
    const paperBus = context.createGain();
    paperBus.gain.value = PAPER_VOLUME;
    paperBus.connect(master);
    const noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    this.context = context;
    this.master = master;
    this.musicBus = musicBus;
    this.paperBus = paperBus;
    this.noise = noise;
    return context;
  }

  private playableContext(): AudioContext | null {
    if (!this.enabled || !this.context || this.context.state !== "running" || document.hidden) return null;
    return this.context;
  }

  private syncPlayback(): void {
    const context = this.context;
    if (!context || !this.musicBus) return;
    const play = this.enabled && this.musicWanted && !document.hidden && context.state === "running";
    const now = context.currentTime;
    this.musicBus.gain.cancelScheduledValues(now);
    this.musicBus.gain.setTargetAtTime(play ? MUSIC_VOLUME : 0, now, play ? 0.8 : 0.25);
    if (play && this.timer === null) {
      this.nextStepTime = now + 0.08;
      this.timer = window.setInterval(() => this.schedule(), TICK_MS);
    } else if (!play && this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  private schedule(): void {
    const context = this.context;
    if (!context) return;
    const stepDuration = 60 / TEMPO / 3;
    while (this.nextStepTime < context.currentTime + LOOKAHEAD_S) {
      this.playStep(this.nextStepTime, stepDuration);
      this.nextStepTime += stepDuration * (this.step % 2 === 0 ? 1.06 : 0.94);
      this.step = (this.step + 1) % STEPS_PER_BAR;
      if (this.step === 0) this.bar = (this.bar + 1) % CHORDS.length;
    }
  }

  private playStep(time: number, stepDuration: number): void {
    const note = MELODY[this.bar][this.step];
    if (note !== null) this.pluck(midiToHz(note), time, 0.55, 0.32);
    if (this.step === 0 || this.step === 6) {
      CHORDS[this.bar].forEach((chordNote, i) => this.pluck(midiToHz(chordNote), time + i * 0.018, 0.9, 0.11));
    }
    if (BASS_STEPS.has(this.step)) this.bass(midiToHz(BASS[this.bar] + (this.step === 6 ? 7 : 0)), time, stepDuration * 2.4);
    if (SHAKER_STEPS.has(this.step)) this.shaker(time, this.step % 3 === 1 ? 0.07 : 0.045);
  }

  private pluck(frequency: number, time: number, decay: number, level: number): void {
    const context = this.context;
    if (!context || !this.musicBus) return;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(level, time + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + decay);
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(Math.min(9000, frequency * 8), time);
    filter.frequency.exponentialRampToValueAtTime(Math.max(400, frequency * 1.5), time + decay * 0.7);
    filter.connect(gain).connect(this.musicBus);
    for (const [type, ratio, amount] of [["triangle", 1, 1], ["sine", 2, 0.35], ["sine", 3, 0.12]] as const) {
      const oscillator = context.createOscillator();
      const partial = context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency * ratio, time);
      partial.gain.value = amount;
      oscillator.connect(partial).connect(filter);
      oscillator.start(time);
      oscillator.stop(time + decay + 0.05);
    }
  }

  private bass(frequency: number, time: number, length: number): void {
    const context = this.context;
    if (!context || !this.musicBus) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.55, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + length);
    oscillator.connect(gain).connect(this.musicBus);
    oscillator.start(time);
    oscillator.stop(time + length + 0.05);
  }

  private shaker(time: number, level: number): void {
    const context = this.context;
    if (!context || !this.musicBus || !this.noise) return;
    const source = context.createBufferSource();
    source.buffer = this.noise;
    const filter = context.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 6500;
    const gain = context.createGain();
    gain.gain.setValueAtTime(level, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    source.connect(filter).connect(gain).connect(this.musicBus);
    source.start(time, Math.random() * 1.5, 0.06);
  }

  private grain(time: number, length: number, frequency: number, level: number): void {
    const context = this.context;
    if (!context || !this.paperBus || !this.noise) return;
    const source = context.createBufferSource();
    source.buffer = this.noise;
    source.playbackRate.value = 0.8 + Math.random() * 0.5;
    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = frequency;
    filter.Q.value = 0.7 + Math.random() * 0.8;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.01, level), time + length * 0.25);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + length);
    const pan = context.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    source.connect(filter).connect(gain).connect(pan).connect(this.paperBus);
    source.start(time, Math.random() * 1.8, length + 0.02);
  }

  private thump(time: number): void {
    const context = this.context;
    if (!context || !this.paperBus || !this.noise) return;
    const source = context.createBufferSource();
    source.buffer = this.noise;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 260;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.9, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.14);
    source.connect(filter).connect(gain).connect(this.paperBus);
    source.start(time, Math.random(), 0.16);
  }
}

export const sound = new SoundEngine();

export function playPaperCues(previous: number, current: number): void {
  for (const cue of paperCues(previous, current)) {
    if (cue.kind === "flutter") sound.flutter(cue.intensity);
    else if (cue.kind === "land") sound.land(cue.count);
    else sound.settle();
  }
}
