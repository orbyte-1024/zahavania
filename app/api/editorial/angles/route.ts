import type { NextRequest } from "next/server";
import { generateAngles } from "@/lib/ai/angles";
import { AiError, isMockMode, type AiUsage } from "@/lib/ai/client";
import { anglesInputSchema, type AnglesInput, type AnglesOutput } from "@/lib/ai/schemas";
import type { EditorialAnglesSuccess } from "@/lib/api/contract";
import { hashKey } from "@/lib/cache";
import { demoFallbackMode, isDemoRecording, readDemoRecording, writeDemoRecording } from "@/lib/demo/replay";
import { readIntEnv } from "@/lib/env";
import { authenticate } from "@/lib/security/auth";
import { clientIp, createRateLimiter } from "@/lib/security/ratelimit";
import { errorResponse, jsonResponse, readJsonBody, startTimer, tooManyRequests } from "@/lib/security/request";

export const maxDuration = 180;

const MAX_BODY_BYTES = 131_072;
const MINUTE_MS = 60_000;

const ipLimiter = createRateLimiter({ name: "angles:ip", limit: 10, windowMs: MINUTE_MS });
const userLimiter = createRateLimiter({ name: "angles:user", limit: 10, windowMs: MINUTE_MS });
const dailyLimiter = createRateLimiter({
  name: "angles:daily",
  limit: readIntEnv("AI_DAILY_LIMIT_PER_USER", 50, 1, 10_000),
  windowMs: 24 * 60 * MINUTE_MS,
});

type LogEntry = { userId: string | null; durationMs: number; status: number; code?: string; providerStatus?: number | null; usage?: AiUsage | null; attempts?: number };

function logRequest(entry: LogEntry) {
  const line = JSON.stringify({ route: "POST /api/editorial/angles", ...entry });
  if (entry.status >= 500) console.error(line);
  else console.info(line);
}

function demoKeyFor(input: AnglesInput): string {
  return hashKey(["editorial-angles", input.subject ?? null, input.claims ?? [], input.lang]);
}

function replayResponse(input: AnglesInput, output: AnglesOutput, recordedAt: string) {
  return jsonResponse({
    ok: true,
    mock: false,
    verificationId: input.verificationId ?? null,
    ...output,
    usage: null,
    attempts: 0,
    recordedAt,
  } satisfies EditorialAnglesSuccess);
}

export async function POST(req: NextRequest) {
  const elapsed = startTimer();

  const ipCheck = await ipLimiter.check(clientIp(req));
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

  const userCheck = await userLimiter.check(auth.userId);
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

  const input = anglesInputSchema.safeParse(body.data);
  if (!input.success) {
    const fields = [...new Set(input.error.issues.map((issue) => issue.path.join(".") || "(root)"))];
    logRequest({ userId: auth.userId, durationMs: elapsed(), status: 400, code: "invalid_input" });
    return jsonResponse({ ok: false, error: { code: "invalid_input", message: "Invalid request.", fields } }, 400);
  }

  const demoKey = demoKeyFor(input.data);
  const replayMode = isMockMode() ? "off" : demoFallbackMode();
  if (replayMode === "always") {
    const recording = await readDemoRecording<AnglesOutput>("editorial-angles", demoKey);
    if (recording) {
      logRequest({ userId: auth.userId, durationMs: elapsed(), status: 200, code: "replay" });
      return replayResponse(input.data, recording.payload, recording.recordedAt);
    }
  }

  const dailyCheck = await dailyLimiter.check(auth.userId);
  if (!dailyCheck.allowed) {
    logRequest({ userId: auth.userId, durationMs: elapsed(), status: 429, code: "daily_quota_exceeded" });
    return tooManyRequests(dailyCheck.retryAfterSeconds, "daily_quota_exceeded");
  }

  try {
    const { output, mock, usage, attempts } = await generateAngles(input.data);
    if (!mock && isDemoRecording()) {
      await writeDemoRecording("editorial-angles", demoKey, output).catch(() =>
        logRequest({ userId: auth.userId, durationMs: elapsed(), status: 200, code: "demo_record_failed" }),
      );
    }
    logRequest({ userId: auth.userId, durationMs: elapsed(), status: 200, usage, attempts });
    return jsonResponse({
      ok: true,
      mock,
      verificationId: input.data.verificationId ?? null,
      ...output,
      usage,
      attempts,
      recordedAt: null,
    } satisfies EditorialAnglesSuccess);
  } catch (error) {
    if (replayMode !== "off" && error instanceof AiError) {
      const recording = await readDemoRecording<AnglesOutput>("editorial-angles", demoKey);
      if (recording) {
        logRequest({ userId: auth.userId, durationMs: elapsed(), status: 200, code: `replay_after_${error.code}` });
        return replayResponse(input.data, recording.payload, recording.recordedAt);
      }
    }
    const code = error instanceof AiError ? error.code : error instanceof Error ? error.name : "internal_error";
    const providerStatus = error instanceof AiError ? error.providerStatus : null;
    if (error instanceof AiError && error.code === "timeout") {
      logRequest({ userId: auth.userId, durationMs: elapsed(), status: 504, code, providerStatus });
      return errorResponse(504, "ai_timeout", "The generation took too long. Please try again.");
    }
    if (error instanceof AiError) {
      logRequest({ userId: auth.userId, durationMs: elapsed(), status: 503, code, providerStatus });
      return errorResponse(503, "ai_unavailable", "Angle suggestions are temporarily unavailable.");
    }
    logRequest({ userId: auth.userId, durationMs: elapsed(), status: 500, code });
    return errorResponse(500, "internal_error", "An unexpected error occurred.");
  }
}
