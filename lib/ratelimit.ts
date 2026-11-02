import type { NextRequest } from "next/server";

type Bucket = { count: number; resetAt: number };

export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSeconds: number };

export type RateLimiter = {
  check: (key: string) => RateLimitResult;
};

// In-memory: counters live in this server process only, reset on restart and are not
// shared between instances. In production, back this with a shared store (e.g. Upstash
// Redis or a Supabase table with an atomic increment) so limits hold across instances.
export function createRateLimiter(options: { limit: number; windowMs: number }): RateLimiter {
  const buckets = new Map<string, Bucket>();

  return {
    check(key) {
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
    },
  };
}

const defaultIpLimiter = createRateLimiter({ limit: 10, windowMs: 60_000 });

export function isRateLimited(ip: string): boolean {
  return !defaultIpLimiter.check(ip).allowed;
}

export function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}
