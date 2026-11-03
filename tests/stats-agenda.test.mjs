import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { parseAgenda, parseStats, upcomingAgenda } = await import("../lib/stats.ts");

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const title = { mg: "t", fr: "t", en: "t" };

test("the committed agenda file is valid and every item and watched source has an https link", () => {
  const agenda = parseAgenda(read("../data/agenda.json"));
  assert.match(agenda.updatedAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(agenda.watch.length >= 1);
  for (const source of agenda.watch) assert.match(source.url, /^https:\/\//);
  assert.equal(agenda.items.length, read("../data/agenda.json").items.length, "every committed item must pass the schema");
});

test("agenda items without a source, with a bad date or missing a language are dropped", () => {
  const agenda = parseAgenda({
    updatedAt: "2026-11-03",
    watch: [],
    items: [
      { date: "2026-12-10", title, organizer: "INSTAT", source: { url: "https://www.instat.mg/" } },
      { date: "2026-11-20", title, organizer: "BFM", source: { url: "https://www.banky-foibe.mg/" } },
      { date: "2026-12-01", title, organizer: "No source" },
      { date: "10/12/2026", title, organizer: "Bad date", source: { url: "https://example.org/" } },
      { date: "2026-12-02", title: { fr: "t" }, organizer: "One language", source: { url: "https://example.org/" } },
    ],
  });
  assert.deepEqual(agenda.items.map((i) => i.organizer), ["BFM", "INSTAT"]);
});

test("only dates from today on are shown as upcoming", () => {
  const items = [
    { date: "2026-11-02", title, organizer: "past", source: { url: "https://a.org/" } },
    { date: "2026-11-03", title, organizer: "today", source: { url: "https://a.org/" } },
    { date: "2027-01-15", title, organizer: "later", source: { url: "https://a.org/" } },
  ];
  assert.deepEqual(upcomingAgenda(items, "2026-11-03").map((i) => i.organizer), ["today", "later"]);
});

test("refreshing the statistics can no longer wipe the agenda", () => {
  const script = readFileSync(new URL("../scripts/update-stats.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(script, /agenda/);
  const stats = parseStats(read("../data/stats.json"));
  assert.ok(stats.indicators.length > 0);
  for (const indicator of stats.indicators) {
    assert.ok(indicator.source.url && indicator.period && indicator.updatedAt, indicator.id);
    assert.ok(indicator.series.length >= 1);
  }
});
