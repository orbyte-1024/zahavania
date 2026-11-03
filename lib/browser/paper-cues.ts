export const SORT_START = 0.4;
export const SORT_END = 0.88;
const MIN_DELTA = 0.0015;

export type PaperCue = { kind: "flutter"; intensity: number } | { kind: "land"; count: number } | { kind: "settle" };

export function paperCues(previous: number, current: number): PaperCue[] {
  const delta = current - previous;
  if (Math.abs(delta) < MIN_DELTA) return [];
  const speed = Math.min(1, Math.abs(delta) * 40);
  const cues: PaperCue[] = [];
  const scattering = current < SORT_START || (delta < 0 && current < SORT_END);
  if (scattering) cues.push({ kind: "flutter", intensity: speed });
  if (delta > 0 && current > SORT_START && previous < SORT_END) cues.push({ kind: "land", count: Math.max(1, Math.ceil(speed * 4)) });
  if (previous < SORT_END && current >= SORT_END) cues.push({ kind: "settle" });
  return cues;
}
