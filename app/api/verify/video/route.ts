import type { NextRequest } from "next/server";
import { z } from "zod";
import { isMockMode } from "@/lib/ai/client";
import { languageSchema } from "@/lib/ai/schemas";
import type { VerifyVideoSuccess } from "@/lib/api/contract";
import { readIntEnv } from "@/lib/env";
import { acceptUploadedFrames } from "@/lib/image-intake";
import { clientIp, createRateLimiter } from "@/lib/security/ratelimit";
import { reverseSearchLinks } from "@/lib/reverse-search";
import { authenticate } from "@/lib/security/auth";
import { errorResponse, jsonResponse, startTimer, tooManyRequests } from "@/lib/security/request";
import { buildVerification, type VisionWarning } from "@/lib/verification-summary";
import { aggregateFrames, combinedAnalysis, mapWithConcurrency, VIDEO_MAX_DURATION_SECONDS } from "@/lib/video-frames";
import { analyzeImage } from "@/lib/vision-analyzer";

export const maxDuration = 300;

const MINUTE_MS = 60_000;
const FRAME_CONCURRENCY = 2;
const FRAME_TIMEOUT_MS = 30_000;

const ipLimiter = createRateLimiter({ name: "verify-video:ip", limit: 10, windowMs: MINUTE_MS });
const userLimiter = createRateLimiter({ name: "verify-video:user", limit: 5, windowMs: MINUTE_MS });
const dailyLimiter = createRateLimiter({
  name: "verify-video:daily",
  limit: readIntEnv("AI_DAILY_LIMIT_PER_USER", 50, 1, 10_000),
  windowMs: 24 * 60 * MINUTE_MS,
});

const fieldsSchema = z
  .object({
    lang: languageSchema.default("fr"),
    duration: z.coerce.number().positive().max(VIDEO_MAX_DURATION_SECONDS),
    timestamps: z.string().max(500).transform((raw, ctx) => {
      try {
        return z.array(z.number().nonnegative()).min(1).parse(JSON.parse(raw));
      } catch {
        ctx.addIssue({ code: "custom", message: "invalid timestamps" });
        return z.NEVER;
      }
    }),
  })
  .refine((fields) => fields.timestamps.every((t, i, all) => t <= fields.duration && (i === 0 || t > (all[i - 1] ?? -1))), {
    message: "timestamps out of range",
  });

type LogEntry = { userId: string | null; durationMs: number; status: number; code?: string; frames?: number; failed?: number };

function logRequest(entry: LogEntry) {
  const line = JSON.stringify({ route: "POST /api/verify/video", ...entry });
  if (entry.status >= 500) console.error(line);
  else console.info(line);
}

const MESSAGES: Record<number, string> = {
  400: "The video frames could not be read.",
  413: "The video frames are too large.",
  415: "Only JPEG frames are accepted.",
};

export async function POST(req: NextRequest) {
  const elapsed = startTimer();
  const ip = clientIp(req);

  const ipCheck = await ipLimiter.check(ip);
  if (!ipCheck.allowed) {
    logRequest({ userId: null, durationMs: elapsed(), status: 429, code: "ip_rate_limited" });
    return tooManyRequests(ipCheck.retryAfterSeconds, "rate_limited");
  }

  const auth = await authenticate(req);
  if (!auth.ok) {
    const status = auth.reason === "config_missing" ? 503 : 401;
    logRequest({ userId: null, durationMs: elapsed(), status, code: auth.reason });
    return status === 503
      ? errorResponse(503, "auth_unavailable", "Authentication is temporarily unavailable.")
      : errorResponse(401, "unauthorized", "You must be signed in to use this feature.");
  }
  const userKey = auth.demo ? `demo:${ip}` : auth.userId;

  const userCheck = await userLimiter.check(userKey);
  if (!userCheck.allowed) {
    logRequest({ userId: auth.userId, durationMs: elapsed(), status: 429, code: "user_rate_limited" });
    return tooManyRequests(userCheck.retryAfterSeconds, "rate_limited");
  }

  const intake = await acceptUploadedFrames(req);
  if (!intake.ok) {
    logRequest({ userId: auth.userId, durationMs: elapsed(), status: intake.status, code: intake.code });
    return errorResponse(intake.status, intake.code, MESSAGES[intake.status] ?? "Invalid request.");
  }

  const fields = fieldsSchema.safeParse({
    lang: intake.fields.get("lang") ?? undefined,
    duration: intake.fields.get("duration") ?? undefined,
    timestamps: intake.fields.get("timestamps") ?? undefined,
  });
  if (!fields.success || fields.data.timestamps.length !== intake.frames.length) {
    logRequest({ userId: auth.userId, durationMs: elapsed(), status: 400, code: "invalid_input" });
    return jsonResponse({ ok: false, error: { code: "invalid_input", message: "Invalid request.", fields: ["lang", "duration", "timestamps"] } }, 400);
  }

  const dailyCheck = await dailyLimiter.check(userKey);
  if (!dailyCheck.allowed) {
    logRequest({ userId: auth.userId, durationMs: elapsed(), status: 429, code: "daily_quota_exceeded" });
    return tooManyRequests(dailyCheck.retryAfterSeconds, "daily_quota_exceeded");
  }

  try {
    const { lang, duration, timestamps } = fields.data;
    const results = await mapWithConcurrency(intake.frames, FRAME_CONCURRENCY, (bytes) =>
      analyzeImage(bytes, "image/jpeg", lang, { timeoutMs: FRAME_TIMEOUT_MS }),
    );
    const aggregated = aggregateFrames(results.map((result, i) => ({ timestamp: timestamps[i] ?? 0, analysis: result.analysis })));
    const merged = combinedAnalysis(aggregated);
    const warnings: VisionWarning[] = merged === null ? (results[0]?.warnings ?? []) : [];
    const reverseSearch = reverseSearchLinks();
    const verification = buildVerification(null, [], merged, warnings, reverseSearch, null, lang);

    logRequest({ userId: auth.userId, durationMs: elapsed(), status: 200, frames: aggregated.frames.length, failed: aggregated.failedCount });
    return jsonResponse({
      ok: true,
      mock: isMockMode(),
      video: { duration, framesReceived: intake.frames.length, totalBytes: intake.totalBytes },
      frames: aggregated.frames,
      analysedCount: aggregated.analysedCount,
      failedCount: aggregated.failedCount,
      observations: {
        visualInconsistencies: aggregated.visualInconsistencies,
        possibleAIGenerationIndicators: aggregated.possibleAIGenerationIndicators,
        locationClues: aggregated.locationClues,
      },
      warnings,
      reverseSearch,
      verification: {
        status: verification.status,
        summary: verification.summary,
        supportingEvidence: verification.supportingEvidence,
        contradictoryEvidence: verification.contradictoryEvidence,
        limitations: verification.limitations,
      },
      meta: { durationMs: elapsed() },
    } satisfies VerifyVideoSuccess);
  } catch (error) {
    logRequest({ userId: auth.userId, durationMs: elapsed(), status: 500, code: error instanceof Error ? error.name : "unknown" });
    return errorResponse(500, "internal_error", "An unexpected error occurred.");
  }
}
