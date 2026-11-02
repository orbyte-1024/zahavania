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
  confidenceIndex: z.number().min(0).max(100),
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
export type Claim = z.infer<typeof claimSchema>;
export type VerifyOutput = z.infer<typeof verifyOutputSchema>;
