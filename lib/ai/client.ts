import "server-only";
import OpenAI from "openai";
import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import type { ZodType } from "zod";
import { readIntEnv } from "@/lib/env";

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_TIMEOUT_MS = 25_000;
const DEFAULT_MAX_TOKENS = 2_000;
const DEFAULT_OUTPUT_RETRIES = 1;

export type AiErrorCode =
  | "config_missing"
  | "timeout"
  | "rate_limited"
  | "provider_error"
  | "invalid_output";

export class AiError extends Error {
  readonly code: AiErrorCode;

  constructor(code: AiErrorCode, detail: string) {
    super(detail);
    this.name = "AiError";
    this.code = code;
  }
}

export type AiUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type AskJsonResult<T> = {
  data: T;
  citedUrls: string[];
  usage: AiUsage;
  attempts: number;
};

export type AskJsonOptions<T> = {
  system: string;
  user: string;
  schema: ZodType<T>;
  model?: string;
  maxTokens?: number;
  timeoutMs?: number;
  outputRetries?: number;
  webSearch?: { maxResults: number };
};

type OpenRouterParams = ChatCompletionCreateParamsNonStreaming & {
  plugins?: Array<{ id: "web"; max_results: number }>;
  reasoning?: { effort: "low" | "medium" | "high"; exclude: boolean };
};

export const isMockMode = (): boolean => process.env.USE_MOCK === "true" && process.env.NODE_ENV !== "production";

const FALLBACK_CODES: ReadonlySet<AiErrorCode> = new Set(["rate_limited", "provider_error", "invalid_output"]);

let client: OpenAI | null = null;

function getClient(): OpenAI {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) throw new AiError("config_missing", "LLM_API_KEY is not set");
  client ??= new OpenAI({
    baseURL: process.env.LLM_BASE_URL || DEFAULT_BASE_URL,
    apiKey,
    timeout: DEFAULT_TIMEOUT_MS,
    maxRetries: 1,
  });
  return client;
}

function extractJson(raw: string): unknown {
  const text = raw.replace(/```(?:json)?/gi, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new AiError("invalid_output", "no JSON object in response");
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new AiError("invalid_output", "malformed JSON in response");
  }
}

function toAiError(error: unknown): AiError {
  if (error instanceof AiError) return error;
  if (error instanceof OpenAI.APIConnectionTimeoutError) return new AiError("timeout", "provider timeout");
  if (error instanceof OpenAI.RateLimitError) return new AiError("rate_limited", "provider rate limit");
  if (error instanceof OpenAI.APIError) {
    return new AiError("provider_error", `provider status ${error.status ?? "unknown"}: ${error.message}`);
  }
  return new AiError("provider_error", error instanceof Error ? error.message : "unknown error");
}

async function requestOnce<T>(options: AskJsonOptions<T>, modelId: string) {
  const params: OpenRouterParams = {
    model: modelId,
    temperature: 0.2,
    max_tokens: (options.maxTokens ?? DEFAULT_MAX_TOKENS) + readIntEnv("AI_REASONING_TOKENS", 2_000, 0, 8_000),
    reasoning: { effort: "low", exclude: true },
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: options.system },
      { role: "user", content: options.user },
    ],
  };
  if (options.webSearch) {
    params.plugins = [{ id: "web", max_results: options.webSearch.maxResults }];
  }

  const completion = await getClient().chat.completions.create(params, {
    timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  });

  const choice = completion.choices[0];
  const usage: AiUsage = {
    promptTokens: completion.usage?.prompt_tokens ?? 0,
    completionTokens: completion.usage?.completion_tokens ?? 0,
    totalTokens: completion.usage?.total_tokens ?? 0,
  };
  const citedUrls = (choice?.message.annotations ?? [])
    .filter((annotation) => annotation.type === "url_citation")
    .map((annotation) => annotation.url_citation.url);

  if (choice?.finish_reason === "length") {
    return { usage, citedUrls, error: new AiError("invalid_output", "response truncated by max_tokens") };
  }

  try {
    const parsed = options.schema.safeParse(extractJson(choice?.message.content ?? ""));
    if (!parsed.success) {
      const paths = parsed.error.issues.map((issue) => issue.path.join(".") || "(root)").join(", ");
      return { usage, citedUrls, error: new AiError("invalid_output", `schema mismatch at: ${paths}`) };
    }
    return { usage, citedUrls, data: parsed.data };
  } catch (error) {
    return { usage, citedUrls, error: toAiError(error) };
  }
}

async function runModel<T>(options: AskJsonOptions<T>, modelId: string): Promise<AskJsonResult<T>> {
  const maxAttempts = 1 + (options.outputRetries ?? DEFAULT_OUTPUT_RETRIES);
  const totalUsage: AiUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  let lastError = new AiError("invalid_output", "no attempt made");

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let outcome: Awaited<ReturnType<typeof requestOnce<T>>>;
    try {
      outcome = await requestOnce(options, modelId);
    } catch (error) {
      throw toAiError(error);
    }

    totalUsage.promptTokens += outcome.usage.promptTokens;
    totalUsage.completionTokens += outcome.usage.completionTokens;
    totalUsage.totalTokens += outcome.usage.totalTokens;

    if (outcome.data !== undefined) {
      return { data: outcome.data, citedUrls: outcome.citedUrls, usage: totalUsage, attempts: attempt };
    }
    lastError = outcome.error ?? lastError;
  }

  throw lastError;
}

export async function askJson<T>(options: AskJsonOptions<T>): Promise<AskJsonResult<T>> {
  const modelId = options.model || process.env.AI_MODEL;
  if (!modelId) throw new AiError("config_missing", "AI_MODEL is not set");

  try {
    return await runModel(options, modelId);
  } catch (error) {
    const failure = toAiError(error);
    const fallback = process.env.AI_FALLBACK_MODEL;
    if (options.model || !fallback || fallback === modelId || !FALLBACK_CODES.has(failure.code)) throw failure;
    const result = await runModel({ ...options, outputRetries: 0 }, fallback);
    return { ...result, attempts: result.attempts + 1 + (options.outputRetries ?? DEFAULT_OUTPUT_RETRIES) };
  }
}
