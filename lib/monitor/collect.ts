import "server-only";
import { createTtlCache } from "@/lib/cache";
import { readIntEnv } from "@/lib/env";
import { canonicalArticleUrl, itemMatchesSourceTerms, parseFeed } from "@/lib/monitor/feed";
import type { FeedsData, MonitorSource, MonitorSourceFailure } from "@/lib/monitor/types";
import { safeFetchText, SafeFetchError } from "@/lib/security/safe-fetch";

export type CollectedArticle = {
  title: string;
  url: string;
  sourceId: string;
  sourceName: string;
  lang: MonitorSource["lang"];
  publishedAt: string;
  excerpt: string;
};

export type CollectResult = {
  articles: CollectedArticle[];
  failures: MonitorSourceFailure[];
  sourcesFetched: number;
};

const XML_CONTENT_TYPES = [
  "application/rss+xml",
  "application/atom+xml",
  "application/rdf+xml",
  "application/xml",
  "text/xml",
  "text/rss+xml",
  "text/atom+xml",
  "application/xhtml+xml",
];

const ACCEPT = "application/rss+xml,application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.1";
const MAX_CONCURRENT_FETCHES = 4;

const feedCache = createTtlCache<CollectedArticle[]>({
  ttlMs: readIntEnv("MONITOR_FEED_CACHE_SECONDS", 600, 0, 3_600) * 1_000,
  maxEntries: 32,
});

function failureCode(error: unknown): string {
  return error instanceof SafeFetchError ? error.code : "parse_error";
}

async function fetchSource(source: MonitorSource, now: Date): Promise<CollectedArticle[]> {
  const cached = feedCache.get(source.feedUrl);
  if (cached) return cached;

  const { body } = await safeFetchText(source.feedUrl, { allowedContentTypes: XML_CONTENT_TYPES, accept: ACCEPT });
  const parsed = parseFeed(body, { now });
  const articles = parsed.items
    .filter((item) => itemMatchesSourceTerms(item, source))
    .map((item) => ({
      title: item.title,
      url: item.url,
      sourceId: source.id,
      sourceName: source.name,
      lang: source.lang,
      publishedAt: item.publishedAt,
      excerpt: item.excerpt,
    }));

  feedCache.set(source.feedUrl, articles);
  return articles;
}

async function mapWithLimit<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await run(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function collectArticles(data: FeedsData, now: Date = new Date()): Promise<CollectResult> {
  const sources = data.sources.filter((source) => source.enabled);
  const failures: MonitorSourceFailure[] = [];
  let sourcesFetched = 0;

  const batches = await mapWithLimit(sources, MAX_CONCURRENT_FETCHES, async (source) => {
    try {
      const articles = await fetchSource(source, now);
      sourcesFetched += 1;
      return articles;
    } catch (error) {
      failures.push({ sourceId: source.id, sourceName: source.name, code: failureCode(error) });
      return [];
    }
  });

  const seen = new Set<string>();
  const articles: CollectedArticle[] = [];
  for (const article of batches.flat()) {
    const canonical = canonicalArticleUrl(article.url);
    if (!canonical || seen.has(canonical)) continue;
    seen.add(canonical);
    articles.push({ ...article, url: canonical });
  }

  failures.sort((a, b) => a.sourceId.localeCompare(b.sourceId));
  return { articles, failures, sourcesFetched };
}
