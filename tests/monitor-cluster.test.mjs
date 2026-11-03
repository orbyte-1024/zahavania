import test from "node:test";
import assert from "node:assert/strict";
import { buildAlerts } from "../lib/monitor/alerts.ts";
import { clusterArticles } from "../lib/monitor/cluster.ts";
import { detectLocation } from "../lib/monitor/districts.ts";
import { buildEvents } from "../lib/monitor/events.ts";
import { articleMatches, enrichArticle, filterArticles } from "../lib/monitor/filters.ts";
import { classifyThemes } from "../lib/monitor/taxonomy.ts";
import { computeMomentum } from "../lib/monitor/trends.ts";
import { applyVersionAnalysis } from "../lib/monitor/versions.ts";

const now = new Date("2026-11-03T12:00:00Z");

let sequence = 0;
function article(title, overrides = {}) {
  sequence += 1;
  return {
    id: `a${sequence}`,
    title,
    url: `https://example.org/${sequence}`,
    sourceId: overrides.sourceId ?? "source-a",
    sourceName: overrides.sourceName ?? "Source A",
    lang: "fr",
    publishedAt: overrides.publishedAt ?? "2026-11-03T10:00:00Z",
    excerpt: overrides.excerpt ?? "",
    region: overrides.region ?? null,
    district: overrides.district ?? null,
    themes: overrides.themes ?? ["general"],
  };
}

test("articles about the same event are grouped, unrelated ones are not", () => {
  const clusters = clusterArticles([
    article("Hausse du prix du riz à Antananarivo"),
    article("Le prix du riz augmente à Antananarivo", { sourceId: "source-b" }),
    article("Cyclone à Mananjary : trois morts", { sourceId: "source-c" }),
  ]);

  assert.equal(clusters.length, 2);
  assert.equal(clusters.find((cluster) => cluster.articles.length === 2)?.articles.length, 2);
  assert.ok(clusters.some((cluster) => cluster.articles.some((entry) => entry.title.includes("Cyclone"))));
});

test("daily recurring columns are never grouped together", () => {
  const clusters = clusterArticles([
    article("Nécrologie du 3 novembre 2026"),
    article("Nécrologie du 2 novembre 2026", { sourceId: "source-b" }),
  ]);
  assert.equal(clusters.length, 2);
});

test("an event id stays stable when a matching article is added", () => {
  const first = clusterArticles([article("Hausse du prix du riz à Antananarivo"), article("Le prix du riz augmente à Antananarivo")]);
  const second = clusterArticles([
    article("Hausse du prix du riz à Antananarivo"),
    article("Le prix du riz augmente à Antananarivo"),
    article("Riz : flambée des prix à Antananarivo", { sourceId: "source-b" }),
  ]);
  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
  assert.equal(first[0].id, second[0].id);
});

test("location and themes are derived from the headline in three languages", () => {
  assert.deepEqual(detectLocation("Cyclone à Mananjary", ""), { region: "vatovavy", district: "mananjary" });
  assert.deepEqual(detectLocation("Hausse du prix du riz", "à Antananarivo"), {
    region: "analamanga",
    district: "antananarivo-renivohitra",
  });
  assert.equal(detectLocation("Budget national", ""), null);
  assert.ok(classifyThemes("Cyclone à Mananjary", "trois morts").includes("environment"));
  assert.ok(classifyThemes("Rentrée scolaire à Fianarantsoa", "les enseignants s'inquiètent").includes("education"));
  assert.deepEqual(classifyThemes("Annonce sans mot-clé", ""), ["general"]);
});

test("momentum rises with recent articles, sources and acceleration", () => {
  const momentum = computeMomentum(
    [
      article("Un", { publishedAt: "2026-11-03T11:00:00Z", sourceId: "a" }),
      article("Deux", { publishedAt: "2026-11-03T09:00:00Z", sourceId: "b" }),
      article("Trois", { publishedAt: "2026-11-02T06:00:00Z", sourceId: "a" }),
    ],
    now,
  );
  assert.equal(momentum.recentArticles, 2);
  assert.equal(momentum.earlierArticles, 1);
  assert.equal(momentum.recentSources, 2);
  assert.equal(momentum.level, "surge");
  assert.ok(momentum.score >= 65);
  assert.ok(momentum.factors.some((factor) => factor.code === "acceleration"));

  const steady = computeMomentum([article("Un", { publishedAt: "2026-10-29T10:00:00Z" })], now);
  assert.equal(steady.level, "steady");
  assert.equal(steady.score, 0);
});

test("filters apply region, district, theme, query and the time window", () => {
  const collected = [
    {
      title: "Hausse du prix du riz à Antananarivo",
      url: "https://example.org/1",
      sourceId: "source-a",
      sourceName: "Source A",
      lang: "fr",
      publishedAt: "2026-11-03T10:00:00Z",
      excerpt: "Les marchés sous tension",
    },
    {
      title: "Cyclone à Mananjary : trois morts",
      url: "https://example.org/2",
      sourceId: "source-b",
      sourceName: "Source B",
      lang: "fr",
      publishedAt: "2026-11-01T10:00:00Z",
      excerpt: "Bilan provisoire",
    },
    {
      title: "Ancienne nouvelle",
      url: "https://example.org/3",
      sourceId: "source-c",
      sourceName: "Source C",
      lang: "fr",
      publishedAt: "2026-10-20T10:00:00Z",
      excerpt: "Hors fenêtre",
    },
  ];

  const base = { sinceHours: 72, maxArticles: 60 };
  const rice = filterArticles(collected, { ...base, region: "analamanga", theme: "economy" }, now);
  assert.equal(rice.matchedCount, 1);
  assert.equal(rice.articles[0].district, "antananarivo-renivohitra");
  assert.equal(rice.articles[0].themes.includes("agriculture"), true);
  assert.equal(filterArticles(collected, { ...base, district: "mananjary" }, now).articles.length, 1);
  assert.equal(filterArticles(collected, { ...base, theme: "health" }, now).articles.length, 0);
  assert.equal(filterArticles(collected, { ...base, query: "bilan" }, now).articles.length, 1);
  assert.equal(filterArticles(collected, { sinceHours: 1, maxArticles: 60 }, now).articles.length, 0);
  assert.equal(filterArticles(collected, { ...base, maxArticles: 10 }, now).articles.length, 2);

  const enriched = enrichArticle(collected[0]);
  assert.equal(articleMatches(enriched, { ...base, region: "vatovavy" }), false);
  assert.equal(enriched.region, "analamanga");
});

test("events expose momentum and alerts are generated from code signals", () => {
  const events = buildEvents(
    [
      article("Cyclone à Mananjary : un bilan de trois morts", {
        sourceId: "a",
        publishedAt: "2026-11-03T11:00:00Z",
        region: "vatovavy",
        district: "mananjary",
      }),
      article("Cyclone à Mananjary : un bilan de cinq morts", {
        sourceId: "b",
        publishedAt: "2026-11-03T10:00:00Z",
        region: "vatovavy",
        district: "mananjary",
      }),
      article("Cyclone à Mananjary : un bilan qui s'alourdit", {
        sourceId: "a",
        publishedAt: "2026-11-03T08:00:00Z",
        region: "vatovavy",
        district: "mananjary",
      }),
    ],
    now,
  );

  assert.equal(events.length, 1);
  assert.equal(events[0].sourceCount, 2);
  assert.equal(events[0].region, "vatovavy");
  assert.equal(events[0].versions.coverage, "not_analysed");

  const analysed = [
    {
      ...events[0],
      versions: {
        coverage: "divergent",
        summary: "Deux bilans différents.",
        sharedFacts: [],
        divergences: [],
        limitations: [],
      },
    },
  ];
  const alerts = buildAlerts(analysed, now);
  const kinds = alerts.map((alert) => alert.kind);
  assert.ok(kinds.includes("rising_event"));
  assert.ok(kinds.includes("new_event"));
  assert.ok(kinds.includes("contradictory_versions"));
  assert.equal(alerts[0].severity, "urgent");
});

test("fabricated and single-source version references are removed", () => {
  const first = article("Cyclone à Mananjary : trois morts", { sourceId: "a" });
  const second = article("Cyclone à Mananjary : cinq morts", { sourceId: "b" });
  const event = {
    ...buildEvents([first, second], now)[0],
    sourceCount: 2,
  };
  const articlesById = new Map([
    [first.id, first],
    [second.id, second],
  ]);

  const result = applyVersionAnalysis(
    {
      events: [
        {
          eventId: event.id,
          summary: "Deux bilans.",
          sharedFacts: ["Un cyclone a touché Mananjary."],
          divergences: [
            {
              point: "Nombre de morts",
              status: "contradicted",
              positions: [
                { articleId: first.id, position: "Trois morts." },
                { articleId: "invented", position: "Sept morts." },
              ],
            },
            {
              point: "Bilan",
              status: "needs_verification",
              positions: [
                { articleId: first.id, position: "Provisoire." },
                { articleId: first.id, position: "Confirmé." },
              ],
            },
            {
              point: "Source du bilan",
              status: "contradicted",
              positions: [
                { articleId: first.id, position: "Gendarmerie." },
                { articleId: second.id, position: "Mairie." },
              ],
            },
          ],
          limitations: [],
        },
        { eventId: "unknown", summary: "", sharedFacts: [], divergences: [], limitations: [] },
      ],
    },
    [event],
    articlesById,
  );

  const versions = result.versions.get(event.id);
  assert.equal(versions.coverage, "divergent");
  assert.equal(versions.divergences.length, 1);
  assert.deepEqual(versions.divergences[0].positions.map((position) => position.sourceId), ["a", "b"]);
  assert.equal(result.droppedPositions, 2);
  assert.deepEqual(result.analysedEventIds, [event.id]);
});
