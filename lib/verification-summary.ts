import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import mg from "@/messages/mg.json";
import type { Language } from "./ai/schemas";
import type { AiDetection } from "./ai-detection";
import type { ImageMetadata, MetadataWarning } from "./exif";
import type { ReverseSearch } from "./reverse-search";
import type { VisionResult, VisionWarning } from "./vision-analyzer";

export type { VisionWarning };

export type VerificationStatus = "indices concordants" | "indices contradictoires" | "non concluant";

export type EvidenceProvenance = "metadata" | "visualAnalysis" | "externalSource";

export type EvidenceItem = {
  provenance: EvidenceProvenance;
  content: string;
  confidence: "low" | "medium" | "high";
};

export type VerificationReport = {
  status: VerificationStatus;
  summary: string;
  supportingEvidence: EvidenceItem[];
  contradictoryEvidence: EvidenceItem[];
  limitations: string[];
  metadata: ImageMetadata | null;
  visualAnalysis: VisionResult | null;
  reverseSearchLinks: ReverseSearch;
  warnings: Array<MetadataWarning | VisionWarning>;
};

const MESSAGES = { en: en.imageReport, fr: fr.imageReport, mg: mg.imageReport } as const;

type Translate = (key: string, values?: Record<string, string | number>) => string;

function lookup(tree: unknown, key: string): string {
  const value = key.split(".").reduce<unknown>((node, part) => (node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined), tree);
  if (typeof value !== "string") throw new Error(`missing imageReport message: ${key}`);
  return value;
}

function reportTranslator(lang: Language): Translate {
  return (key, values = {}) => lookup(MESSAGES[lang], key).replace(/\{(\w+)\}/g, (match, name: string) => (name in values ? String(values[name]) : match));
}

function metadataEvidence(metadata: ImageMetadata | null, t: Translate): EvidenceItem[] {
  if (metadata === null) return [];
  const items: EvidenceItem[] = [];
  const add = (content: string, confidence: EvidenceItem["confidence"]) => items.push({ provenance: "metadata", content, confidence });
  if (metadata.camera !== null) add(t("evidence.camera", { value: metadata.camera }), "medium");
  if (metadata.software !== null) add(t("evidence.software", { value: metadata.software }), "medium");
  if (metadata.dateTaken !== null) add(t("evidence.dateTaken", { value: metadata.dateTaken }), "medium");
  if (metadata.creationDate !== null) add(t("evidence.creationDate", { value: metadata.creationDate }), "medium");
  if (metadata.hasGPS) add(t("evidence.gps"), "low");
  return items;
}

function visionEvidence(analysis: VisionResult | null, t: Translate): EvidenceItem[] {
  if (analysis === null) return [];
  const items: EvidenceItem[] = [];
  if (analysis.description.text) {
    items.push({ provenance: "visualAnalysis", content: t("evidence.description", { value: analysis.description.text }), confidence: analysis.description.confidence });
  }
  for (const obs of analysis.locationClues) {
    if (obs.text) items.push({ provenance: "visualAnalysis", content: t("evidence.locationClue", { value: obs.text }), confidence: obs.confidence });
  }
  if (analysis.visualInconsistencies.length === 0) {
    items.push({ provenance: "visualAnalysis", content: t("evidence.noInconsistency"), confidence: "low" });
  }
  return items;
}

function hasVisionObservation(analysis: VisionResult): boolean {
  return (
    Boolean(analysis.description.text) ||
    [...analysis.visualInconsistencies, ...analysis.possibleAIGenerationIndicators, ...analysis.locationClues].some((obs) => Boolean(obs.text))
  );
}

function visionLimitations(analysis: VisionResult | null, t: Translate): string[] {
  if (analysis === null) return [t("limits.visionUnavailable")];
  const limits: string[] = [];
  if (analysis.limitations.text) limits.push(t("limits.visionOwn", { value: analysis.limitations.text }));
  const indicators = analysis.possibleAIGenerationIndicators;
  if (indicators.length > 0 && indicators.every((o) => o.confidence === "low" || o.confidence === "medium")) {
    limits.push(t("limits.uncertainAiHints"));
  }
  if (!hasVisionObservation(analysis)) limits.push(t("limits.noSignal"));
  limits.push(t("limits.sameModel"));
  return limits;
}

function detectionLimitations(aiDetection: AiDetection | null, t: Translate): string[] {
  if (aiDetection === null || (aiDetection.status === "unavailable" && aiDetection.reason === "mock")) return [];
  if (aiDetection.status === "unavailable") return [t("limits.detectorUnavailable")];
  return [t("limits.detectorNotProbability"), t("limits.detectorNotProof")];
}

function exifLimitations(metadata: ImageMetadata | null, analysis: VisionResult | null, t: Translate): string[] {
  if (metadata === null || !metadata.available) return [t("limits.noExif")];
  return analysis !== null ? [t("limits.exifAndVision")] : [];
}

function exifSummary(metadata: ImageMetadata | null, exifWarnings: MetadataWarning[], t: Translate): string {
  if (exifWarnings.some((w) => w.code === "EXIF_UNREADABLE")) return t("summary.exifUnreadable");
  if (metadata === null || !metadata.available) return t("summary.noExif");
  const facts: string[] = [];
  if (metadata.dateTaken) facts.push(t("summary.fact.dateTaken", { value: metadata.dateTaken }));
  if (metadata.creationDate) facts.push(t("summary.fact.creationDate", { value: metadata.creationDate }));
  if (metadata.camera) facts.push(t("summary.fact.camera", { value: metadata.camera }));
  if (metadata.software) facts.push(t("summary.fact.software", { value: metadata.software }));
  if (metadata.hasGPS) facts.push(t("summary.fact.gps"));
  return t("summary.exif", { facts: facts.join(" ; ") });
}

function visionSummary(analysis: VisionResult | null, visionWarnings: VisionWarning[], t: Translate): string[] {
  if (visionWarnings.some((w) => w.code === "ANALYSE_IA_NON_DISPONIBLE")) return [t("summary.visionUnavailable")];
  if (analysis === null) return [t("summary.noVision")];
  const parts: string[] = [];
  if (analysis.description.text) parts.push(t("summary.vision", { value: analysis.description.text }));
  if (analysis.visualInconsistencies.length > 0) {
    parts.push(t("summary.inconsistencies", { value: analysis.visualInconsistencies.map((o) => o.text).join(" ; ") }));
  }
  if (analysis.possibleAIGenerationIndicators.length > 0) {
    parts.push(t("summary.aiIndicators", { value: analysis.possibleAIGenerationIndicators.map((o) => o.text).join(" ; ") }));
  }
  return parts;
}

function buildSummary(
  metadata: ImageMetadata | null,
  analysis: VisionResult | null,
  exifWarnings: MetadataWarning[],
  visionWarnings: VisionWarning[],
  limitations: string[],
  aiDetection: AiDetection | null,
  t: Translate,
): string {
  const parts = [exifSummary(metadata, exifWarnings, t), ...visionSummary(analysis, visionWarnings, t)];
  if (aiDetection?.status === "ok") {
    parts.push(t("summary.detector", { provider: aiDetection.provider, index: aiDetection.index, level: t(`summary.level.${aiDetection.level}`) }));
  }
  if (limitations.length > 0) parts.push(t("summary.limits", { value: limitations.join(" ; ") }));
  parts.push(t("summary.conclusion"));
  return parts.join(" ");
}

export function buildVerification(
  metadata: ImageMetadata | null,
  exifWarnings: MetadataWarning[],
  visualAnalysis: VisionResult | null,
  visionWarnings: VisionWarning[],
  reverseSearchLinks: ReverseSearch,
  aiDetection: AiDetection | null = null,
  lang: Language = "fr",
): VerificationReport {
  const t = reportTranslator(lang);
  const limitations = [
    ...visionLimitations(visualAnalysis, t),
    ...detectionLimitations(aiDetection, t),
    ...exifLimitations(metadata, visualAnalysis, t),
    t("limits.reverseLinks"),
  ];

  return {
    status: "non concluant",
    summary: buildSummary(metadata, visualAnalysis, exifWarnings, visionWarnings, limitations, aiDetection, t),
    supportingEvidence: [...metadataEvidence(metadata, t), ...visionEvidence(visualAnalysis, t)],
    contradictoryEvidence: [],
    limitations,
    metadata,
    visualAnalysis,
    reverseSearchLinks,
    warnings: [...exifWarnings, ...visionWarnings],
  };
}
