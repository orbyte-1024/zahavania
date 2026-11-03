import { paperCues } from "@/lib/browser/paper-cues";

const STORAGE_KEY = "zahavania:sound";
const MASTER_VOLUME = 0.9;
const PAPER_VOLUME = 2;

type Listener = () => void;

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
  private paperBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private enabled = false;
  private ready = false;
  private listeners = new Set<Listener>();
  private lastFlutter = 0;
  private lastLand = 0;

  init(): void {
    if (this.ready || typeof window === "undefined") return;
    this.ready = true;
    this.enabled = readPreference() ?? !prefersCalm();
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
  }

  unlock(): void {
    if (!this.enabled) return;
    const context = this.ensureContext();
    if (context && context.state === "suspended") void context.resume();
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
    let at = context.currentTime;
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
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -18;
    limiter.knee.value = 12;
    limiter.ratio.value = 6;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.2;
    limiter.connect(context.destination);
    const master = context.createGain();
    master.gain.value = MASTER_VOLUME;
    master.connect(limiter);
    const paperBus = context.createGain();
    paperBus.gain.value = PAPER_VOLUME;
    paperBus.connect(master);
    const noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    this.context = context;
    this.paperBus = paperBus;
    this.noise = noise;
    return context;
  }

  private playableContext(): AudioContext | null {
    if (!this.enabled || !this.context || this.context.state !== "running" || document.hidden) return null;
    return this.context;
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
    filter.Q.value = 0.4 + Math.random() * 0.5;
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
