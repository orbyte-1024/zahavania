import type { Language } from "@/lib/ai/schemas";
import type { Region } from "@/lib/constants/regions";

export type MonitorTheme =
  | "politics"
  | "economy"
  | "agriculture"
  | "health"
  | "education"
  | "environment"
  | "security_justice"
  | "infrastructure"
  | "energy_mining"
  | "society"
  | "sport"
  | "general";

export type MonitorSource = {
  id: string;
  name: string;
  homepage: string;
  feedUrl: string;
  lang: Language;
  scope: "national" | "international";
  checkedAt: string;
  enabled: boolean;
  requireTerms?: string[];
};

export type FeedsData = {
  auditedAt: string;
  policy: string;
  sources: MonitorSource[];
};

export type MonitorSourceFailure = {
  sourceId: string;
  sourceName: string;
  code: string;
};

export type MonitorArticle = {
  id: string;
  title: string;
  url: string;
  sourceId: string;
  sourceName: string;
  lang: Language;
  publishedAt: string;
  excerpt: string;
  region: Region | null;
  district: string | null;
  themes: MonitorTheme[];
};

export type MonitorTrendFactorCode =
  | "recent_articles"
  | "recent_sources"
  | "acceleration"
  | "freshness";

export type MonitorMomentum = {
  score: number;
  level: "steady" | "rising" | "surge";
  recentArticles: number;
  earlierArticles: number;
  recentSources: number;
  factors: { code: MonitorTrendFactorCode; value: number }[];
};

export type MonitorDivergenceStatus = "contradicted" | "needs_verification" | "insufficient";

export type MonitorPosition = {
  articleId: string;
  sourceId: string;
  sourceName: string;
  position: string;
};

export type MonitorDivergence = {
  point: string;
  status: MonitorDivergenceStatus;
  positions: MonitorPosition[];
};

export type MonitorVersions = {
  coverage: "divergent" | "no_divergence_found" | "single_source" | "not_analysed";
  summary: string | null;
  sharedFacts: string[];
  divergences: MonitorDivergence[];
  limitations: string[];
};

export type MonitorEventSource = {
  sourceId: string;
  sourceName: string;
  articleCount: number;
};

export type MonitorEvent = {
  id: string;
  title: string;
  articleIds: string[];
  sources: MonitorEventSource[];
  firstSeenAt: string;
  lastSeenAt: string;
  articleCount: number;
  sourceCount: number;
  region: Region | null;
  district: string | null;
  themes: MonitorTheme[];
  momentum: MonitorMomentum;
  versions: MonitorVersions;
};

export type MonitorAlertKind = "new_event" | "rising_event" | "contradictory_versions";

export type MonitorAlertReasonCode =
  | "new_event"
  | "recent_articles"
  | "multiple_sources"
  | "acceleration"
  | "contradictory_versions";

export type MonitorAlert = {
  id: string;
  kind: MonitorAlertKind;
  severity: "info" | "attention" | "urgent";
  eventId: string;
  title: string;
  articleIds: string[];
  createdAt: string;
  reason: { code: MonitorAlertReasonCode; articleCount: number; sourceCount: number };
};

export type MonitorFilters = {
  lang: Language;
  region: Region | null;
  district: string | null;
  theme: MonitorTheme | null;
  query: string | null;
  sinceHours: number;
  maxArticles: number;
};

export type MonitorCoverage = {
  sourcesConfigured: number;
  sourcesFetched: number;
  articlesFetched: number;
  articlesMatched: number;
  truncated: boolean;
  failed: MonitorSourceFailure[];
};

export type MonitorAnalysisState = "ok" | "mock" | "skipped" | "unavailable";

export type MonitorPayload = {
  generatedAt: string;
  window: { from: string; to: string };
  filters: MonitorFilters;
  coverage: MonitorCoverage;
  articles: MonitorArticle[];
  events: MonitorEvent[];
  alerts: MonitorAlert[];
  limitations: string[];
  meta: {
    durationMs: number;
    cached: boolean;
    analysis: MonitorAnalysisState;
    aiErrorCode: string | null;
  };
};

export type MonitorSourceSummary = {
  id: string;
  name: string;
  homepage: string;
  lang: Language;
  scope: "national" | "international";
  checkedAt: string;
};
