import { createHash } from "node:crypto";
import type { MonitorArticle } from "@/lib/monitor/types";
import { isRecurringColumn, overlapCoefficient, sharedTokenCount, tokenSet } from "@/lib/monitor/taxonomy";

const MAX_SAME_EVENT_GAP_MS = 72 * 60 * 60 * 1_000;
const MIN_OVERLAP = 0.5;
const MIN_SHARED_TOKENS = 2;
const MAX_ANCHOR_TOKENS = 6;

export type ArticleCluster = {
  id: string;
  articles: MonitorArticle[];
};

function eventIdFor(anchor: string[]): string {
  const digest = createHash("sha256").update(anchor.join("\u0000")).digest("hex");
  return `evt-${digest.slice(0, 12)}`;
}

function anchorTokens(articles: MonitorArticle[]): string[] {
  const counts = new Map<string, number>();
  for (const article of articles) {
    for (const token of tokenSet(article.title)) counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_ANCHOR_TOKENS)
    .map(([token]) => token)
    .sort();
}

export function clusterArticles(articles: MonitorArticle[]): ArticleCluster[] {
  if (articles.length === 0) return [];

  const ordered = [...articles].sort(
    (a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt) || a.id.localeCompare(b.id),
  );
  const tokens = ordered.map((article) => tokenSet(article.title));
  const recurring = ordered.map((article) => isRecurringColumn(article.title));
  const parent = ordered.map((_, index) => index);

  function find(index: number): number {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    let cursor = index;
    while (parent[cursor] !== cursor) {
      const next = parent[cursor];
      parent[cursor] = root;
      cursor = next;
    }
    return root;
  }

  function union(left: number, right: number) {
    const rootLeft = find(left);
    const rootRight = find(right);
    if (rootLeft !== rootRight) parent[rootRight] = rootLeft;
  }

  for (let left = 0; left < ordered.length; left += 1) {
    for (let right = left + 1; right < ordered.length; right += 1) {
      const gap = Date.parse(ordered[right].publishedAt) - Date.parse(ordered[left].publishedAt);
      if (gap > MAX_SAME_EVENT_GAP_MS) break;
      if (recurring[left] || recurring[right]) continue;
      if (sharedTokenCount(tokens[left], tokens[right]) < MIN_SHARED_TOKENS) continue;
      if (overlapCoefficient(tokens[left], tokens[right]) < MIN_OVERLAP) continue;
      union(left, right);
    }
  }

  const groups = new Map<number, MonitorArticle[]>();
  ordered.forEach((article, index) => {
    const root = find(index);
    const group = groups.get(root) ?? [];
    group.push(article);
    groups.set(root, group);
  });

  return [...groups.values()]
    .map((group) => {
      const sorted = [...group].sort(
        (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.id.localeCompare(b.id),
      );
      const anchor = anchorTokens(sorted);
      const id = anchor.length > 0 ? eventIdFor(anchor) : eventIdFor(sorted.map((article) => article.id).sort());
      return { id, articles: sorted };
    })
    .sort((a, b) => Date.parse(b.articles[0].publishedAt) - Date.parse(a.articles[0].publishedAt));
}
