import type { NextRequest } from "next/server";
import { AiError, type AiUsage } from "@/lib/ai/client";
import { verifyInputSchema } from "@/lib/ai/schemas";
import { VerificationError, verifyContent } from "@/lib/ai/verify";
import { readIntEnv } from "@/lib/env";
import { clientIp, createRateLimiter } from "@/lib/ratelimit";
import { authenticate } from "@/lib/security/auth";
import { errorResponse, jsonResponse, readJsonBody, startTimer } from "@/lib/security/request";
import { SafeFetchError } from "@/lib/security/safe-fetch";

const MAX_BODY_BYTES = 32 * 1024;
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
  detail?: string;
  usage?: AiUsage | null;
  attempts?: number;
  droppedSources?: number;
};

function logRequest(entry: LogEntry) {
  const line = JSON.stringify({ route: "POST /api/verify/text", ...entry });
  if (entry.status >= 500) console.error(line);
  else console.info(line);
}

function tooManyRequests(retryAfterSeconds: number, code = "rate_limited") {
  return errorResponse(429, code, "Too many requests. Please try again later.", {
    "Retry-After": String(retryAfterSeconds),
  });
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

  const dailyCheck = dailyLimiter.check(auth.userId);
  if (!dailyCheck.allowed) {
    logRequest({ userId: auth.userId, durationMs: elapsed(), status: 429, code: "daily_quota_exceeded" });
    return tooManyRequests(dailyCheck.retryAfterSeconds, "daily_quota_exceeded");
  }

  try {
    const result = await verifyContent(input.data);
    logRequest({
      userId: auth.userId,
      durationMs: elapsed(),
      status: 200,
      usage: result.usage,
      attempts: result.attempts,
      droppedSources: result.droppedSources,
    });
    return jsonResponse({
      ok: true,
      mock: result.mock,
      result: result.output,
      meta: {
        analyzedUrl: result.analyzedUrl,
        droppedSources: result.droppedSources,
        durationMs: elapsed(),
      },
    });
  } catch (error) {
    const mapped = mapError(error);
    logRequest({ userId: auth.userId, durationMs: elapsed(), status: mapped.status, code: mapped.code, detail: mapped.detail });
    return errorResponse(mapped.status, mapped.code, mapped.message);
  }
}
