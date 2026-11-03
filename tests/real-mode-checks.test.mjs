import test from "node:test";
import assert from "node:assert/strict";

const { checkResponse, rehearsalRow, SCENARIOS } = await import("../scripts/real-mode/checks.mjs");

const source = { url: "https://www.instat.mg/", title: "INSTAT" };
const verify = (claims, extra = {}) => ({ ok: true, mock: false, result: { globalIndex: 62, claims }, meta: { replayed: false }, ...extra });

test("a mock answer never counts as a real-mode success", () => {
  const result = checkResponse("verify-text", 200, verify([{ status: "confirmed", sources: [source] }], { mock: true }));
  assert.equal(result.ok, false);
  assert.match(result.reason, /mock/);
});

test("errors keep their code so the cause is visible", () => {
  assert.deepEqual(checkResponse("translate", 429, { ok: false, error: { code: "rate_limited" } }), { ok: false, reason: "HTTP 429, rate_limited" });
  assert.equal(checkResponse("angles", 502, null).ok, false);
});

test("verification fails on a verdict, an empty result or a conclusive claim without source", () => {
  assert.equal(checkResponse("verify-text", 200, verify([])).ok, false);
  assert.equal(checkResponse("verify-text", 200, verify([{ status: "true", sources: [source] }])).ok, false);
  assert.equal(checkResponse("verify-text", 200, verify([{ status: "confirmed", sources: [] }])).ok, false);
  assert.deepEqual(checkResponse("verify-text", 200, verify([{ status: "insufficient", sources: [] }, { status: "confirmed", sources: [source] }])), {
    ok: true,
    globalIndex: 62,
    claims: 2,
    replayed: false,
  });
});

test("each route has its own minimal real-mode check", () => {
  const base = { ok: true, mock: false };
  assert.equal(checkResponse("translate", 200, { ...base, translatedText: "Nolanian'ny Antenimierampirenena", needsReview: true }).ok, true);
  assert.equal(checkResponse("translate", 200, { ...base, translatedText: "x", needsReview: false }).ok, false);
  assert.equal(checkResponse("sources-suggest", 200, { ...base, suggestions: [] }).ok, true);
  assert.equal(checkResponse("angles", 200, { ...base, angles: [] }).ok, false);
  assert.equal(checkResponse("verify-image", 200, { ...base, analysis: null, verification: { status: "non concluant" } }).ok, false);
  assert.equal(checkResponse("verify-video", 200, { ...base, analysedCount: 0, failedCount: 2 }).reason, "no frame analysed (2 failed)");
  assert.equal(checkResponse("verify-video", 200, { ...base, analysedCount: 2, failedCount: 0 }).ok, true);
});

test("monitoring fails without articles, events or traceable sources", () => {
  const base = { ok: true, mock: false };
  const event = {
    id: "evt-1",
    sources: [{ sourceId: "midi", sourceName: "Midi", articleCount: 2 }],
    momentum: { score: 66, level: "surge" },
    versions: { coverage: "divergent" },
  };
  const article = { id: "a1", title: "Titre", url: "https://example.org/a", publishedAt: "2026-11-03T08:00:00Z" };
  const result = checkResponse("monitor", 200, {
    ...base,
    articles: [article],
    events: [event],
    alerts: [],
    meta: { analysis: "ok" },
  });
  assert.equal(result.ok, true);
  assert.equal(result.events, 1);
  assert.equal(checkResponse("monitor", 200, { ...base, articles: [], events: [event], alerts: [], meta: { analysis: "ok" } }).reason, "no article matched");
  assert.equal(checkResponse("monitor", 200, { ...base, articles: [article], events: [], alerts: [], meta: { analysis: "ok" } }).reason, "no event grouped");
  assert.equal(
    checkResponse("monitor", 200, { ...base, articles: [article], events: [{ ...event, sources: [] }], alerts: [], meta: { analysis: "ok" } }).reason,
    "event without source",
  );
  assert.equal(
    checkResponse("monitor", 200, { ...base, articles: [article], events: [{ ...event, versions: { coverage: "certain" } }], alerts: [], meta: { analysis: "ok" } }).ok,
    false,
  );
});

test("rehearsal rows match the log table of docs/demo.md", () => {
  const row = rehearsalRow({ date: "2026-11-03", scenario: "1", run: 2, result: { ok: true, globalIndex: 58, replayed: false }, durationMs: 14_230 });
  assert.equal(row, "| 2026-11-03 | 1 | 2 | OK | 58/100 | 14.2 s |  |");
  assert.equal(Object.keys(SCENARIOS).length, 2);
});
