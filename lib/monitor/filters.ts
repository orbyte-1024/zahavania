import type { Region } from "@/lib/constants/regions";
import type { Language } from "@/lib/ai/schemas";
import { detectLocation } from "@/lib/monitor/districts";
import { classifyThemes, foldText } from "@/lib/monitor/taxonomy";
import type { CollectedArticle } from "@/lib/monitor/collect";
import type { MonitorArticle, MonitorTheme } from "@/lib/monitor/types";

export type MonitorFilterInput = {
  articleLang?: Language;
  sourceId?: string;
  region?: Region;
  district?: string;
  theme?: MonitorTheme;
  query?: string;
  sinceHours: number;
  maxArticles: number;
};

export type FilterResult = {
  articles: MonitorArticle[];
  matchedCount: number;
  truncated: boolean;
};

export function enrichArticle(article: CollectedArticle): MonitorArticle {
  const location = detectLocation(article.title, article.excerpt);
  return {
    id: article.sourceId + ":" + Math.abs(hashString(article.url)).toString(36),
    title: article.title,
    url: article.url,
    sourceId: article.sourceId,
    sourceName: article.sourceName,
    lang: article.lang,
    publishedAt: article.publishedAt,
    excerpt: article.excerpt,
    region: location?.region ?? null,
    district: location?.district ?? null,
    themes: classifyThemes(article.title, article.excerpt),
  };
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return hash;
}

function matchesQuery(article: MonitorArticle, query: string): boolean {
  const needle = foldText(query);
  if (!needle) return true;
  return foldText(`${article.title} ${article.excerpt}`).includes(needle);
}

export function articleMatches(article: MonitorArticle, filters: MonitorFilterInput): boolean {
  if (filters.articleLang && article.lang !== filters.articleLang) return false;
  if (filters.sourceId && article.sourceId !== filters.sourceId) return false;
  if (filters.region && article.region !== filters.region) return false;
  if (filters.district && article.district !== filters.district) return false;
  if (filters.theme && !article.themes.includes(filters.theme)) return false;
  if (filters.query && !matchesQuery(article, filters.query)) return false;
  return true;
}

export function filterArticles(
  articles: CollectedArticle[],
  filters: MonitorFilterInput,
  now: Date = new Date(),
): FilterResult {
  const from = now.getTime() - filters.sinceHours * 60 * 60 * 1_000;
  const inWindow = articles.filter((article) => {
    const published = Date.parse(article.publishedAt);
    return Number.isFinite(published) && published >= from && published <= now.getTime();
  });

  const matched = inWindow
    .map(enrichArticle)
    .filter((article) => articleMatches(article, filters))
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.id.localeCompare(b.id));

  return {
    articles: matched.slice(0, filters.maxArticles),
    matchedCount: matched.length,
    truncated: matched.length > filters.maxArticles,
  };
}
