import test from "node:test";
import assert from "node:assert/strict";
import { createRateLimiter, isRateLimited } from "../lib/ratelimit.ts";
import { isBlockedIp, SafeFetchError, validatePublicUrl } from "../lib/security/safe-fetch.ts";
import { extractMainText } from "../lib/web/extract-text.ts";
import { verifyInputSchema } from "../lib/ai/schemas.ts";
import {
  keepOnlySearchedSources,
  NO_SOURCE_MAX_CONFIDENCE,
  normalizeUrl,
  verifyContent,
} from "../lib/ai/verify.ts";

const source = (url) => ({
  title: "Title",
  url,
  publisher: "Publisher",
  date: null,
  kind: "official",
  stance: "supports",
});

const claim = (sources, overrides = {}) => ({
  text: "Claim",
  status: "confirmed",
  confidenceIndex: 90,
  rationale: "Rationale",
  sources,
  contradictions: [],
  recommendedChecks: [],
  ...overrides,
});

test("rate limiter blocks after the limit and returns retry-after", () => {
  const limiter = createRateLimiter({ limit: 2, windowMs: 60_000 });
  assert.equal(limiter.check("user-a").allowed, true);
  assert.equal(limiter.check("user-a").allowed, true);
  const blocked = limiter.check("user-a");
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds >= 1 && blocked.retryAfterSeconds <= 60);
  assert.equal(limiter.check("user-b").allowed, true);
});

test("legacy ip limiter allows 10 requests per minute", () => {
  const ip = `test-${Date.now()}`;
  for (let i = 0; i < 10; i += 1) assert.equal(isRateLimited(ip), false);
  assert.equal(isRateLimited(ip), true);
});

test("ssrf guard rejects private, local and non-standard destinations", () => {
  const rejected = [
    "ftp://example.com/file",
    "file:///etc/passwd",
    "http://localhost/",
    "http://api.localhost/",
    "http://127.0.0.1/",
    "http://10.0.0.1/",
    "http://172.16.5.4/",
    "http://192.168.1.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://0x7f000001/",
    "https://example.com:8443/",
    "https://user:pass@example.com/",
  ];
  for (const url of rejected) {
    assert.throws(() => validatePublicUrl(url), SafeFetchError, url);
  }
  assert.equal(validatePublicUrl("https://www.instat.mg/").hostname, "www.instat.mg");
  assert.equal(isBlockedIp("8.8.8.8"), false);
  assert.equal(isBlockedIp("::ffff:10.0.0.1"), true);
});

test("html extractor skips scripts and prefers the article", () => {
  const article = "Le taux de pauvreté publié par l'INSTAT. ".repeat(10);
  const html = `<html><head><title>Report &amp; data</title><script>var secret = "</div>";</script></head>
    <body><nav>Menu</nav><article><p>${article}</p></article><footer>Footer</footer></body></html>`;
  const { title, text } = extractMainText(html, "text/html; charset=utf-8", 8_000);
  assert.equal(title, "Report & data");
  assert.match(text, /INSTAT/);
  assert.doesNotMatch(text, /secret|Menu|Footer/);
});

test("input schema enforces strict types and limits", () => {
  assert.equal(verifyInputSchema.safeParse({ content: "Claim", type: "text", lang: "mg" }).success, true);
  assert.equal(verifyInputSchema.safeParse({ content: "Claim", type: "text", extra: 1 }).success, false);
  assert.equal(verifyInputSchema.safeParse({ content: "x".repeat(8_001), type: "text" }).success, false);
  assert.equal(verifyInputSchema.safeParse({ content: "javascript:alert(1)", type: "url" }).success, false);
  assert.equal(verifyInputSchema.safeParse({ content: "Claim", type: "text", lang: "de" }).success, false);
});

test("url normalization ignores www, tracking params, hash and trailing slash", () => {
  assert.equal(
    normalizeUrl("https://www.Instat.mg/stats/?utm_source=x#top"),
    normalizeUrl("https://instat.mg/stats"),
  );
});

test("sources not returned by web search are dropped and sourceless claims become insufficient", () => {
  const output = {
    detectedLanguage: "fr",
    summary: "Summary",
    claims: [
      claim([source("https://www.instat.mg/report/"), source("https://invented.example/fake")]),
      claim([source("https://invented.example/other")]),
    ],
    limitations: [],
  };
  const { output: filtered, droppedSources } = keepOnlySearchedSources(output, ["https://instat.mg/report"]);

  assert.equal(droppedSources, 2);
  assert.deepEqual(filtered.claims[0].sources.map((s) => s.url), ["https://www.instat.mg/report/"]);
  assert.equal(filtered.claims[0].status, "confirmed");
  assert.equal(filtered.claims[1].sources.length, 0);
  assert.equal(filtered.claims[1].status, "insufficient");
  assert.ok(filtered.claims[1].confidenceIndex <= NO_SOURCE_MAX_CONFIDENCE);
});

test("mock mode never calls the model and is flagged as mock", async () => {
  const previous = process.env.USE_MOCK;
  process.env.USE_MOCK = "true";
  try {
    const result = await verifyContent({ content: "Claim", type: "text", lang: "fr" });
    assert.equal(result.mock, true);
    assert.equal(result.usage, null);
    assert.equal(result.output.claims[0].sources.length, 0);
  } finally {
    if (previous === undefined) delete process.env.USE_MOCK;
    else process.env.USE_MOCK = previous;
  }
});
