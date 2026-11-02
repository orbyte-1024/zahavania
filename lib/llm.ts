import OpenAI from "openai";
import type { ZodType } from "zod";

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const TIMEOUT_MS = 25_000;

export const useMock = (): boolean => process.env.USE_MOCK === "true";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) throw new Error("llm_config_missing: LLM_API_KEY");
  client ??= new OpenAI({
    baseURL: process.env.LLM_BASE_URL || DEFAULT_BASE_URL,
    apiKey,
    timeout: TIMEOUT_MS,
    maxRetries: 0,
  });
  return client;
}

function extractJson(raw: string): unknown {
  const text = raw.replace(/```(?:json)?/gi, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("llm_no_json");
  return JSON.parse(text.slice(start, end + 1));
}

type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } };

type AskJsonOptions<T> = {
  system: string;
  user: string | ChatContentPart[];
  schema: ZodType<T>;
  model?: string;
};

export async function askJson<T>({ system, user, schema, model }: AskJsonOptions<T>): Promise<T> {
  const modelId = model || process.env.AI_MODEL;
  if (!modelId) throw new Error("llm_config_missing: AI_MODEL");

  const completion = await getClient().chat.completions.create({
    model: modelId,
    temperature: 0.2,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const parsed = schema.safeParse(extractJson(completion.choices[0]?.message?.content ?? ""));
  if (!parsed.success) throw new Error("llm_invalid_schema");
  return parsed.data;
}
