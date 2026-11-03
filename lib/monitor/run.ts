import "server-only";
import feedsFile from "@/data/monitor-sources.json";
import { AiError, isMockMode } from "@/lib/ai/client";
import { analyseEventVersions } from "@/lib/ai/monitor";
import { hashKey, createTtlCache } from "@/lib/cache";
import { collectArticles, type CollectedArticle } from "@/lib/monitor/collect";
import { buildEvents } from "@/lib/monitor/events";
import { filterArticles } from "@/lib/monitor/filters";
import type { MonitorInput } from "@/lib/monitor/input";
import { mockCollectedArticles, mockVersionAnalysis } from "@/lib/monitor/mock";
import type { FeedsData, MonitorAnalysisState, MonitorEvent, MonitorPayload } from "@/lib/monitor/types";
import { applyVersionAnalysis, eligibleEvents } from "@/lib/monitor/versions";
import { buildAlerts } from "@/lib/monitor/alerts";

export class MonitorError extends Error {
  readonly code: "feeds_unavailable" | "monitor_unavailable";

  constructor(code: "feeds_unavailable" | "monitor_unavailable", detail: string) {
    super(detail);
    this.name = "MonitorError";
    this.code = code;
  }
}

export type MonitorRunResult = {
  payload: MonitorPayload;
  mock: boolean;
};

export const MONITOR_DATA = feedsFile as FeedsData;

const MONITOR_CACHE_TTL_MS = 5 * 60 * 1_000;
const CACHE_BUCKET_MS = 5 * 60 * 1_000;
const MAX_AI_EVENTS = 6;

const payloadCache = createTtlCache<MonitorPayload>({
  ttlMs: MONITOR_CACHE_TTL_MS,
  maxEntries: 100,
});

function cacheKey(input: MonitorInput, userId: string, now: Date): string {
  return hashKey([
    "monitor",
    userId,
    Math.floor(now.getTime() / CACHE_BUCKET_MS),
    input.lang,
    input.region ?? null,
    input.district ?? null,
    input.theme ?? null,
    input.query ?? null,
    input.sinceHours,
    input.maxArticles,
  ]);
}

function applyVersions(events: MonitorEvent[], versions: ReturnType<typeof applyVersionAnalysis>) {
  return events.map((event) => {
    const analysed = versions.versions.get(event.id);
    return analysed ? { ...event, versions: analysed } : event;
  });
}

export async function runMonitor(input: MonitorInput, userId: string, now: Date = new Date()): Promise<MonitorRunResult> {
  const startedAt = performance.now();
  const mock = isMockMode();
  const key = cacheKey(input, userId, now);
  const cached = payloadCache.get(key);
  if (cached) {
    return { payload: { ...cached, meta: { ...cached.meta, cached: true, durationMs: 0 } }, mock };
  }

  const limitations = new Set<string>([
    "headlines_and_excerpts_only",
    "lexical_event_grouping",
    "location_inferred_from_text",
  ]);

  let collected: CollectedArticle[];
  let sourcesConfigured: number;
  let sourcesFetched: number;
  let failures: MonitorPayload["coverage"]["failed"];

  if (mock) {
    const seeds = mockCollectedArticles(now);
    collected = seeds;
    sourcesConfigured = new Set(seeds.map((article) => article.sourceId)).size;
    sourcesFetched = sourcesConfigured;
    failures = [];
    limitations.add("mock_demo_data");
  } else {
    const result = await collectArticles(MONITOR_DATA, now);
    collected = result.articles;
    sourcesConfigured = MONITOR_DATA.sources.filter((source) => source.enabled).length;
    sourcesFetched = result.sourcesFetched;
    failures = result.failures;
    if (failures.length > 0) limitations.add("feed_failures");
    if (sourcesFetched === 0 && sourcesConfigured > 0) {
      throw new MonitorError("feeds_unavailable", "no configured feed could be fetched");
    }
  }

  const filtered = filterArticles(collected, input, now);
  if (filtered.truncated) limitations.add("articles_truncated");
  if (filtered.articles.length === 0) limitations.add("no_matching_articles");

  let events = buildEvents(filtered.articles, now);
  const articlesById = new Map(filtered.articles.map((article) => [article.id, article]));
  let analysis: MonitorAnalysisState = mock ? "mock" : "skipped";
  let aiErrorCode: string | null = null;
  let droppedReferences = 0;

  if (mock) {
    const versions = applyVersionAnalysis(mockVersionAnalysis(events), events, articlesById);
    events = applyVersions(events, versions);
    limitations.add("ai_summary_from_headlines");
  } else {
    const candidates = eligibleEvents(events, MAX_AI_EVENTS);
    if (candidates.length > 0) {
      try {
        const result = await analyseEventVersions({ events: candidates, articlesById, lang: input.lang });
        const versions = applyVersionAnalysis(result.analysis, events, articlesById);
        events = applyVersions(events, versions);
        droppedReferences = versions.droppedPositions;
        analysis = "ok";
        limitations.add("ai_summary_from_headlines");
      } catch (error) {
        analysis = "unavailable";
        aiErrorCode = error instanceof AiError ? error.code : "unknown_error";
      }
    }
    if (analysis === "unavailable") limitations.add("ai_analysis_unavailable");
    else if (analysis === "skipped") limitations.add("ai_analysis_skipped");
    if (droppedReferences > 0) limitations.add("ai_references_filtered");
  }

  const alerts = buildAlerts(events, now);
  const durationMs = Math.round(performance.now() - startedAt);

  const payload: MonitorPayload = {
    generatedAt: now.toISOString(),
    window: {
      from: new Date(now.getTime() - input.sinceHours * 60 * 60 * 1_000).toISOString(),
      to: now.toISOString(),
    },
    filters: {
      lang: input.lang,
      region: input.region ?? null,
      district: input.district ?? null,
      theme: input.theme ?? null,
      query: input.query ?? null,
      sinceHours: input.sinceHours,
      maxArticles: input.maxArticles,
    },
    coverage: {
      sourcesConfigured,
      sourcesFetched,
      articlesFetched: collected.length,
      articlesMatched: filtered.matchedCount,
      truncated: filtered.truncated,
      failed: failures,
    },
    articles: filtered.articles,
    events,
    alerts,
    limitations: [...limitations],
    meta: { durationMs, cached: false, analysis, aiErrorCode },
  };

  payloadCache.set(key, payload);
  return { payload, mock };
}
