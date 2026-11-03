import type { MonitorSource } from "@/lib/monitor/types";

export type FeedItem = {
  title: string;
  url: string;
  publishedAt: string;
  excerpt: string;
};

export type ParsedFeed = {
  feedTitle: string | null;
  items: FeedItem[];
};

const MAX_TITLE_LENGTH = 300;
const MAX_EXCERPT_LENGTH = 300;
const MAX_ITEMS_PER_FEED = 40;

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  laquo: "«",
  raquo: "»",
};

export function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (entity.startsWith("#")) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

function unwrapCdata(value: string): string {
  const trimmed = value.trim();
  const match = /^<!\[CDATA\[([\s\S]*)\]\]>$/.exec(trimmed);
  return match ? match[1] : trimmed;
}

function readTag(block: string, names: readonly string[]): string | null {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)<\\/${escaped}>`, "i");
    const match = pattern.exec(block);
    if (!match) continue;
    const raw = unwrapCdata(match[1]);
    return raw.trim() === "" ? null : raw;
  }
  return null;
}

function readLink(block: string): string | null {
  const inner = readTag(block, ["link"]);
  if (inner) return unwrapCdata(inner).trim();
  const href = /<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*\/?>/i.exec(block);
  return href ? href[1].trim() : null;
}

export function stripMarkup(value: string): string {
  const withoutBlocks = value.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  const withoutTags = withoutBlocks
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6])>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(withoutTags).replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const cut = value.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export function canonicalArticleUrl(raw: string): string | null {
  if (!URL.canParse(raw)) return null;
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$)/i.test(key)) url.searchParams.delete(key);
  }
  url.hostname = url.hostname.toLowerCase();
  return url.toString();
}

export function parseRssDate(raw: string | null): string | null {
  if (!raw) return null;
  const value = Date.parse(raw.trim());
  if (!Number.isFinite(value)) return null;
  const date = new Date(value);
  if (date.getFullYear() < 1990) return null;
  return date.toISOString();
}

function extractBlocks(xml: string, tag: "item" | "entry"): string[] {
  const pattern = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  return [...xml.matchAll(pattern)].map((match) => match[1]);
}

type ParseOptions = {
  now?: Date;
  maxItems?: number;
};

export function parseFeed(xml: string, options: ParseOptions = {}): ParsedFeed {
  const now = options.now ?? new Date();
  const maxItems = options.maxItems ?? MAX_ITEMS_PER_FEED;
  const feedTitleRaw = readTag(xml.slice(0, 4_000), ["title"]);
  const feedTitle = feedTitleRaw ? stripMarkup(feedTitleRaw) : null;

  const blocks = [...extractBlocks(xml, "item"), ...extractBlocks(xml, "entry")];
  const items: FeedItem[] = [];
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();

  for (const block of blocks) {
    const titleRaw = readTag(block, ["title"]);
    const linkRaw = readLink(block);
    const dateRaw = readTag(block, ["pubDate", "dc:date", "published", "updated", "date"]);
    if (!titleRaw || !linkRaw) continue;

    const title = truncate(stripMarkup(titleRaw), MAX_TITLE_LENGTH);
    const url = canonicalArticleUrl(decodeEntities(linkRaw));
    const publishedAt = parseRssDate(dateRaw);
    if (!title || !url || !publishedAt) continue;

    const published = Date.parse(publishedAt);
    if (published > now.getTime() + 6 * 60 * 60 * 1_000) continue;

    const titleKey = title.toLowerCase();
    if (seenUrls.has(url) || seenTitles.has(titleKey)) continue;
    seenUrls.add(url);
    seenTitles.add(titleKey);

    const excerptRaw = readTag(block, ["description", "summary", "content:encoded", "content"]);
    items.push({
      title,
      url,
      publishedAt,
      excerpt: excerptRaw ? truncate(stripMarkup(excerptRaw), MAX_EXCERPT_LENGTH) : "",
    });
    if (items.length >= maxItems) break;
  }

  return { feedTitle, items };
}

export function itemMatchesSourceTerms(item: FeedItem, source: MonitorSource): boolean {
  if (!source.requireTerms || source.requireTerms.length === 0) return true;
  const text = `${item.title} ${item.excerpt}`.toLowerCase();
  return source.requireTerms.some((term) => text.includes(term.toLowerCase()));
}
