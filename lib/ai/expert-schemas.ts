import { z } from "zod";
import { languageSchema, stringListSchema } from "@/lib/ai/schemas";
import { REGIONS } from "@/lib/constants/regions";

export const MAX_TOPIC_LENGTH = 500;
export const MAX_CONTEXT_LENGTH = 2_000;
export const MAX_SUGGESTION_LIMIT = 10;

const regionSchema = z.enum(REGIONS);

export const suggestInputSchema = z
  .object({
    topic: z.string().trim().min(3).max(MAX_TOPIC_LENGTH),
    context: z.string().trim().max(MAX_CONTEXT_LENGTH).optional(),
    lang: languageSchema.optional(),
    region: regionSchema.optional(),
    languages: z.array(languageSchema).min(1).max(3).optional(),
    limit: z.number().int().min(1).max(MAX_SUGGESTION_LIMIT).default(5),
  })
  .strict();

export const topicClassificationSchema = z.object({
  domains: stringListSchema,
});

export const contributionTypeSchema = z.enum([
  "confirm",
  "explain",
  "contradict",
  "field_testimony",
  "data",
]);

export const rankedSuggestionSchema = z.object({
  ref: z.string().trim().min(1),
  relevance: z.number().min(0).max(100),
  reason: z.string().min(1),
  contributionType: contributionTypeSchema,
});

export const expertRankingSchema = z.object({
  suggestions: z.array(rankedSuggestionSchema).default([]),
  missingProfiles: stringListSchema,
});

export type SuggestInput = z.infer<typeof suggestInputSchema>;
export type TopicClassification = z.infer<typeof topicClassificationSchema>;
export type ContributionType = z.infer<typeof contributionTypeSchema>;
export type RankedSuggestion = z.infer<typeof rankedSuggestionSchema>;
export type ExpertRanking = z.infer<typeof expertRankingSchema>;
export type SuggestRegion = z.infer<typeof regionSchema>;
