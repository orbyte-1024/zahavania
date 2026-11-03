import "server-only";
import { z } from "zod";
import { askText, isMockMode, type AiUsage } from "@/lib/ai/client";
import { buildTranslateUserMessage, TRANSLATE_SYSTEM_PROMPT } from "@/lib/ai/prompts/translate";
import { languageSchema, type Language } from "@/lib/ai/schemas";
import { readIntEnv } from "@/lib/env";
import { acceptTranslation, needsReview, splitIntoChunks } from "@/lib/translation-checks";

export const MAX_TRANSLATE_LENGTH = 5_000;

export const translateInputSchema = z
  .object({
    sourceLang: languageSchema,
    targetLang: languageSchema,
    text: z.string().trim().min(1).max(MAX_TRANSLATE_LENGTH),
  })
  .strict()
  .refine((input) => input.sourceLang !== input.targetLang, {
    path: ["targetLang"],
    message: "target language must differ from source language",
  });

export type TranslateInput = z.infer<typeof translateInputSchema>;

export type TranslateResult = {
  translatedText: string;
  sourceLang: Language;
  targetLang: Language;
  needsReview: boolean;
  mock: boolean;
  usage: AiUsage | null;
};

function addUsage(total: AiUsage | null, next: AiUsage | null): AiUsage | null {
  if (!next) return total;
  if (!total) return next;
  return {
    promptTokens: total.promptTokens + next.promptTokens,
    completionTokens: total.completionTokens + next.completionTokens,
    totalTokens: total.totalTokens + next.totalTokens,
  };
}

async function translateChunk(input: TranslateInput, chunk: string) {
  const maxTokens = Math.min(readIntEnv("AI_MAX_TOKENS", 4_000, 500, 8_000), Math.ceil(chunk.length * 1.6) + 400);
  return askText({
    task: "translate",
    system: TRANSLATE_SYSTEM_PROMPT,
    user: buildTranslateUserMessage({ ...input, text: chunk }),
    maxTokens,
    timeoutMs: 30_000,
    outputRetries: 1,
    accept: (output) => acceptTranslation(output, chunk, input.targetLang),
  });
}

export async function translateText(input: TranslateInput): Promise<TranslateResult> {
  const base = { sourceLang: input.sourceLang, targetLang: input.targetLang, needsReview: needsReview(input.sourceLang, input.targetLang) };
  if (isMockMode()) {
    return { ...base, translatedText: `[${input.targetLang}] ${input.text}`, mock: true, usage: null };
  }

  const parts: string[] = [];
  let usage: AiUsage | null = null;
  for (const chunk of splitIntoChunks(input.text)) {
    const result = await translateChunk(input, chunk);
    parts.push(result.text);
    usage = addUsage(usage, result.usage);
  }

  return { ...base, translatedText: parts.join("\n\n"), mock: false, usage };
}
