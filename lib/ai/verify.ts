import "server-only";
import { AiError, askJson, isMockMode, type AiUsage } from "@/lib/ai/client";
import {
  emptyVerifyFixture,
  MOCK_EMPTY_MARKER,
  MOCK_ERROR_MARKER,
  verifyFixture,
} from "@/lib/ai/fixtures/verify";
import { buildVerifyUserMessage, VERIFY_SYSTEM_PROMPT } from "@/lib/ai/prompts/verify";
import {
  MAX_CONTENT_LENGTH,
  verifyOutputSchema,
  type Claim,
  type VerifyInput,
  type VerifyOutput,
} from "@/lib/ai/schemas";
import { readIntEnv } from "@/lib/env";
import { scoreVerification, type ScoredVerification } from "@/lib/score";
import { safeFetchText } from "@/lib/security/safe-fetch";
import { extractMainText } from "@/lib/web/extract-text";

const VERIFY_TIMEOUT_MS = 45_000;
const MIN_PAGE_TEXT_LENGTH = 80;

export class VerificationError extends Error {
  readonly code = "empty_page";

  constructor(detail: string) {
    super(detail);
    this.name = "VerificationError";
  }
}

export type VerifyResult = {
  output: ScoredVerification;
  mock: boolean;
  analyzedUrl: string | null;
  droppedSources: number;
  usage: AiUsage | null;
  attempts: number;
};

export function normalizeUrl(raw: string): string | null {
  if (!URL.canParse(raw)) return null;
  const url = new URL(raw);
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("utm_")) url.searchParams.delete(key);
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const path = url.pathname.replace(/\/+$/, "");
  const query = url.searchParams.toString();
  return `${host}${path}${query ? `?${query}` : ""}`;
}

export function keepOnlySearchedSources(
  output: VerifyOutput,
  searchedUrls: string[],
): { output: VerifyOutput; droppedSources: number } {
  const allowed = new Set(searchedUrls.map(normalizeUrl).filter((url): url is string => url !== null));
  let droppedSources = 0;

  const claims = output.claims.map((claim): Claim => {
    const sources = claim.sources.filter((source) => {
      const normalized = normalizeUrl(source.url);
      const kept = normalized !== null && allowed.has(normalized);
      if (!kept) droppedSources += 1;
      return kept;
    });
    if (sources.length > 0) return { ...claim, sources };
    return { ...claim, sources, status: "insufficient" };
  });

  return { output: { ...output, claims }, droppedSources };
}

function mockResult(input: VerifyInput): VerifyResult {
  const lang = input.lang ?? "fr";
  const marker = input.content.trim().toLowerCase();
  if (marker.startsWith(MOCK_ERROR_MARKER)) throw new AiError("provider_error", "mock error scenario");
  const output = marker.startsWith(MOCK_EMPTY_MARKER) ? emptyVerifyFixture(lang) : verifyFixture(lang);

  return {
    output: scoreVerification(output),
    mock: true,
    analyzedUrl: input.type === "url" ? input.content : null,
    droppedSources: 0,
    usage: null,
    attempts: 0,
  };
}

async function loadContent(input: VerifyInput): Promise<{ content: string; analyzedUrl: string | null }> {
  if (input.type === "text") return { content: input.content, analyzedUrl: null };

  const page = await safeFetchText(input.content);
  const { title, text } = extractMainText(page.body, page.contentType, MAX_CONTENT_LENGTH);
  if (text.length < MIN_PAGE_TEXT_LENGTH) {
    throw new VerificationError(`extracted ${text.length} chars from page`);
  }
  const content = title ? `${title}\n\n${text}` : text;
  return { content: content.slice(0, MAX_CONTENT_LENGTH), analyzedUrl: page.finalUrl };
}

export async function verifyContent(input: VerifyInput): Promise<VerifyResult> {
  if (isMockMode()) return mockResult(input);

  const { content, analyzedUrl } = await loadContent(input);
  const { data, citedUrls, usage, attempts } = await askJson({
    task: "verify",
    system: VERIFY_SYSTEM_PROMPT,
    user: buildVerifyUserMessage({ content, lang: input.lang, sourceUrl: analyzedUrl ?? undefined }),
    schema: verifyOutputSchema,
    maxTokens: readIntEnv("AI_MAX_TOKENS", 4_000, 500, 8_000),
    timeoutMs: VERIFY_TIMEOUT_MS,
    outputRetries: 1,
    webSearch: { maxResults: readIntEnv("AI_WEB_MAX_RESULTS", 5, 1, 10), query: content },
  });

  const { output, droppedSources } = keepOnlySearchedSources(data, citedUrls);
  return { output: scoreVerification(output), mock: false, analyzedUrl, droppedSources, usage, attempts };
}
