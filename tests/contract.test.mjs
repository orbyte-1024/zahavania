import test from "node:test";
import assert from "node:assert/strict";
import { AiError } from "../lib/ai/client.ts";
import { verifyContent } from "../lib/ai/verify.ts";
import { postApi } from "../lib/api/fetcher.ts";
import { suggestExperts } from "../lib/experts/suggest.ts";
import { FIXTURE_EXPERTS } from "../lib/experts/fixtures.ts";

async function withMock(run) {
  const previous = process.env.USE_MOCK;
  process.env.USE_MOCK = "true";
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.USE_MOCK;
    else process.env.USE_MOCK = previous;
  }
}

const fakeFetch = (status, body, headers = {}) => async () =>
  new Response(body === undefined ? "" : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

test("verification fixture covers every status, source kind and language", async () => {
  await withMock(async () => {
    for (const lang of ["mg", "fr", "en"]) {
      const { output, mock } = await verifyContent({ content: "Any text", type: "text", lang });
      assert.equal(mock, true);
      assert.equal(output.detectedLanguage, lang);
      assert.deepEqual(
        output.claims.map((claim) => claim.status),
        ["confirmed", "contradicted", "insufficient"],
      );
      const kinds = new Set(output.claims.flatMap((claim) => claim.sources.map((source) => source.kind)));
      assert.deepEqual([...kinds].sort(), ["independent", "official", "other"]);
      for (const claim of output.claims) {
        assert.ok(claim.breakdown.length > 0);
        for (const source of claim.sources) assert.match(new URL(source.url).hostname, /\.example\.org$/);
      }
      assert.ok(output.claims[0].confidenceIndex > output.claims[2].confidenceIndex);
      assert.ok(output.claims[2].confidenceIndex <= 25);
      assert.ok(output.globalBreakdown.length === 3);
      assert.ok(output.limitations.length > 0);
    }
  });
});

test("mock scenarios produce the empty and error states", async () => {
  await withMock(async () => {
    const empty = await verifyContent({ content: "mock:empty", type: "text", lang: "en" });
    assert.equal(empty.output.claims.length, 0);
    assert.equal(empty.output.globalIndex, 0);
    await assert.rejects(verifyContent({ content: "mock:error", type: "text" }), AiError);
  });
});

test("mock expert suggestions work without supabase and respect consent", async () => {
  await withMock(async () => {
    const result = await suggestExperts(null, { topic: "Hausse du prix du riz et budget", lang: "fr", limit: 10 });
    assert.equal(result.mock, true);
    assert.ok(result.suggestions.length > 0);
    const hidden = new Set(
      FIXTURE_EXPERTS.filter((row) => !["granted", "public_info"].includes(row.consent_status)).map((row) => row.id),
    );
    assert.ok(hidden.size >= 3);
    for (const suggestion of result.suggestions) {
      assert.equal(hidden.has(suggestion.id), false);
      assert.equal(suggestion.isFictional, true);
    }
  });
});

test("postApi returns typed success with the status code", async () => {
  const result = await postApi(
    "/api/verify/text",
    { content: "Claim", type: "text" },
    { fetchImpl: fakeFetch(200, { ok: true, mock: true, result: {}, meta: {} }) },
  );
  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
});

test("postApi exposes error codes and retry-after", async () => {
  const result = await postApi(
    "/api/verify/text",
    { content: "Claim", type: "text" },
    {
      fetchImpl: fakeFetch(429, { ok: false, error: { code: "rate_limited", message: "Too many requests." } }, {
        "Retry-After": "42",
      }),
    },
  );
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "rate_limited");
  assert.equal(result.retryAfterSeconds, 42);
});

test("postApi normalizes legacy, unexpected and network failures", async () => {
  const legacy = await postApi(
    "/api/editorial/angles",
    { subject: "Riz", lang: "fr" },
    { fetchImpl: fakeFetch(503, { ok: false, erreur: "Appel IA échoué" }) },
  );
  assert.equal(legacy.ok, false);
  assert.equal(legacy.error.code, "request_failed");

  const unexpected = await postApi("/api/verify/text", { content: "Claim", type: "text" }, { fetchImpl: fakeFetch(405) });
  assert.equal(unexpected.error.code, "unexpected_response");

  const network = await postApi(
    "/api/verify/text",
    { content: "Claim", type: "text" },
    {
      fetchImpl: async () => {
        throw new TypeError("fetch failed");
      },
    },
  );
  assert.equal(network.error.code, "network_error");
  assert.equal(network.status, 0);
});

test("postApi sends the bearer token", async () => {
  let sent;
  await postApi(
    "/api/sources/suggest",
    { topic: "Riz" },
    {
      accessToken: "token-123",
      fetchImpl: async (url, init) => {
        sent = { url, init };
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
    },
  );
  assert.equal(sent.url, "/api/sources/suggest");
  assert.equal(sent.init.headers.Authorization, "Bearer token-123");
});
