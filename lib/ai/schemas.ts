import { z } from "zod";

export const MAX_CONTENT_LENGTH = 8_000;
export const MAX_URL_LENGTH = 2_048;

export const languageSchema = z.enum(["mg", "fr", "en"]);

export const verifyInputSchema = z
  .object({
    content: z.string().trim().min(1).max(MAX_CONTENT_LENGTH),
    type: z.enum(["text", "url"]),
    lang: languageSchema.optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.type !== "url") return;
    const url = URL.canParse(input.content) ? new URL(input.content) : null;
    if (!url || !["http:", "https:"].includes(url.protocol) || input.content.length > MAX_URL_LENGTH) {
      ctx.addIssue({ code: "custom", path: ["content"], message: "content must be a valid http(s) URL" });
    }
  });

export const sourceSchema = z.object({
  title: z.string().min(1),
  url: z.url({ protocol: /^https?$/ }),
  publisher: z.string(),
  date: z.string().nullable(),
  kind: z.enum(["official", "independent", "other"]),
  stance: z.enum(["supports", "contradicts", "context"]),
});

export const claimStatusSchema = z.enum([
  "confirmed",
  "contradicted",
  "insufficient",
  "needs_verification",
]);

export const claimSchema = z.object({
  text: z.string().min(1),
  status: claimStatusSchema,
  rationale: z.string(),
  sources: z.array(sourceSchema).default([]),
  contradictions: z.array(z.string()).default([]),
  recommendedChecks: z.array(z.string()).default([]),
});

export const verifyOutputSchema = z.object({
  detectedLanguage: z.enum(["mg", "fr", "en", "other"]),
  summary: z.string(),
  claims: z.array(claimSchema),
  limitations: z.array(z.string()).default([]),
});

export type Language = z.infer<typeof languageSchema>;
export type VerifyInput = z.infer<typeof verifyInputSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type SourceKind = Source["kind"];
export type ClaimStatus = z.infer<typeof claimStatusSchema>;
export type Claim = z.infer<typeof claimSchema>;
export type VerifyOutput = z.infer<typeof verifyOutputSchema>;

export const ANGLES_MIN_COUNT = 3;
export const ANGLES_MAX_COUNT = 5;
export const MAX_SUBJECT_LENGTH = 800;
export const MAX_CLAIM_TEXT_LENGTH = 1_000;
export const MAX_VERIFICATION_ID_LENGTH = 128;
export const MAX_ANGLES_CLAIMS = 50;

// Stateless hand-off: the client echoes back only what the angles logic needs
// (text + status), so no server-side storage of verifications is required.
export const angleClaimRefSchema = z.object({
  text: z.string().trim().min(1).max(MAX_CLAIM_TEXT_LENGTH),
  status: claimStatusSchema,
});

export const anglesInputSchema = z
  .object({
    subject: z.string().trim().min(1).max(MAX_SUBJECT_LENGTH).optional(),
    verificationId: z.string().trim().min(1).max(MAX_VERIFICATION_ID_LENGTH).optional(),
    claims: z.array(angleClaimRefSchema).max(MAX_ANGLES_CLAIMS).optional(),
    lang: languageSchema,
  })
  .superRefine((input, ctx) => {
    const claims = input.claims ?? [];
    const hasConfirmed = claims.some((claim) => claim.status === "confirmed");
    if (!input.subject && !hasConfirmed) {
      ctx.addIssue({
        code: "custom",
        path: ["claims"],
        message: "a subject or at least one confirmed claim is required",
      });
    }
  });

export const angleFormatSchema = z.enum(["brief", "investigation", "radio_report"]);

export const angleSchema = z.object({
  title: z.string().min(1),
  premise: z.string().min(1),
  interviewQuestions: z.array(z.string().min(1)).min(1).max(8),
  actorTypes: z.array(z.string().min(1)).min(1).max(8),
  dataToFind: z.array(z.string().min(1)).min(1).max(8),
  format: angleFormatSchema,
  // Traceability: exact texts of the confirmed claims backing this angle,
  // and of the claims the journalist must verify before using it.
  basedOn: z.array(z.string()).default([]),
  toVerifyFirst: z.array(z.string()).default([]),
});

export const anglesOutputSchema = z.object({
  lang: languageSchema,
  angles: z.array(angleSchema).min(ANGLES_MIN_COUNT).max(ANGLES_MAX_COUNT),
  limitations: z.array(z.string()).default([]),
});

export type AngleClaimRef = z.infer<typeof angleClaimRefSchema>;
export type AnglesInput = z.infer<typeof anglesInputSchema>;
export type AngleFormat = z.infer<typeof angleFormatSchema>;
export type Angle = z.infer<typeof angleSchema>;
export type AnglesOutput = z.infer<typeof anglesOutputSchema>;
