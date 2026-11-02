import test from "node:test";
import assert from "node:assert/strict";
import {
  NEEDS_VERIFICATION_MAX_CONFIDENCE,
  NO_SOURCE_MAX_CONFIDENCE,
  scoreClaim,
  scoreVerification,
} from "../lib/score.ts";

const NOW = Date.parse("2026-11-02");

const source = (url, kind, stance = "supports", date = "2026-06-01") => ({
  title: "Title",
  url,
  publisher: "Publisher",
  date,
  kind,
  stance,
});

const claim = (status, sources, contradictions = []) => ({
  text: "Claim",
  status,
  rationale: "Rationale",
  sources,
  contradictions,
  recommendedChecks: [],
});

const total = (breakdown) => breakdown.reduce((sum, item) => sum + item.points, 0);

test("official and independent sources from distinct domains give a high index", () => {
  const scored = scoreClaim(
    claim("confirmed", [
      source("https://www.instat.mg/a", "official"),
      source("https://newsmada.com/b", "independent"),
      source("https://lexpress.mg/c", "independent"),
    ]),
    NOW,
  );
  assert.equal(scored.status, "confirmed");
  assert.ok(scored.confidenceIndex >= 90, String(scored.confidenceIndex));
  assert.equal(total(scored.breakdown), scored.confidenceIndex);
  assert.ok(scored.breakdown.some((item) => item.code === "official_source"));
  assert.ok(scored.breakdown.some((item) => item.code === "independent_domains"));
});

test("several pages from the same domain count as one source", () => {
  const scored = scoreClaim(
    claim("confirmed", [
      source("https://newsmada.com/a", "independent"),
      source("https://www.newsmada.com/b", "independent"),
      source("https://newsmada.com/c", "independent"),
    ]),
    NOW,
  );
  assert.equal(scored.status, "needs_verification");
  assert.ok(scored.confidenceIndex <= NEEDS_VERIFICATION_MAX_CONFIDENCE);
  assert.ok(scored.breakdown.some((item) => item.code === "status_lowered"));
  assert.ok(!scored.breakdown.some((item) => item.code === "independent_domains"));
});

test("independent sources score lower than official ones", () => {
  const official = scoreClaim(claim("needs_verification", [source("https://instat.mg/a", "official")]), NOW);
  const independent = scoreClaim(claim("needs_verification", [source("https://newsmada.com/a", "independent")]), NOW);
  assert.ok(official.confidenceIndex > independent.confidenceIndex);
});

test("stale sources are penalized", () => {
  const fresh = scoreClaim(
    claim("confirmed", [source("https://instat.mg/a", "official"), source("https://newsmada.com/b", "independent")]),
    NOW,
  );
  const stale = scoreClaim(
    claim("confirmed", [
      source("https://instat.mg/a", "official", "supports", "2015-01-01"),
      source("https://newsmada.com/b", "independent", "supports", "2016-03-01"),
    ]),
    NOW,
  );
  assert.ok(stale.breakdown.some((item) => item.code === "stale_sources"));
  assert.ok(fresh.confidenceIndex - stale.confidenceIndex >= 25);
});

test("contradicted claims are scored on contradicting evidence", () => {
  const scored = scoreClaim(
    claim("contradicted", [
      source("https://ceni-madagascar.mg/a", "official", "contradicts"),
      source("https://hcc.gov.mg/b", "official", "contradicts"),
    ]),
    NOW,
  );
  assert.equal(scored.status, "contradicted");
  assert.ok(scored.confidenceIndex >= 80);
});

test("a contradiction without reliable contradicting source is lowered", () => {
  const scored = scoreClaim(claim("contradicted", [source("https://blog.example/a", "other", "contradicts")]), NOW);
  assert.equal(scored.status, "needs_verification");
});

test("opposing evidence and noted contradictions lower the index", () => {
  const clean = scoreClaim(
    claim("confirmed", [source("https://instat.mg/a", "official"), source("https://newsmada.com/b", "independent")]),
    NOW,
  );
  const disputed = scoreClaim(
    claim(
      "confirmed",
      [
        source("https://instat.mg/a", "official"),
        source("https://newsmada.com/b", "independent"),
        source("https://banky-foibe.mg/c", "official", "contradicts"),
      ],
      ["Figures differ from the central bank report"],
    ),
    NOW,
  );
  assert.ok(disputed.confidenceIndex <= clean.confidenceIndex - 35);
  assert.ok(disputed.breakdown.some((item) => item.code === "opposing_official_source"));
  assert.ok(disputed.breakdown.some((item) => item.code === "reported_contradictions"));
});

test("no source means insufficient with a capped index", () => {
  const none = scoreClaim(claim("confirmed", []), NOW);
  assert.equal(none.status, "insufficient");
  assert.ok(none.confidenceIndex <= NO_SOURCE_MAX_CONFIDENCE);

  const contextOnly = scoreClaim(
    claim("insufficient", [source("https://instat.mg/a", "official", "context"), source("https://newsmada.com/b", "independent", "context")]),
    NOW,
  );
  assert.ok(contextOnly.confidenceIndex <= NO_SOURCE_MAX_CONFIDENCE);
});

test("the model cannot set the index", () => {
  const scored = scoreClaim({ ...claim("confirmed", []), confidenceIndex: 99 }, NOW);
  assert.equal(scored.confidenceIndex, 0);
});

test("global index averages claim indexes with a breakdown", () => {
  const result = scoreVerification(
    {
      detectedLanguage: "fr",
      summary: "Summary",
      claims: [
        claim("confirmed", [source("https://instat.mg/a", "official"), source("https://newsmada.com/b", "independent")]),
        claim("insufficient", []),
      ],
      limitations: [],
    },
    NOW,
  );
  assert.equal(result.globalBreakdown.length, 2);
  assert.equal(result.globalIndex, total(result.globalBreakdown));
  assert.ok(result.globalIndex < result.claims[0].confidenceIndex);

  const empty = scoreVerification({ detectedLanguage: "fr", summary: "", claims: [], limitations: [] }, NOW);
  assert.equal(empty.globalIndex, 0);
});
