import "server-only";
import sharp from "sharp";
import { z } from "zod";
import { AiError, askJson, isMockMode } from "@/lib/ai/client";
import { buildVisionUserText, VISION_SYSTEM_PROMPT } from "@/lib/ai/prompts/vision";
import type { Language } from "@/lib/ai/schemas";
import type { ImageFormat } from "@/lib/image-intake";

export const ConfidenceEnum = z.enum(["low", "medium", "high"]);
export type Confidence = z.infer<typeof ConfidenceEnum>;

export const VisionObservation = z.object({
  text: z.string().min(1),
  confidence: ConfidenceEnum.default("low"),
});
export type VisionObservation = z.infer<typeof VisionObservation>;

const observationList = z.preprocess((value) => (value === null || value === undefined ? [] : value), z.array(VisionObservation));

export const VisionSchema = z.object({
  description: VisionObservation,
  visualInconsistencies: observationList,
  possibleAIGenerationIndicators: observationList,
  locationClues: observationList,
  limitations: VisionObservation,
});
export type VisionResult = z.infer<typeof VisionSchema>;

export type VisionWarning = {
  code: "ANALYSE_IA_NON_DISPONIBLE";
  message: string;
};

export type VisionAnalysisResult = {
  analysis: VisionResult | null;
  warnings: VisionWarning[];
};

export const VISION_MAX_EDGE = 1600;
export const VISION_JPEG_QUALITY = 85;
const VISION_MAX_BYTES = 3 * 1024 * 1024;
const VISION_TIMEOUT_MS = 45_000;

const UNAVAILABLE: Record<Language, string> = {
  mg: "Tsy azo atao vetivety ny fandinihana ho azy ny sary.",
  fr: "L'analyse visuelle automatique est momentanément indisponible.",
  en: "Automatic visual analysis is temporarily unavailable.",
};

export async function prepareForVision(bytes: Uint8Array): Promise<Uint8Array> {
  const output = await sharp(Buffer.from(bytes), { failOn: "error" })
    .rotate()
    .resize({ width: VISION_MAX_EDGE, height: VISION_MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: VISION_JPEG_QUALITY })
    .toBuffer();
  return new Uint8Array(output);
}

export function toDataUrl(bytes: Uint8Array, mime: string): string {
  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}

function logFailure(stage: string, error: unknown) {
  const code = error instanceof AiError ? error.code : error instanceof Error ? error.name : "unknown";
  const providerStatus = error instanceof AiError ? error.providerStatus : null;
  console.error(JSON.stringify({ scope: "vision", stage, code, providerStatus }));
}

function mockAnalysis(): VisionResult {
  return {
    description: { text: "Demonstration analysis: USE_MOCK=true, the model was not called.", confidence: "low" },
    visualInconsistencies: [],
    possibleAIGenerationIndicators: [],
    locationClues: [],
    limitations: { text: "Simulated response: not a real analysis.", confidence: "low" },
  };
}

export async function analyzeImage(bytes: Uint8Array, format: ImageFormat, lang: Language = "fr"): Promise<VisionAnalysisResult> {
  const unavailable = (): VisionAnalysisResult => ({
    analysis: null,
    warnings: [{ code: "ANALYSE_IA_NON_DISPONIBLE", message: UNAVAILABLE[lang] }],
  });

  let prepared: Uint8Array;
  try {
    prepared = await prepareForVision(bytes);
  } catch (error) {
    logFailure(`prepare:${format}`, error);
    return unavailable();
  }
  if (prepared.byteLength > VISION_MAX_BYTES) {
    logFailure("prepare:too_large", new Error("prepared_image_too_large"));
    return unavailable();
  }

  if (isMockMode()) return { analysis: mockAnalysis(), warnings: [] };

  try {
    const { data } = await askJson({
      task: "vision",
      system: VISION_SYSTEM_PROMPT,
      user: [
        { type: "text", text: buildVisionUserText(lang) },
        { type: "image_url", image_url: { url: toDataUrl(prepared, "image/jpeg") } },
      ],
      schema: VisionSchema,
      maxTokens: 1_500,
      timeoutMs: VISION_TIMEOUT_MS,
      outputRetries: 1,
    });
    return { analysis: data, warnings: [] };
  } catch (error) {
    logFailure("model", error);
    return unavailable();
  }
}
