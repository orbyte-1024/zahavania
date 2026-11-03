export const AI_DETECTION_PROVIDER = "Sightengine";

export const AI_LEVEL_UNCERTAIN_FROM = 30;
export const AI_LEVEL_HIGH_FROM = 70;

export type AiSignalLevel = "low" | "uncertain" | "high";

export type AiDetectionUnavailableReason = "not_configured" | "failed" | "mock";

export type AiDetection =
  | { status: "ok"; index: number; level: AiSignalLevel; provider: typeof AI_DETECTION_PROVIDER; checkedAt: string }
  | { status: "unavailable"; reason: AiDetectionUnavailableReason };

export function toAiIndex(score: number): number {
  if (!Number.isFinite(score)) throw new RangeError("score must be finite");
  return Math.round(Math.min(1, Math.max(0, score)) * 100);
}

export function aiSignalLevel(index: number): AiSignalLevel {
  if (index >= AI_LEVEL_HIGH_FROM) return "high";
  if (index >= AI_LEVEL_UNCERTAIN_FROM) return "uncertain";
  return "low";
}

export function detectionFromScore(score: number, checkedAt: Date = new Date()): AiDetection {
  const index = toAiIndex(score);
  return { status: "ok", index, level: aiSignalLevel(index), provider: AI_DETECTION_PROVIDER, checkedAt: checkedAt.toISOString() };
}
