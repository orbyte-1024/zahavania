import "server-only";
import { z } from "zod";
import type { SearchResultForPrompt } from "@/lib/ai/prompts/search";

const ENDPOINT = "https://ollama.com/api/web_search";
const TIMEOUT_MS = 12_000;
const MAX_QUERY_CHARS = 300;

const responseSchema = z.object({
  results: z.array(z.object({ title: z.string().default(""), url: z.url(), content: z.string().default("") })),
});

export class WebSearchError extends Error {
  readonly status: number | null;

  constructor(detail: string, status: number | null = null) {
    super(detail);
    this.name = "WebSearchError";
    this.status = status;
  }
}

export function searchQueryFrom(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_CHARS);
}

export async function webSearch(apiKey: string, query: string, maxResults: number): Promise<SearchResultForPrompt[]> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: searchQueryFrom(query), max_results: maxResults }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    throw new WebSearchError(error instanceof Error ? error.name : "network");
  }
  if (!res.ok) throw new WebSearchError(`search status ${res.status}`, res.status);
  const parsed = responseSchema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new WebSearchError("invalid search response", res.status);
  return parsed.data.results.filter((result) => /^https?:\/\//i.test(result.url)).slice(0, maxResults);
}
