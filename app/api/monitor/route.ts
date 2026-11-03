import type { NextRequest } from "next/server";
import type { MonitorSuccess } from "@/lib/api/contract";
import { readIntEnv } from "@/lib/env";
import { monitorInputSchema } from "@/lib/monitor/input";
import { MonitorError, runMonitor } from "@/lib/monitor/run";
import { authenticate } from "@/lib/security/auth";
import { clientIp, createRateLimiter } from "@/lib/security/ratelimit";
import { errorResponse, jsonResponse, readJsonBody, startTimer, tooManyRequests } from "@/lib/security/request";

export const maxDuration = 300;

const MAX_BODY_BYTES = 8 * 1024;
const MINUTE_MS = 60_000;

const ipLimiter = createRateLimiter({ name: "monitor:ip", limit: 20, windowMs: MINUTE_MS });
const userLimiter = createRateLimiter({ name: "monitor:user", limit: 15, windowMs: MINUTE_MS });
const dailyLimiter = createRateLimiter({
  name: "monitor:daily",
  limit: readIntEnv("MONITOR_DAILY_LIMIT_PER_USER", 80, 1, 10_000),
  windowMs: 24 * 60 * MINUTE_MS,
});

type LogEntry = {
  userId: string | null;
  durationMs: number;
  status: number;
  code?: string;
  sinceHours?: number;
  feedFailures?: number;
  analysis?: string;
};

function logRequest(entry: LogEntry) {
  const line = JSON.stringify({ route: "POST /api/monitor", ...entry });
  if (entry.status >= 500) console.error(line);
  else console.info(line);
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

  const input = monitorInputSchema.safeParse(body.data);
  if (!input.success) {
    const fields = [...new Set(input.error.issues.map((issue) => issue.path.join(".") || "(root)"))];
    logRequest({ userId: auth.userId, durationMs: elapsed(), status: 400, code: "invalid_input" });
    return jsonResponse({ ok: false, error: { code: "invalid_input", message: "Invalid request.", fields } }, 400);
  }

  const dailyCheck = await dailyLimiter.check(auth.userId);
  if (!dailyCheck.allowed) {
    logRequest({ userId: auth.userId, durationMs: elapsed(), status: 429, code: "daily_quota_exceeded" });
    return tooManyRequests(dailyCheck.retryAfterSeconds, "daily_quota_exceeded");
  }

  try {
    const { payload, mock } = await runMonitor(input.data, auth.userId);
    logRequest({
      userId: auth.userId,
      durationMs: elapsed(),
      status: 200,
      sinceHours: input.data.sinceHours,
      feedFailures: payload.coverage.failed.length,
      analysis: payload.meta.analysis,
    });
    return jsonResponse({ ok: true, mock, ...payload } satisfies MonitorSuccess);
  } catch (error) {
    if (error instanceof MonitorError && error.code === "feeds_unavailable") {
      logRequest({ userId: auth.userId, durationMs: elapsed(), status: 502, code: "feeds_unavailable" });
      return errorResponse(502, "feeds_unavailable", "No news source could be reached. Please try again later.");
    }
    logRequest({ userId: auth.userId, durationMs: elapsed(), status: 503, code: "monitor_unavailable" });
    return errorResponse(503, "monitor_unavailable", "The monitoring service is temporarily unavailable.");
  }
}
