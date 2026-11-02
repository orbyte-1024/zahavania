import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isMockMode } from "../lib/ai/client.ts";
import { translateInputSchema } from "../lib/ai/translate.ts";
import { parseReports, reportToText } from "../lib/dossiers.ts";
import { parseStats } from "../lib/stats.ts";

const stats = JSON.parse(readFileSync(new URL("../data/stats.json", import.meta.url), "utf8"));

async function withEnv(values, run) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  try {
    return await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("mock mode can never be enabled in production", async () => {
  await withEnv({ USE_MOCK: "true", NODE_ENV: "production" }, () => assert.equal(isMockMode(), false));
  await withEnv({ USE_MOCK: "true", NODE_ENV: "development" }, () => assert.equal(isMockMode(), true));
  await withEnv({ USE_MOCK: "false", NODE_ENV: "development" }, () => assert.equal(isMockMode(), false));
});

test("every published figure has an https source, a year and an update date", () => {
  const data = parseStats(stats);
  assert.equal(data.indicators.length, stats.indicators.length);
  for (const indicator of data.indicators) {
    assert.match(indicator.source.url, /^https:\/\/data\.worldbank\.org\//);
    assert.match(indicator.period, /^\d{4}$/);
    assert.match(indicator.updatedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(indicator.series.at(-1).year, Number(indicator.period));
  }
});

test("figures without a source are dropped and old figures are flagged", () => {
  const sample = structuredClone(stats);
  sample.retrievedAt = "2026-11-03";
  const unsourced = structuredClone(sample.indicators[0]);
  delete unsourced.source;
  sample.indicators.push(unsourced);
  const data = parseStats(sample);
  assert.equal(data.indicators.length, stats.indicators.length);
  const poverty = data.indicators.find((i) => i.id === "SI.POV.DDAY");
  const population = data.indicators.find((i) => i.id === "SP.POP.TOTL");
  assert.equal(poverty.stale, Number(poverty.period) < 2023);
  assert.equal(population.stale, false);
});

test("agenda entries need a source", () => {
  const data = parseStats({
    retrievedAt: "2026-11-03",
    indicators: [],
    agenda: [
      { date: "2026-12-01", title: { mg: "a", fr: "b", en: "c" }, organizer: "INSTAT", source: { url: "https://www.instat.mg/" } },
      { date: "2026-12-02", title: { mg: "a", fr: "b", en: "c" }, organizer: "Unknown" },
    ],
  });
  assert.equal(data.agenda.length, 1);
});

test("translation input is strict and rejects identical languages", () => {
  assert.equal(translateInputSchema.safeParse({ sourceLang: "fr", targetLang: "mg", text: "Bonjour" }).success, true);
  assert.equal(translateInputSchema.safeParse({ sourceLang: "fr", targetLang: "fr", text: "Bonjour" }).success, false);
  assert.equal(translateInputSchema.safeParse({ sourceLang: "fr", targetLang: "mg", text: "x", extra: 1 }).success, false);
  assert.equal(translateInputSchema.safeParse({ sourceLang: "fr", targetLang: "mg", text: "x".repeat(5001) }).success, false);
});

test("saved reports ignore corrupted storage and export readable text", () => {
  assert.deepEqual(parseReports("not json"), []);
  assert.deepEqual(parseReports(JSON.stringify([{ id: 1 }, null])), []);
  const report = {
    id: "r1",
    savedAt: "2026-11-03T10:00:00.000Z",
    title: "Claim",
    mode: "text",
    mock: false,
    decisions: { 0: "validate" },
    meta: { analyzedUrl: null, droppedSources: 0, durationMs: 1, cached: false, replayed: false, recordedAt: null },
    result: {
      detectedLanguage: "fr",
      summary: "Summary",
      globalIndex: 80,
      globalBreakdown: [],
      limitations: ["Limit"],
      claims: [
        {
          text: "Rice prices rose",
          status: "confirmed",
          confidenceIndex: 80,
          breakdown: [],
          rationale: "Two sources",
          contradictions: [],
          recommendedChecks: [],
          sources: [{ title: "Report", url: "https://instat.mg/r", publisher: "INSTAT", date: "2026-10-01", kind: "official", stance: "supports" }],
        },
      ],
    },
  };
  assert.equal(parseReports(JSON.stringify([report])).length, 1);
  const text = reportToText(report, {
    status: (s) => s.toUpperCase(),
    decision: (d) => d,
    globalIndex: "Index",
    sources: "Sources",
    limitations: "Limits",
    savedOn: "Saved",
  });
  assert.match(text, /Index: 80\/100/);
  assert.match(text, /\[CONFIRMED\] 80\/100 — validate/);
  assert.match(text, /https:\/\/instat\.mg\/r/);
  assert.match(text, /- Limit/);
});
