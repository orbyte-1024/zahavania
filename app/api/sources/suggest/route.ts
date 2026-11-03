import type { NextRequest } from "next/server";
import { AiError, isMockMode, type AiUsage } from "@/lib/ai/client";
import type { SuggestExpertsSuccess } from "@/lib/api/contract";
import { createTtlCache, hashKey, normalizeText } from "@/lib/cache";
import { suggestInputSchema, type SuggestInput } from "@/lib/ai/expert-schemas";
import { ExpertDirectoryError } from "@/lib/db/experts";
import { demoFallbackMode, isDemoRecording, readDemoRecording, writeDemoRecording } from "@/lib/demo/replay";
import { readIntEnv } from "@/lib/env";
import { suggestExperts } from "@/lib/experts/suggest";
import { clientIp, createRateLimiter } from "@/lib/security/ratelimit";
import { authenticate } from "@/lib/security/auth";
import { errorResponse, jsonResponse, readJsonBody, startTimer, tooManyRequests } from "@/lib/security/request";

const MAX_BODY_BYTES = 16 * 1024;
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

const ipLimiter = createRateLimiter({ limit: 10, windowMs: MINUTE_MS });
const userLimiter = createRateLimiter({ limit: 10, windowMs: MINUTE_MS });
const dailyLimiter = createRateLimiter({
  limit: readIntEnv("AI_DAILY_LIMIT_PER_USER", 50, 1, 10_000),
  windowMs: DAY_MS,
});

type LogEntry = {
  userId: string | null;
  durationMs: number;
  status: number;
  code?: string;
  candidateCount?: number;
  suggestionCount?: number;
  usage?: AiUsage | null;
  served?: "cache" | "replay";
  detail?: string;
};

type SuggestPayload = Omit<SuggestExpertsSuccess, "ok" | "mock" | "meta">;

const resultCache = createTtlCache<SuggestPayload>({
  ttlMs: readIntEnv("AI_CACHE_TTL_SECONDS", 600, 0, 3_600) * 1_000,
  maxEntries: 200,
});

function canonicalInput(input: SuggestInput) {
  return {
    topic: normalizeText(input.topic),
    context: input.context ? normalizeText(input.context) : null,
    lang: input.lang ?? null,
    region: input.region ?? null,
    languages: [...(input.languages ?? [])].sort(),
    limit: input.limit,
  };
}

function successBody(
  payload: SuggestPayload,
  extra: { mock: boolean; durationMs: number; cached: boolean; recordedAt: string | null },
): SuggestExpertsSuccess {
  return {
    ok: true,
    mock: extra.mock,
    ...payload,
    meta: {
      durationMs: extra.durationMs,
      cached: extra.cached,
      replayed: extra.recordedAt !== null,
      recordedAt: extra.recordedAt,
    },
  };
}

function isReplayable(error: unknown): boolean {
  return error instanceof AiError || error instanceof ExpertDirectoryError;
}

function logRequest(entry: LogEntry) {
  const line = JSON.stringify({ route: "POST /api/sources/suggest", ...entry });
  if (entry.status >= 500) console.error(line);
  else console.info(line);
}

function mapError(error: unknown): { status: number; code: string; message: string } {
  if (error instanceof AiError) {
    if (error.code === "timeout") {
      return {
        status: 504,
        code: "ai_timeout",
        message: "The suggestion request took too long. Please try again.",
      };
    }
    return {
      status: 503,
      code: "ai_unavailable",
      message: "Expert suggestions are temporarily unavailable.",
    };
  }
  if (error instanceof ExpertDirectoryError) {
    return {
      status: 503,
      code: "directory_unavailable",
      message: "The expert directory is temporarily unavailable.",
    };
  }
  return { status: 500, code: "internal_error", message: "An unexpected error occurred." };
}

export async function POST(req: NextRequest) {
  const elapsed = startTimer();

  const ipCheck = ipLimiter.check(clientIp(req));
  if (!ipCheck.allowed) {
    logRequest({ userId: null, durationMs: elapsed(), status: 429, code: "ip_rate_limited" });
    return tooManyRequests(ipCheck.retryAfterSeconds);
  }

  const auth = await authenticate(req);
  if (!auth.ok) {
    if (auth.reason === "config_missing") {
      logRequest({ userId: null, durationMs: elapsed(), status: 503, code: "auth_config_missing" });
      return errorResponse(503, "auth_unavailable", "Authentication is temporarily unavailable.");
    }
    logRequest({ userId: null, durationMs: elapsed(), status: 401, code: auth.reason });
    return errorResponse(401, "unauthorized", "You must be signed in to use this feature.");
  }

  const userCheck = userLimiter.check(auth.userId);
  if (!userCheck.allowed) {
    logRequest({ userId: auth.userId, durationMs: elapsed(), status: 429, code: "user_rate_limited" });
    return tooManyRequests(userCheck.retryAfterSeconds);
  }

  const body = await readJsonBody(req, MAX_BODY_BYTES);
  if (!body.ok) {
    logRequest({ userId: auth.userId, durationMs: elapsed(), status: body.status, code: "invalid_body" });
    const messages = {
      400: "Invalid JSON body.",
      413: "Request body is too large.",
      415: "Content-Type must be application/json.",
    };
    return errorResponse(body.status, "invalid_body", messages[body.status]);
  }

  const input = suggestInputSchema.safeParse(body.data);
  if (!input.success) {
    const fields = [...new Set(input.error.issues.map((issue) => issue.path.join(".") || "(root)"))];
    logRequest({ userId: auth.userId, durationMs: elapsed(), status: 400, code: "invalid_input" });
    return jsonResponse(
      { ok: false, error: { code: "invalid_input", message: "Invalid request.", fields } },
      400,
    );
  }

  const userKey = hashKey(["sources-suggest", auth.userId, canonicalInput(input.data)]);
  const demoKey = hashKey(["sources-suggest", canonicalInput(input.data)]);
  const replayMode = isMockMode() ? "off" : demoFallbackMode();

  const cached = resultCache.get(userKey);
  if (cached) {
    logRequest({ userId: auth.userId, durationMs: elapsed(), status: 200, served: "cache" });
    return jsonResponse(successBody(cached, { mock: false, durationMs: elapsed(), cached: true, recordedAt: null }));
  }

  if (replayMode === "always") {
    const recording = await readDemoRecording<SuggestPayload>("sources-suggest", demoKey);
    if (recording) {
      logRequest({ userId: auth.userId, durationMs: elapsed(), status: 200, served: "replay" });
      return jsonResponse(
        successBody(recording.payload, { mock: false, durationMs: elapsed(), cached: false, recordedAt: recording.recordedAt }),
      );
    }
  }

  const dailyCheck = dailyLimiter.check(auth.userId);
  if (!dailyCheck.allowed) {
    logRequest({ userId: auth.userId, durationMs: elapsed(), status: 429, code: "daily_quota_exceeded" });
    return tooManyRequests(dailyCheck.retryAfterSeconds, "daily_quota_exceeded");
  }

  try {
    if (!auth.supabase && !isMockMode()) {
      throw new ExpertDirectoryError("supabase client unavailable");
    }
    const result = await suggestExperts(auth.supabase, input.data);
    const payload: SuggestPayload = {
      suggestions: result.suggestions,
      detectedDomains: result.detectedDomains,
      missingProfiles: result.missingProfiles,
      regionBroadened: result.regionBroadened,
      ...(result.notice ? { notice: result.notice } : {}),
    };
    if (!result.mock) {
      resultCache.set(userKey, payload);
      if (isDemoRecording()) {
        await writeDemoRecording("sources-suggest", demoKey, payload).catch(() =>
          logRequest({ userId: auth.userId, durationMs: elapsed(), status: 200, code: "demo_record_failed" }),
        );
      }
    }
    logRequest({
      userId: auth.userId,
      durationMs: elapsed(),
      status: 200,
      candidateCount: result.candidateCount,
      suggestionCount: result.suggestionCount,
      usage: result.usage,
    });
    return jsonResponse(
      successBody(payload, { mock: result.mock, durationMs: elapsed(), cached: false, recordedAt: null }),
    );
  } catch (error) {
    const mapped = mapError(error);
    if (replayMode !== "off" && isReplayable(error)) {
      const recording = await readDemoRecording<SuggestPayload>("sources-suggest", demoKey);
      if (recording) {
        logRequest({ userId: auth.userId, durationMs: elapsed(), status: 200, code: mapped.code, served: "replay" });
        return jsonResponse(
          successBody(recording.payload, { mock: false, durationMs: elapsed(), cached: false, recordedAt: recording.recordedAt }),
        );
      }
    }
    logRequest({
      userId: auth.userId,
      durationMs: elapsed(),
      status: mapped.status,
      code: mapped.code,
      detail: error instanceof Error ? `${error.name}: ${error.message}` : "unknown error",
    });
    return errorResponse(mapped.status, mapped.code, mapped.message);
  }
}
