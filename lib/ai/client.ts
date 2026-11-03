import "server-only";
import OpenAI from "openai";
import type { ChatCompletion, ChatCompletionContentPart, ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import type { ZodType } from "zod";
import { resolveFallbacks, resolveModel, type AiTask } from "@/lib/ai/models";
import { isCoolingDown, orderCandidates, recordFailure, recordSuccess } from "@/lib/ai/rotation";
import { readIntEnv } from "@/lib/env";

export type { AiTask } from "@/lib/ai/models";

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_TIMEOUT_MS = 25_000;
const DEFAULT_MAX_TOKENS = 2_000;
const DEFAULT_OUTPUT_RETRIES = 1;
const MIN_ATTEMPT_MS = 3_000;
const MODEL_SHARE_WITH_NEXT = 0.6;
const NEXT_MODEL_RESERVE_MS = MIN_ATTEMPT_MS + 1_000;
const BUDGET_EXHAUSTED = "time budget exhausted";

export type AiErrorCode =
  | "config_missing"
  | "timeout"
  | "rate_limited"
  | "provider_error"
  | "invalid_output";

export class AiError extends Error {
  readonly code: AiErrorCode;
  readonly providerStatus: number | null;

  constructor(code: AiErrorCode, detail: string, providerStatus: number | null = null) {
    super(detail);
    this.name = "AiError";
    this.code = code;
    this.providerStatus = providerStatus;
  }
}

export type AiUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export function addUsage(total: AiUsage | null, next: AiUsage | null): AiUsage | null {
  if (!next) return total;
  if (!total) return next;
  return {
    promptTokens: total.promptTokens + next.promptTokens,
    completionTokens: total.completionTokens + next.completionTokens,
    totalTokens: total.totalTokens + next.totalTokens,
  };
}

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } };

export type UserContent = string | ContentPart[];

type BaseOptions = {
  task: AiTask;
  system: string;
  user: UserContent;
  maxTokens?: number;
  timeoutMs?: number;
  outputRetries?: number;
};

export type AskJsonOptions<T> = BaseOptions & {
  schema: ZodType<T>;
  webSearch?: { maxResults: number };
};

export type AskTextOptions = BaseOptions & {
  accept?: (text: string) => boolean;
};

export type AskJsonResult<T> = {
  data: T;
  citedUrls: string[];
  usage: AiUsage;
  attempts: number;
  model: string;
};

export type AskTextResult = {
  text: string;
  usage: AiUsage;
  attempts: number;
  model: string;
};

export type ChatParams = ChatCompletionCreateParamsNonStreaming & {
  plugins?: Array<{ id: "web"; max_results: number }>;
  reasoning?: { effort: "low" | "medium" | "high"; exclude: boolean };
};

export const isMockMode = (): boolean => process.env.USE_MOCK === "true" && process.env.NODE_ENV !== "production";

const FALLBACK_CODES: ReadonlySet<AiErrorCode> = new Set(["rate_limited", "provider_error", "invalid_output", "timeout"]);

let client: OpenAI | null = null;

function getClient(): OpenAI {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) throw new AiError("config_missing", "LLM_API_KEY is not set");
  client ??= new OpenAI({
    baseURL: process.env.LLM_BASE_URL || DEFAULT_BASE_URL,
    apiKey,
    timeout: DEFAULT_TIMEOUT_MS,
    maxRetries: 0,
  });
  return client;
}

function toUserContent(user: UserContent): string | ChatCompletionContentPart[] {
  if (typeof user === "string") return user;
  return user.map((part) =>
    part.type === "text"
      ? { type: "text", text: part.text }
      : { type: "image_url", image_url: { url: part.image_url.url, detail: part.image_url.detail ?? "auto" } },
  );
}

export function buildChatParams(
  options: BaseOptions & { webSearch?: { maxResults: number } },
  modelId: string,
  mode: "json" | "text",
): ChatParams {
  const params: ChatParams = {
    model: modelId,
    temperature: 0.2,
    max_tokens: (options.maxTokens ?? DEFAULT_MAX_TOKENS) + readIntEnv("AI_REASONING_TOKENS", 2_000, 0, 8_000),
    reasoning: { effort: "low", exclude: true },
    messages: [
      { role: "system", content: options.system },
      { role: "user", content: toUserContent(options.user) },
    ],
  };
  if (mode === "json") params.response_format = { type: "json_object" };
  if (options.webSearch) params.plugins = [{ id: "web", max_results: options.webSearch.maxResults }];
  return params;
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
  if (error instanceof OpenAI.RateLimitError) return new AiError("rate_limited", `provider rate limit: ${error.message}`, 429);
  if (error instanceof OpenAI.APIError) {
    return new AiError("provider_error", `provider status ${error.status ?? "unknown"}: ${error.message}`, error.status ?? null);
  }
  return new AiError("provider_error", error instanceof Error ? error.message : "unknown error");
}

type Completion = {
  content: string;
  truncated: boolean;
  usage: AiUsage;
  citedUrls: string[];
};

async function complete(params: ChatParams, timeoutMs: number): Promise<Completion> {
  let completion: ChatCompletion;
  try {
    completion = await getClient().chat.completions.create(params, { timeout: timeoutMs });
  } catch (error) {
    throw toAiError(error);
  }
  const choice = completion.choices[0];
  return {
    content: choice?.message.content ?? "",
    truncated: choice?.finish_reason === "length",
    usage: {
      promptTokens: completion.usage?.prompt_tokens ?? 0,
      completionTokens: completion.usage?.completion_tokens ?? 0,
      totalTokens: completion.usage?.total_tokens ?? 0,
    },
    citedUrls: (choice?.message.annotations ?? [])
      .filter((annotation) => annotation.type === "url_citation")
      .map((annotation) => annotation.url_citation.url),
  };
}

type Parsed<R> = { value: R } | { error: AiError };

function remainingMs(deadline: number): number {
  const left = deadline - Date.now();
  if (left < MIN_ATTEMPT_MS) throw new AiError("timeout", BUDGET_EXHAUSTED);
  return left;
}

async function runAttempts<R>(
  params: ChatParams,
  options: BaseOptions,
  deadline: number,
  parse: (completion: Completion) => Parsed<R>,
): Promise<{ value: R; usage: AiUsage; attempts: number; citedUrls: string[] }> {
  const maxAttempts = 1 + (options.outputRetries ?? DEFAULT_OUTPUT_RETRIES);
  const usage: AiUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  let lastError = new AiError("invalid_output", "no attempt made");

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const completion = await complete(params, remainingMs(deadline));
    usage.promptTokens += completion.usage.promptTokens;
    usage.completionTokens += completion.usage.completionTokens;
    usage.totalTokens += completion.usage.totalTokens;

    const parsed: Parsed<R> = completion.truncated
      ? { error: new AiError("invalid_output", "response truncated by max_tokens") }
      : parse(completion);
    if ("value" in parsed) return { value: parsed.value, usage, attempts: attempt, citedUrls: completion.citedUrls };
    lastError = parsed.error;
  }

  throw lastError;
}

function logRotation(task: AiTask, model: string, failure: AiError, cooldownMs: number | null) {
  console.warn(
    JSON.stringify({ scope: "ai", event: "model_failed", task, model, code: failure.code, providerStatus: failure.providerStatus, cooldownS: cooldownMs === null ? 0 : cooldownMs / 1000 }),
  );
}

async function withFallback<R extends { attempts: number }>(
  task: AiTask,
  outputRetries: number | undefined,
  deadline: number,
  run: (modelId: string, retries: number | undefined, modelDeadline: number) => Promise<R>,
): Promise<R & { model: string }> {
  const primary = resolveModel(task);
  if (!primary) throw new AiError("config_missing", `no model configured for task ${task}`);

  const candidates = orderCandidates([primary, ...resolveFallbacks(task)]);
  const budget = deadline - Date.now();
  let failedAttempts = 0;
  let lastError: AiError | null = null;

  for (const [index, model] of candidates.entries()) {
    if (index > 0 && isCoolingDown(model)) continue;
    const retries = model === primary ? outputRetries : 0;
    const hasNext = candidates.slice(index + 1).some((next) => !isCoolingDown(next));
    const share = Math.min(Math.ceil(budget * MODEL_SHARE_WITH_NEXT), budget - NEXT_MODEL_RESERVE_MS);
    const modelDeadline = hasNext && share >= MIN_ATTEMPT_MS ? Math.min(deadline, Date.now() + share) : deadline;
    try {
      const result = await run(model, retries, modelDeadline);
      recordSuccess(model);
      return { ...result, attempts: result.attempts + failedAttempts, model };
    } catch (error) {
      const failure = toAiError(error);
      lastError = failure;
      if (!FALLBACK_CODES.has(failure.code)) throw failure;
      const outOfTime = failure.message === BUDGET_EXHAUSTED;
      if (outOfTime && deadline - Date.now() < MIN_ATTEMPT_MS) throw failure;
      const cooldown = outOfTime ? null : recordFailure(model, failure);
      logRotation(task, model, failure, cooldown);
      failedAttempts += 1 + (retries ?? DEFAULT_OUTPUT_RETRIES);
    }
  }

  throw lastError ?? new AiError("provider_error", "no model available");
}

function deadlineFor(options: BaseOptions): number {
  return Date.now() + (options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
}

export async function askJson<T>(options: AskJsonOptions<T>): Promise<AskJsonResult<T>> {
  const parse = (completion: Completion): Parsed<T> => {
    try {
      const parsed = options.schema.safeParse(extractJson(completion.content));
      if (parsed.success) return { value: parsed.data };
      const paths = parsed.error.issues.map((issue) => issue.path.join(".") || "(root)").join(", ");
      return { error: new AiError("invalid_output", `schema mismatch at: ${paths}`) };
    } catch (error) {
      return { error: toAiError(error) };
    }
  };

  const deadline = deadlineFor(options);
  const result = await withFallback(options.task, options.outputRetries, deadline, (modelId, retries, modelDeadline) =>
    runAttempts(buildChatParams(options, modelId, "json"), { ...options, outputRetries: retries }, modelDeadline, parse),
  );
  return { data: result.value, citedUrls: result.citedUrls, usage: result.usage, attempts: result.attempts, model: result.model };
}

export async function askText(options: AskTextOptions): Promise<AskTextResult> {
  const parse = (completion: Completion): Parsed<string> => {
    const text = completion.content.trim();
    if (!text) return { error: new AiError("invalid_output", "empty text response") };
    if (options.accept && !options.accept(text)) return { error: new AiError("invalid_output", "text rejected by output check") };
    return { value: text };
  };

  const deadline = deadlineFor(options);
  const result = await withFallback(options.task, options.outputRetries, deadline, (modelId, retries, modelDeadline) =>
    runAttempts(buildChatParams(options, modelId, "text"), { ...options, outputRetries: retries }, modelDeadline, parse),
  );
  return { text: result.value, usage: result.usage, attempts: result.attempts, model: result.model };
}
