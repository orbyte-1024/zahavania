import "server-only";
import { z } from "zod";
import { askJson, isMockMode, type AiUsage } from "@/lib/ai/client";
import { buildTranslateUserMessage, TRANSLATE_SYSTEM_PROMPT } from "@/lib/ai/prompts/translate";
import { languageSchema, type Language } from "@/lib/ai/schemas";
import { readIntEnv } from "@/lib/env";

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

const translateOutputSchema = z.object({ translatedText: z.string().trim().min(1) });

export type TranslateInput = z.infer<typeof translateInputSchema>;

export type TranslateResult = {
  translatedText: string;
  sourceLang: Language;
  targetLang: Language;
  needsReview: boolean;
  mock: boolean;
  usage: AiUsage | null;
};

export async function translateText(input: TranslateInput): Promise<TranslateResult> {
  const base = { sourceLang: input.sourceLang, targetLang: input.targetLang, needsReview: input.targetLang === "mg" };
  if (isMockMode()) {
    return { ...base, translatedText: `[${input.targetLang}] ${input.text}`, mock: true, usage: null };
  }

  const maxTokens = Math.min(readIntEnv("AI_MAX_TOKENS", 4_000, 500, 8_000), Math.ceil(input.text.length * 1.6) + 400);
  const { data, usage } = await askJson({
    system: TRANSLATE_SYSTEM_PROMPT,
    user: buildTranslateUserMessage(input),
    schema: translateOutputSchema,
    maxTokens,
    timeoutMs: 30_000,
    outputRetries: 1,
  });

  return { ...base, translatedText: data.translatedText, mock: false, usage };
}
