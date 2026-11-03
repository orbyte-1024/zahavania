import type { MonitorArticle, MonitorMomentum } from "@/lib/monitor/types";

const RECENT_WINDOW_HOURS = 24;

export function computeMomentum(articles: MonitorArticle[], now: Date = new Date()): MonitorMomentum {
  const nowMs = now.getTime();
  const recentFrom = nowMs - RECENT_WINDOW_HOURS * 60 * 60 * 1_000;
  const earlierFrom = nowMs - 2 * RECENT_WINDOW_HOURS * 60 * 60 * 1_000;

  const times = articles.map((article) => Date.parse(article.publishedAt)).filter(Number.isFinite);
  const recent = articles.filter((article) => Date.parse(article.publishedAt) >= recentFrom);
  const earlier = articles.filter((article) => {
    const published = Date.parse(article.publishedAt);
    return published >= earlierFrom && published < recentFrom;
  });

  const recentSources = new Set(recent.map((article) => article.sourceId)).size;
  const newest = times.length > 0 ? Math.max(...times) : 0;
  const ageHours = newest > 0 ? (nowMs - newest) / (60 * 60 * 1_000) : Number.POSITIVE_INFINITY;

  const recentPoints = Math.min(40, recent.length * 8);
  const sourcePoints = Math.min(30, recentSources * 10);
  const accelerationPoints = recent.length > earlier.length && recent.length >= 2 ? 15 : 0;
  const freshnessPoints = ageHours <= 6 ? 15 : ageHours <= 24 ? 8 : 0;
  const score = Math.max(0, Math.min(100, recentPoints + sourcePoints + accelerationPoints + freshnessPoints));

  const factors: MonitorMomentum["factors"] = [];
  if (recent.length > 0) factors.push({ code: "recent_articles", value: recent.length });
  if (recentSources > 0) factors.push({ code: "recent_sources", value: recentSources });
  if (accelerationPoints > 0) factors.push({ code: "acceleration", value: recent.length - earlier.length });
  if (freshnessPoints > 0) factors.push({ code: "freshness", value: Math.round(ageHours) });

  return {
    score,
    level: score >= 65 ? "surge" : score >= 35 ? "rising" : "steady",
    recentArticles: recent.length,
    earlierArticles: earlier.length,
    recentSources,
    factors,
  };
}
