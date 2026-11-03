import type { NextRequest } from "next/server";
import { AiError, type AiUsage } from "@/lib/ai/client";
import { translateInputSchema, translateText } from "@/lib/ai/translate";
import type { TranslateSuccess } from "@/lib/api/contract";
import { readIntEnv } from "@/lib/env";
import { clientIp, createRateLimiter } from "@/lib/security/ratelimit";
import { authenticate } from "@/lib/security/auth";
import { errorResponse, jsonResponse, readJsonBody, startTimer, tooManyRequests } from "@/lib/security/request";

const MAX_BODY_BYTES = 24 * 1024;
const MINUTE_MS = 60_000;

const ipLimiter = createRateLimiter({ limit: 10, windowMs: MINUTE_MS });
const userLimiter = createRateLimiter({ limit: 10, windowMs: MINUTE_MS });
const dailyLimiter = createRateLimiter({
  limit: readIntEnv("AI_DAILY_LIMIT_PER_USER", 50, 1, 10_000),
  windowMs: 24 * 60 * MINUTE_MS,
});

type LogEntry = { userId: string | null; durationMs: number; status: number; code?: string; providerStatus?: number | null; usage?: AiUsage | null };

function logRequest(entry: LogEntry) {
  const line = JSON.stringify({ route: "POST /api/translate", ...entry });
  if (entry.status >= 500) console.error(line);
  else console.info(line);
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

  const input = translateInputSchema.safeParse(body.data);
  if (!input.success) {
    const fields = [...new Set(input.error.issues.map((issue) => issue.path.join(".") || "(root)"))];
    logRequest({ userId: auth.userId, durationMs: elapsed(), status: 400, code: "invalid_input" });
    return jsonResponse({ ok: false, error: { code: "invalid_input", message: "Invalid request.", fields } }, 400);
  }

  const dailyCheck = dailyLimiter.check(auth.userId);
  if (!dailyCheck.allowed) {
    logRequest({ userId: auth.userId, durationMs: elapsed(), status: 429, code: "daily_quota_exceeded" });
    return tooManyRequests(dailyCheck.retryAfterSeconds, "daily_quota_exceeded");
  }

  try {
    const result = await translateText(input.data);
    logRequest({ userId: auth.userId, durationMs: elapsed(), status: 200, usage: result.usage });
    return jsonResponse({
      ok: true,
      mock: result.mock,
      translatedText: result.translatedText,
      sourceLang: result.sourceLang,
      targetLang: result.targetLang,
      needsReview: result.needsReview,
    } satisfies TranslateSuccess);
  } catch (error) {
    if (error instanceof AiError && error.code === "timeout") {
      logRequest({ userId: auth.userId, durationMs: elapsed(), status: 504, code: "ai_timeout" });
      return errorResponse(504, "ai_timeout", "The translation took too long. Please try again.");
    }
    if (error instanceof AiError && error.code === "invalid_output") {
      logRequest({ userId: auth.userId, durationMs: elapsed(), status: 502, code: "translation_unreliable", providerStatus: error.providerStatus });
      return errorResponse(502, "translation_unreliable", "The translation could not be checked. Please try again or shorten the text.");
    }
    const code = error instanceof AiError ? error.code : error instanceof Error ? error.name : "internal_error";
    const providerStatus = error instanceof AiError ? error.providerStatus : null;
    logRequest({ userId: auth.userId, durationMs: elapsed(), status: 503, code, providerStatus });
    return errorResponse(503, "ai_unavailable", "Translation is temporarily unavailable.");
  }
}
