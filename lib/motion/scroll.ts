export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export const mix = (from: number, to: number, t: number): number => from + (to - from) * t;

export const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);

export const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function seg(progress: number, start: number, end: number, ease?: (t: number) => number): number {
  const t = clamp((progress - start) / (end - start), 0, 1);
  return ease ? ease(t) : t;
}

export function pinnedProgress(top: number, height: number, viewport: number): number {
  const length = height - viewport;
  if (length <= 0) return top <= 0 ? 1 : 0;
  return clamp(-top / length, 0, 1);
}

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function relayOpacity(distance: number): number {
  return distance >= 0 ? clamp(1 - distance / 0.35, 0, 1) : clamp((distance + 0.75) / 0.4, 0, 1);
}
