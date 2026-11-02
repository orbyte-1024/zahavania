import type { z } from "zod";
import type { AiUsage } from "@/lib/ai/client";
import type { suggestInputSchema } from "@/lib/ai/expert-schemas";
import type { anglesInputSchema, AnglesOutput, verifyInputSchema } from "@/lib/ai/schemas";
import type { Domain } from "@/lib/constants/domains";
import type { ExpertSuggestion, SuggestNotice } from "@/lib/experts/suggest";
import type { ScoredVerification } from "@/lib/score";

export type {
  ClaimStatus,
  Language,
  Source,
  SourceKind,
} from "@/lib/ai/schemas";
export type { ScoreCode, ScoreItem, ScoredClaim, ScoredVerification } from "@/lib/score";
export type { ContributionType } from "@/lib/ai/expert-schemas";
export type { Domain } from "@/lib/constants/domains";
export type { Region } from "@/lib/constants/regions";
export type { ExpertSuggestion, SuggestNotice, SuggestNoticeCode } from "@/lib/experts/suggest";

export type ApiErrorBody<Code extends string = string> = {
  ok: false;
  error: { code: Code; message: string; fields?: string[] };
};

type CommonErrorCode =
  | "rate_limited"
  | "daily_quota_exceeded"
  | "auth_unavailable"
  | "unauthorized"
  | "invalid_body"
  | "invalid_input"
  | "ai_timeout"
  | "ai_unavailable"
  | "internal_error";

export type VerifyTextRequest = z.input<typeof verifyInputSchema>;

export type VerifyTextSuccess = {
  ok: true;
  mock: boolean;
  result: ScoredVerification;
  meta: { analyzedUrl: string | null; droppedSources: number; durationMs: number };
};

export type VerifyTextErrorCode = CommonErrorCode | "url_not_allowed" | "url_unreachable" | "url_no_content";

export type VerifyTextResponse = VerifyTextSuccess | ApiErrorBody<VerifyTextErrorCode>;

export type SuggestExpertsRequest = z.input<typeof suggestInputSchema>;

export type SuggestExpertsSuccess = {
  ok: true;
  mock: boolean;
  suggestions: ExpertSuggestion[];
  detectedDomains: Domain[];
  missingProfiles: string[];
  regionBroadened: boolean;
  notice?: SuggestNotice;
};

export type SuggestExpertsErrorCode = CommonErrorCode | "directory_unavailable";

export type SuggestExpertsResponse = SuggestExpertsSuccess | ApiErrorBody<SuggestExpertsErrorCode>;

export type EditorialAnglesRequest = z.input<typeof anglesInputSchema>;

export type EditorialAnglesSuccess = AnglesOutput & {
  ok: true;
  mock: boolean;
  verificationId: string | null;
  usage: AiUsage | null;
  attempts: number;
};

export type LegacyErrorBody = { ok: false; erreur: string };

export type EditorialAnglesResponse = EditorialAnglesSuccess | LegacyErrorBody;

export type PingAiResponse = { ok: true; mock: boolean; reponse: string } | LegacyErrorBody;
