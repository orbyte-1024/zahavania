import type { NextRequest } from "next/server";
import { AiError, isMockMode, type AiUsage } from "@/lib/ai/client";
import { verifyInputSchema, type VerifyInput } from "@/lib/ai/schemas";
import { VerificationError, verifyContent } from "@/lib/ai/verify";
import type { VerifyTextSuccess } from "@/lib/api/contract";
import { createTtlCache, hashKey, normalizeText } from "@/lib/cache";
import { demoFallbackMode, isDemoRecording, readDemoRecording, writeDemoRecording } from "@/lib/demo/replay";
import { readIntEnv } from "@/lib/env";
import { clientIp, createRateLimiter } from "@/lib/security/ratelimit";
import { authenticate } from "@/lib/security/auth";
import { errorResponse, jsonResponse, readJsonBody, startTimer, tooManyRequests } from "@/lib/security/request";
import { SafeFetchError } from "@/lib/security/safe-fetch";

export const maxDuration = 180;

const MAX_BODY_BYTES = 32 * 1024;
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

const ipLimiter = createRateLimiter({ limit: 10, windowMs: MINUTE_MS });
const userLimiter = createRateLimiter({ limit: 10, windowMs: MINUTE_MS });
const dailyLimiter = createRateLimiter({
  limit: readIntEnv("AI_DAILY_LIMIT_PER_USER", 50, 1, 10_000),
  windowMs: DAY_MS,
});

type VerifyPayload = Pick<VerifyTextSuccess, "result"> & Pick<VerifyTextSuccess["meta"], "analyzedUrl" | "droppedSources">;

const resultCache = createTtlCache<VerifyPayload>({
  ttlMs: readIntEnv("AI_CACHE_TTL_SECONDS", 600, 0, 3_600) * 1_000,
  maxEntries: 200,
});

function canonicalInput(input: VerifyInput) {
  return {
    type: input.type,
    lang: input.lang ?? null,
    content: input.type === "text" ? normalizeText(input.content) : input.content.trim(),
  };
}

function successBody(
  payload: VerifyPayload,
  extra: { mock: boolean; durationMs: number; cached: boolean; recordedAt: string | null },
): VerifyTextSuccess {
  return {
    ok: true,
    mock: extra.mock,
    result: payload.result,
    meta: {
      analyzedUrl: payload.analyzedUrl,
      droppedSources: payload.droppedSources,
      durationMs: extra.durationMs,
      cached: extra.cached,
      replayed: extra.recordedAt !== null,
      recordedAt: extra.recordedAt,
    },
  };
}

function isReplayable(error: unknown): boolean {
  if (error instanceof AiError) return true;
  return error instanceof SafeFetchError && error.code !== "invalid_url" && error.code !== "blocked_destination";
}

type LogEntry = {
  userId: string | null;
  durationMs: number;
  status: number;
  code?: string;
  detail?: string;
  usage?: AiUsage | null;
  attempts?: number;
  droppedSources?: number;
  served?: "cache" | "replay";
};

function logRequest(entry: LogEntry) {
  const line = JSON.stringify({ route: "POST /api/verify/text", ...entry });
  if (entry.status >= 500) console.error(line);
  else console.info(line);
}

function mapError(error: unknown): { status: number; code: string; message: string; detail: string } {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : "unknown error";

  if (error instanceof SafeFetchError) {
    if (error.code === "invalid_url" || error.code === "blocked_destination") {
      return { status: 400, code: "url_not_allowed", message: "This URL cannot be analyzed.", detail };
    }
    return { status: 422, code: "url_unreachable", message: "The page could not be retrieved as readable text.", detail };
  }
  if (error instanceof VerificationError) {
    return { status: 422, code: "url_no_content", message: "No readable text was found on this page.", detail };
  }
  if (error instanceof AiError) {
    if (error.code === "timeout") {
      return { status: 504, code: "ai_timeout", message: "The verification took too long. Please try again.", detail };
    }
    return { status: 503, code: "ai_unavailable", message: "Verification is temporarily unavailable.", detail };
  }
  return { status: 500, code: "internal_error", message: "An unexpected error occurred.", detail };
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
    const messages = { 400: "Invalid JSON body.", 413: "Request body is too large.", 415: "Content-Type must be application/json." };
    return errorResponse(body.status, "invalid_body", messages[body.status]);
  }

  const input = verifyInputSchema.safeParse(body.data);
  if (!input.success) {
    const fields = [...new Set(input.error.issues.map((issue) => issue.path.join(".") || "(root)"))];
    logRequest({ userId: auth.userId, durationMs: elapsed(), status: 400, code: "invalid_input" });
    return jsonResponse(
      { ok: false, error: { code: "invalid_input", message: "Invalid request.", fields } },
      400,
    );
  }

  const userKey = hashKey(["verify-text", auth.userId, canonicalInput(input.data)]);
  const demoKey = hashKey(["verify-text", canonicalInput(input.data)]);
  const replayMode = isMockMode() ? "off" : demoFallbackMode();

  const cached = resultCache.get(userKey);
  if (cached) {
    logRequest({ userId: auth.userId, durationMs: elapsed(), status: 200, served: "cache" });
    return jsonResponse(successBody(cached, { mock: false, durationMs: elapsed(), cached: true, recordedAt: null }));
  }

  if (replayMode === "always") {
    const recording = await readDemoRecording<VerifyPayload>("verify-text", demoKey);
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
    const result = await verifyContent(input.data);
    const payload: VerifyPayload = {
      result: result.output,
      analyzedUrl: result.analyzedUrl,
      droppedSources: result.droppedSources,
    };
    if (!result.mock) {
      resultCache.set(userKey, payload);
      if (isDemoRecording()) {
        await writeDemoRecording("verify-text", demoKey, payload).catch(() =>
          logRequest({ userId: auth.userId, durationMs: elapsed(), status: 200, code: "demo_record_failed" }),
        );
      }
    }
    logRequest({
      userId: auth.userId,
      durationMs: elapsed(),
      status: 200,
      usage: result.usage,
      attempts: result.attempts,
      droppedSources: result.droppedSources,
    });
    return jsonResponse(
      successBody(payload, { mock: result.mock, durationMs: elapsed(), cached: false, recordedAt: null }),
    );
  } catch (error) {
    const mapped = mapError(error);
    if (replayMode !== "off" && isReplayable(error)) {
      const recording = await readDemoRecording<VerifyPayload>("verify-text", demoKey);
      if (recording) {
        logRequest({ userId: auth.userId, durationMs: elapsed(), status: 200, code: mapped.code, served: "replay" });
        return jsonResponse(
          successBody(recording.payload, { mock: false, durationMs: elapsed(), cached: false, recordedAt: recording.recordedAt }),
        );
      }
    }
    logRequest({ userId: auth.userId, durationMs: elapsed(), status: mapped.status, code: mapped.code, detail: mapped.detail });
    return errorResponse(mapped.status, mapped.code, mapped.message);
  }
}
