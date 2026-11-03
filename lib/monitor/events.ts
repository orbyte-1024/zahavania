import type { Region } from "@/lib/constants/regions";
import { clusterArticles } from "@/lib/monitor/cluster";
import { computeMomentum } from "@/lib/monitor/trends";
import type { MonitorArticle, MonitorEvent, MonitorTheme } from "@/lib/monitor/types";
import { pendingVersions } from "@/lib/monitor/versions";

function majority<T>(values: T[]): T | null {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best: T | null = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

export function buildEvents(articles: MonitorArticle[], now: Date = new Date()): MonitorEvent[] {
  return clusterArticles(articles).map((cluster) => {
    const members = cluster.articles;
    const times = members.map((article) => Date.parse(article.publishedAt));
    const sourceCounts = new Map<string, { sourceName: string; articleCount: number }>();

    for (const article of members) {
      const current = sourceCounts.get(article.sourceId) ?? { sourceName: article.sourceName, articleCount: 0 };
      current.articleCount += 1;
      sourceCounts.set(article.sourceId, current);
    }

    const themes: MonitorTheme[] = [];
    for (const article of members) {
      for (const theme of article.themes) if (!themes.includes(theme)) themes.push(theme);
    }

    const regions = members.map((article) => article.region).filter((region): region is Region => region !== null);
    const districts = members.map((article) => article.district).filter((district): district is string => district !== null);
    const sourceCount = sourceCounts.size;

    return {
      id: cluster.id,
      title: members[0].title,
      articleIds: members.map((article) => article.id),
      sources: [...sourceCounts.entries()]
        .map(([sourceId, value]) => ({ sourceId, sourceName: value.sourceName, articleCount: value.articleCount }))
        .sort((a, b) => b.articleCount - a.articleCount || a.sourceId.localeCompare(b.sourceId)),
      firstSeenAt: new Date(Math.min(...times)).toISOString(),
      lastSeenAt: new Date(Math.max(...times)).toISOString(),
      articleCount: members.length,
      sourceCount,
      region: majority(regions),
      district: majority(districts),
      themes,
      momentum: computeMomentum(members, now),
      versions: pendingVersions({ sourceCount }),
    };
  });
}
