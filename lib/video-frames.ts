export const FRAME_COUNT = 6;
export const FRAME_EDGE_MARGIN = 0.02;
export const FRAME_MAX_EDGE = 1024;
export const FRAME_MAX_BYTES = 900 * 1024;
export const FRAMES_MAX_TOTAL_BYTES = 3_800_000;
export const VIDEO_MAX_DURATION_SECONDS = 4 * 60 * 60;

export type Confidence = "low" | "medium" | "high";

export type FrameObservation = { text: string; confidence: Confidence };

export type FrameAnalysis = {
  description: FrameObservation;
  visualInconsistencies: FrameObservation[];
  possibleAIGenerationIndicators: FrameObservation[];
  locationClues: FrameObservation[];
  limitations: FrameObservation;
};

export type FrameOutcome = { timestamp: number; analysis: FrameAnalysis | null };

export type TimedObservation = FrameObservation & { timestamps: number[] };

export type FrameReport = { timestamp: number; status: "analysed" | "failed"; analysis: FrameAnalysis | null };

export type AggregatedFrames = {
  frames: FrameReport[];
  analysedCount: number;
  failedCount: number;
  visualInconsistencies: TimedObservation[];
  possibleAIGenerationIndicators: TimedObservation[];
  locationClues: TimedObservation[];
};

const CONFIDENCE_RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

export function frameTimestamps(duration: number, count = FRAME_COUNT): number[] {
  if (!Number.isFinite(duration) || duration <= 0 || count < 1) return [];
  const start = duration * FRAME_EDGE_MARGIN;
  const end = duration * (1 - FRAME_EDGE_MARGIN);
  if (count === 1) return [round3((start + end) / 2)];
  const step = (end - start) / (count - 1);
  return [...new Set(Array.from({ length: count }, (_, i) => round3(start + step * i)))];
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function mergeObservations(outcomes: FrameOutcome[], pick: (analysis: FrameAnalysis) => FrameObservation[]): TimedObservation[] {
  const merged = new Map<string, TimedObservation>();
  for (const { timestamp, analysis } of outcomes) {
    if (!analysis) continue;
    for (const observation of pick(analysis)) {
      const text = observation.text.trim();
      if (!text) continue;
      const key = normalize(text);
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, { text, confidence: observation.confidence, timestamps: [timestamp] });
        continue;
      }
      if (!existing.timestamps.includes(timestamp)) existing.timestamps.push(timestamp);
      if (CONFIDENCE_RANK[observation.confidence] > CONFIDENCE_RANK[existing.confidence]) existing.confidence = observation.confidence;
    }
  }
  return [...merged.values()].map((entry) => ({ ...entry, timestamps: [...entry.timestamps].sort((a, b) => a - b) }));
}

export function aggregateFrames(outcomes: FrameOutcome[]): AggregatedFrames {
  const sorted = [...outcomes].sort((a, b) => a.timestamp - b.timestamp);
  const frames: FrameReport[] = sorted.map(({ timestamp, analysis }) => ({
    timestamp,
    status: analysis ? "analysed" : "failed",
    analysis,
  }));
  const analysedCount = frames.filter((frame) => frame.status === "analysed").length;
  return {
    frames,
    analysedCount,
    failedCount: frames.length - analysedCount,
    visualInconsistencies: mergeObservations(sorted, (a) => a.visualInconsistencies),
    possibleAIGenerationIndicators: mergeObservations(sorted, (a) => a.possibleAIGenerationIndicators),
    locationClues: mergeObservations(sorted, (a) => a.locationClues),
  };
}

function withTimes(observation: TimedObservation): FrameObservation {
  return { text: `[${observation.timestamps.map(formatTimestamp).join(", ")}] ${observation.text}`, confidence: observation.confidence };
}

export function combinedAnalysis(aggregated: AggregatedFrames): FrameAnalysis | null {
  const analysed = aggregated.frames.filter((frame): frame is FrameReport & { analysis: FrameAnalysis } => frame.analysis !== null);
  const first = analysed[0];
  if (!first) return null;
  const limitations = [...new Set(analysed.map((frame) => frame.analysis.limitations.text.trim()).filter(Boolean))];
  return {
    description: { text: `[${formatTimestamp(first.timestamp)}] ${first.analysis.description.text}`, confidence: first.analysis.description.confidence },
    visualInconsistencies: aggregated.visualInconsistencies.map(withTimes),
    possibleAIGenerationIndicators: aggregated.possibleAIGenerationIndicators.map(withTimes),
    locationClues: aggregated.locationClues.map(withTimes),
    limitations: { text: limitations.join(" "), confidence: "low" },
  };
}

export async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, run: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await run(items[index] as T, index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
  return results;
}
