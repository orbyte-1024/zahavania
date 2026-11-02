import type { NextRequest } from "next/server";
import { AiError, isMockMode, type AiUsage } from "@/lib/ai/client";
import type { SuggestExpertsSuccess } from "@/lib/api/contract";
import { suggestInputSchema } from "@/lib/ai/expert-schemas";
import { ExpertDirectoryError } from "@/lib/db/experts";
import { readIntEnv } from "@/lib/env";
import { suggestExperts } from "@/lib/experts/suggest";
import { clientIp, createRateLimiter } from "@/lib/ratelimit";
import { authenticate } from "@/lib/security/auth";
import { errorResponse, jsonResponse, readJsonBody, startTimer } from "@/lib/security/request";

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
};

function logRequest(entry: LogEntry) {
  const line = JSON.stringify({ route: "POST /api/sources/suggest", ...entry });
  if (entry.status >= 500) console.error(line);
  else console.info(line);
}

function tooManyRequests(retryAfterSeconds: number, code = "rate_limited") {
  return errorResponse(429, code, "Too many requests. Please try again later.", {
    "Retry-After": String(retryAfterSeconds),
  });
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

  const dailyCheck = dailyLimiter.check(auth.userId);
  if (!dailyCheck.allowed) {
    logRequest({ userId: auth.userId, durationMs: elapsed(), status: 429, code: "daily_quota_exceeded" });
    return tooManyRequests(dailyCheck.retryAfterSeconds, "daily_quota_exceeded");
  }

  if (!auth.supabase && !isMockMode()) {
    logRequest({ userId: auth.userId, durationMs: elapsed(), status: 503, code: "supabase_config_missing" });
    return errorResponse(503, "directory_unavailable", "The expert directory is not configured.");
  }

  try {
    const result = await suggestExperts(auth.supabase, input.data);
    logRequest({
      userId: auth.userId,
      durationMs: elapsed(),
      status: 200,
      candidateCount: result.candidateCount,
      suggestionCount: result.suggestionCount,
      usage: result.usage,
    });
    return jsonResponse({
      ok: true,
      suggestions: result.suggestions,
      detectedDomains: result.detectedDomains,
      missingProfiles: result.missingProfiles,
      regionBroadened: result.regionBroadened,
      mock: result.mock,
      ...(result.notice ? { notice: result.notice } : {}),
    } satisfies SuggestExpertsSuccess);
  } catch (error) {
    const mapped = mapError(error);
    logRequest({ userId: auth.userId, durationMs: elapsed(), status: mapped.status, code: mapped.code });
    return errorResponse(mapped.status, mapped.code, mapped.message);
  }
}
