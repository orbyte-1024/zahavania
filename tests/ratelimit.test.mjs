import test from "node:test";
import assert from "node:assert/strict";

const { configuredStore, createRateLimiter, hashLimitKey, supabaseStore } = await import("../lib/security/ratelimit.ts");

function fakeSupabase(reply) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return reply(calls.at(-1));
  };
  return { calls, fetchImpl };
}

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("limiter keys are namespaced and hashed, never stored in clear", () => {
  const hash = hashLimitKey("verify-text:ip", "203.0.113.7");
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.notEqual(hash, hashLimitKey("translate:ip", "203.0.113.7"));
});

test("the shared store calls the Supabase function with the hashed key and the service role", async () => {
  const { calls, fetchImpl } = fakeSupabase(() => json(200, [{ allowed: true, hits: 3, retry_after_seconds: 40 }]));
  const limiter = createRateLimiter({ name: "verify-text:ip", limit: 10, windowMs: 60_000 }, supabaseStore("https://db.test/", "service-key", fetchImpl));
  assert.deepEqual(await limiter.check("203.0.113.7"), { allowed: true, remaining: 7 });
  const [call] = calls;
  assert.equal(call.url, "https://db.test/rest/v1/rpc/consume_rate_limit");
  assert.equal(call.init.headers.Authorization, "Bearer service-key");
  assert.deepEqual(call.body, { p_key_hash: hashLimitKey("verify-text:ip", "203.0.113.7"), p_limit: 10, p_window_seconds: 60 });
  assert.ok(!call.init.body.includes("203.0.113.7"));
});

test("a refusal from the shared store becomes a 429 with its retry delay", async () => {
  const { fetchImpl } = fakeSupabase(() => json(200, [{ allowed: false, hits: 11, retry_after_seconds: 17 }]));
  const limiter = createRateLimiter({ name: "x", limit: 10, windowMs: 60_000 }, supabaseStore("https://db.test", "k", fetchImpl));
  assert.deepEqual(await limiter.check("u"), { allowed: false, retryAfterSeconds: 17 });
});

test("when the store fails, the limiter falls back to memory and logs no key", async () => {
  for (const reply of [() => json(500, { message: "boom" }), () => json(200, { unexpected: true }), () => { throw new TypeError("fetch failed"); }]) {
    const { fetchImpl } = fakeSupabase(reply);
    const limiter = createRateLimiter({ name: "fallback", limit: 1, windowMs: 60_000 }, supabaseStore("https://db.test", "k", fetchImpl));
    const logs = [];
    const original = console.error;
    console.error = (line) => logs.push(String(line));
    try {
      assert.equal((await limiter.check("198.51.100.4")).allowed, true);
      assert.equal((await limiter.check("198.51.100.4")).allowed, false);
    } finally {
      console.error = original;
    }
    assert.equal(logs.length, 2);
    for (const line of logs) {
      assert.equal(JSON.parse(line).fallback, "memory");
      assert.ok(!line.includes("198.51.100.4") && !line.includes("boom"));
    }
  }
});

test("the shared store is opt-in and requires both Supabase settings", () => {
  assert.equal(configuredStore({}), null);
  assert.equal(configuredStore({ RATE_LIMIT_STORE: "supabase", NEXT_PUBLIC_SUPABASE_URL: "https://db.test" }), null);
  assert.equal(configuredStore({ RATE_LIMIT_STORE: "memory", NEXT_PUBLIC_SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "k" }), null);
  assert.equal(typeof configuredStore({ RATE_LIMIT_STORE: "supabase", NEXT_PUBLIC_SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "k" }), "function");
});
