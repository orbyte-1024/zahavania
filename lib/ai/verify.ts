import "server-only";
import { askJson, isMockMode, type AiUsage } from "@/lib/ai/client";
import { buildVerifyUserMessage, VERIFY_SYSTEM_PROMPT } from "@/lib/ai/prompts/verify";
import {
  MAX_CONTENT_LENGTH,
  verifyOutputSchema,
  type Claim,
  type VerifyInput,
  type VerifyOutput,
} from "@/lib/ai/schemas";
import { readIntEnv } from "@/lib/env";
import { safeFetchText } from "@/lib/security/safe-fetch";
import { extractMainText } from "@/lib/web/extract-text";

const VERIFY_TIMEOUT_MS = 45_000;
const MIN_PAGE_TEXT_LENGTH = 80;
export const NO_SOURCE_MAX_CONFIDENCE = 25;

export class VerificationError extends Error {
  readonly code = "empty_page";

  constructor(detail: string) {
    super(detail);
    this.name = "VerificationError";
  }
}

export type VerifyResult = {
  output: VerifyOutput;
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
    return {
      ...claim,
      sources,
      status: "insufficient",
      confidenceIndex: Math.min(claim.confidenceIndex, NO_SOURCE_MAX_CONFIDENCE),
    };
  });

  return { output: { ...output, claims }, droppedSources };
}

function mockResult(input: VerifyInput): VerifyResult {
  return {
    output: {
      detectedLanguage: input.lang ?? "other",
      summary: "Demonstration result: USE_MOCK=true, no model or web search was called.",
      claims: [
        {
          text: input.type === "url" ? input.content : input.content.slice(0, 200),
          status: "insufficient",
          confidenceIndex: 0,
          rationale: "Simulated response for development.",
          sources: [],
          contradictions: [],
          recommendedChecks: ["Disable USE_MOCK to run a real verification."],
        },
      ],
      limitations: ["Simulated response: not a real verification."],
    },
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
    system: VERIFY_SYSTEM_PROMPT,
    user: buildVerifyUserMessage({ content, lang: input.lang, sourceUrl: analyzedUrl ?? undefined }),
    schema: verifyOutputSchema,
    maxTokens: readIntEnv("AI_MAX_TOKENS", 4_000, 500, 8_000),
    timeoutMs: VERIFY_TIMEOUT_MS,
    outputRetries: 1,
    webSearch: { maxResults: readIntEnv("AI_WEB_MAX_RESULTS", 5, 1, 10) },
  });

  const { output, droppedSources } = keepOnlySearchedSources(data, citedUrls);
  return { output, mock: false, analyzedUrl, droppedSources, usage, attempts };
}
