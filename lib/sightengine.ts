import "server-only";
import { z } from "zod";
import { isMockMode } from "@/lib/ai/client";
import type { Language } from "@/lib/ai/schemas";
import { detectionFromScore, type AiDetection } from "@/lib/ai-detection";
import { readIntEnv } from "@/lib/env";
import { prepareForVision } from "@/lib/vision-analyzer";

const ENDPOINT = "https://api.sightengine.com/1.0/check.json";

export const AI_DETECTION_WARNING_CODE = "DETECTION_IA_NON_DISPONIBLE";

export type AiDetectionWarning = { code: typeof AI_DETECTION_WARNING_CODE; message: string };

export type AiDetectionOutcome = { detection: AiDetection; warnings: AiDetectionWarning[] };

const UNAVAILABLE: Record<Language, string> = {
  mg: "Tsy azo atao vetivety ny fitadiavana famantarana sary noforonin'ny IA.",
  fr: "La détection d'image générée par IA est momentanément indisponible.",
  en: "AI-generated image detection is temporarily unavailable.",
};

const responseSchema = z.object({
  status: z.literal("success"),
  type: z.object({ ai_generated: z.number().min(0).max(1) }),
});

type Credentials = { user: string; secret: string };

function readCredentials(): Credentials | null {
  const user = process.env.SIGHTENGINE_API_USER?.trim();
  const secret = process.env.SIGHTENGINE_API_SECRET?.trim();
  return user && secret ? { user, secret } : null;
}

function logFailure(stage: string, providerStatus: number | null = null) {
  console.error(JSON.stringify({ scope: "ai-detection", stage, providerStatus }));
}

async function requestScore(image: Uint8Array, credentials: Credentials, timeoutMs: number): Promise<number | null> {
  const form = new FormData();
  form.append("media", new Blob([Buffer.from(image)], { type: "image/jpeg" }), "image.jpg");
  form.append("models", "genai");
  form.append("api_user", credentials.user);
  form.append("api_secret", credentials.secret);

  let res: Response;
  try {
    res = await fetch(ENDPOINT, { method: "POST", body: form, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  } catch (error) {
    logFailure(error instanceof Error && error.name === "TimeoutError" ? "timeout" : "network");
    return null;
  }
  if (!res.ok) {
    logFailure(res.status === 401 ? "credentials" : "http", res.status);
    return null;
  }
  const body: unknown = await res.json().catch(() => null);
  const parsed = responseSchema.safeParse(body);
  if (parsed.success) return parsed.data.type.ai_generated;
  logFailure("invalid_response", res.status);
  return null;
}

export async function detectAiGeneration(bytes: Uint8Array, lang: Language = "fr"): Promise<AiDetectionOutcome> {
  if (isMockMode()) return { detection: { status: "unavailable", reason: "mock" }, warnings: [] };

  const failed = (): AiDetectionOutcome => ({
    detection: { status: "unavailable", reason: "failed" },
    warnings: [{ code: AI_DETECTION_WARNING_CODE, message: UNAVAILABLE[lang] }],
  });

  const credentials = readCredentials();
  if (!credentials) return { detection: { status: "unavailable", reason: "not_configured" }, warnings: [] };

  let image: Uint8Array;
  try {
    image = await prepareForVision(bytes);
  } catch {
    logFailure("prepare");
    return failed();
  }

  const score = await requestScore(image, credentials, readIntEnv("AI_DETECTION_TIMEOUT_MS", 15_000, 1_000, 60_000));
  return score === null ? failed() : { detection: detectionFromScore(score), warnings: [] };
}
