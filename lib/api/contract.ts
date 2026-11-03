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
  meta: {
    analyzedUrl: string | null;
    droppedSources: number;
    durationMs: number;
    cached: boolean;
    replayed: boolean;
    recordedAt: string | null;
  };
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
  meta: { durationMs: number; cached: boolean; replayed: boolean; recordedAt: string | null };
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

export type TranslateRequest = { sourceLang: "mg" | "fr" | "en"; targetLang: "mg" | "fr" | "en"; text: string };

export type TranslateSuccess = {
  ok: true;
  mock: boolean;
  translatedText: string;
  sourceLang: "mg" | "fr" | "en";
  targetLang: "mg" | "fr" | "en";
  needsReview: boolean;
};

export type TranslateErrorCode = CommonErrorCode;

export type TranslateResponse = TranslateSuccess | ApiErrorBody<TranslateErrorCode>;

export type ImageMetadataSummary = {
  available: boolean;
  dateTaken: string | null;
  creationDate: string | null;
  camera: string | null;
  software: string | null;
  hasGPS: boolean;
};

export type VisionObservation = { text: string; confidence: "low" | "medium" | "high" };

export type VisionAnalysis = {
  description: VisionObservation;
  visualInconsistencies: VisionObservation[];
  possibleAIGenerationIndicators: VisionObservation[];
  locationClues: VisionObservation[];
  limitations: VisionObservation;
};

export type ImageEvidence = { provenance: "metadata" | "visualAnalysis" | "externalSource"; content: string; confidence: "low" | "medium" | "high" };

export type VerifyImageSuccess = {
  ok: true;
  mock: boolean;
  file: { format: string; size: number };
  metadata: ImageMetadataSummary;
  metadataSource: "file" | "device" | "none";
  warnings: { code: string; message: string }[];
  reverseSearch: { googleLens: { name: string; url: string }; tineye: { name: string; url: string } };
  analysis: VisionAnalysis | null;
  verification: {
    status: "indices concordants" | "indices contradictoires" | "non concluant";
    summary: string;
    supportingEvidence: ImageEvidence[];
    contradictoryEvidence: ImageEvidence[];
    limitations: string[];
  };
  meta: { durationMs: number };
};

export type VerifyImageErrorCode =
  | CommonErrorCode
  | "image_missing"
  | "image_too_large"
  | "unsupported_media"
  | "invalid_image";

export type VerifyImageResponse = VerifyImageSuccess | ApiErrorBody<VerifyImageErrorCode>;

export type VideoObservation = VisionObservation & { timestamps: number[] };

export type VideoFrameReport = { timestamp: number; status: "analysed" | "failed"; analysis: VisionAnalysis | null };

export type VerifyVideoSuccess = {
  ok: true;
  mock: boolean;
  video: { duration: number; framesReceived: number; totalBytes: number };
  frames: VideoFrameReport[];
  analysedCount: number;
  failedCount: number;
  observations: {
    visualInconsistencies: VideoObservation[];
    possibleAIGenerationIndicators: VideoObservation[];
    locationClues: VideoObservation[];
  };
  warnings: { code: string; message: string }[];
  reverseSearch: VerifyImageSuccess["reverseSearch"];
  verification: VerifyImageSuccess["verification"];
  meta: { durationMs: number };
};

export type VerifyVideoErrorCode = CommonErrorCode | "frames_missing" | "frames_too_large" | "unsupported_media" | "invalid_image";

export type VerifyVideoResponse = VerifyVideoSuccess | ApiErrorBody<VerifyVideoErrorCode>;

export type PingAiResponse = { ok: true; mock: boolean; reponse: string } | LegacyErrorBody;
