import "server-only";
import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";

type Bucket = { count: number; resetAt: number };

export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSeconds: number };

export type RateLimiter = {
  check: (key: string) => Promise<RateLimitResult>;
};

export type RateLimiterOptions = { name: string; limit: number; windowMs: number };

export type SharedStore = (keyHash: string, limit: number, windowSeconds: number) => Promise<RateLimitResult>;

const STORE_TIMEOUT_MS = 2_000;

export function hashLimitKey(name: string, key: string): string {
  return createHash("sha256").update(`${name}\u0000${key}`).digest("hex");
}

function memoryLimiter(options: RateLimiterOptions): (key: string) => RateLimitResult {
  const buckets = new Map<string, Bucket>();
  return (key) => {
    const now = Date.now();
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(bucketKey);
    }
    const bucket = buckets.get(key) ?? { count: 0, resetAt: now + options.windowMs };
    if (bucket.count >= options.limit) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
    }
    bucket.count += 1;
    buckets.set(key, bucket);
    return { allowed: true, remaining: options.limit - bucket.count };
  };
}

function parseStoreRow(value: unknown): { allowed: boolean; hits: number; retryAfter: number } | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (typeof row !== "object" || row === null) return null;
  const { allowed, hits, retry_after_seconds: retryAfter } = row as Record<string, unknown>;
  if (typeof allowed !== "boolean" || typeof hits !== "number" || typeof retryAfter !== "number") return null;
  return { allowed, hits, retryAfter };
}

export function supabaseStore(url: string, serviceRoleKey: string, fetchImpl: typeof fetch = fetch): SharedStore {
  const endpoint = `${url.replace(/\/+$/, "")}/rest/v1/rpc/consume_rate_limit`;
  return async (keyHash, limit, windowSeconds) => {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_key_hash: keyHash, p_limit: limit, p_window_seconds: windowSeconds }),
      signal: AbortSignal.timeout(STORE_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`store_status_${response.status}`);
    const row = parseStoreRow(await response.json());
    if (!row) throw new Error("store_invalid_response");
    return row.allowed
      ? { allowed: true, remaining: Math.max(0, limit - row.hits) }
      : { allowed: false, retryAfterSeconds: Math.max(1, row.retryAfter) };
  };
}

export function configuredStore(env: NodeJS.ProcessEnv = process.env): SharedStore | null {
  if (env.RATE_LIMIT_STORE !== "supabase") return null;
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? supabaseStore(url, key) : null;
}

function logStoreFailure(name: string, error: unknown) {
  const code = error instanceof Error && error.message.startsWith("store_") ? error.message : error instanceof Error ? error.name : "unknown";
  console.error(JSON.stringify({ scope: "ratelimit", limiter: name, code, fallback: "memory" }));
}

export function createRateLimiter(options: RateLimiterOptions, store: SharedStore | null = configuredStore()): RateLimiter {
  const local = memoryLimiter(options);
  const windowSeconds = Math.max(1, Math.round(options.windowMs / 1000));
  return {
    async check(key) {
      if (!store) return local(key);
      try {
        return await store(hashLimitKey(options.name, key), options.limit, windowSeconds);
      } catch (error) {
        logStoreFailure(options.name, error);
        return local(key);
      }
    },
  };
}

export function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}
