import type { AiDetection, AiSignalLevel } from "./ai-detection";
import type { ImageMetadata, MetadataWarning } from "./exif";
import type { VisionResult, VisionWarning } from "./vision-analyzer";

export type { VisionWarning };
import type { ReverseSearch } from "./reverse-search";

// ===========================================================================
// Verification status and report types
// ===========================================================================

export type VerificationStatus =
  | "indices concordants"
  | "indices contradictoires"
  | "non concluant";

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

// ===========================================================================
// Decision principles (mission §2-§3)
// ===========================================================================
//
// - "indices concordants" / "indices contradictoires" require sufficient
//   evidence from sufficiently independent sources.
//
// - "indicateurs concordants" et "indicateurs contradictoires" demandent des
//   preuves suffisantes issues de sources suffisamment indépendantes.
//
// - With current features (EXIF, IA analysis, reverse-search links without
//   real results), there is no externally independent source that has actually
//   corroborated the image. "indices concordants" therefore stays unreachable.
//
// - Les observations issues du même modèle IA ne constituent pas plusieurs
//   sources indépendantes de corroboration.
//
// - A contradiction can only be declared if solid evidence (not only an
//   uncertain IA observation) reveals a substantial inconsistency. An
//   anomaly noted only by IA is not enough.
//
// - Une contradiction ne peut être déclarée que si des preuves solides (non
//   uniquement une observation IA incertaine) révèlent une incohérence
//   substantielle. Une anomalie visuelle signalée uniquement par l'IA ne
//   suffit pas.
//
// - Without sufficient evidence, the default status is "non concluant".
//
// - En l'absence de preuves suffisantes, le statut par défaut est "non
//   concluant".
//
// - Missing EXIF, unavailable IA, or uncertain hints all lead to the default
//   status: absence is not evidence of falsification.
//
// - L'absence d'EXIF, une IA indisponible ou des indices incertains mènent
//   au statut par défaut : l'absence n'est pas une preuve de falsification.
//
// - A technical error must never be interpreted as an authenticity signal.
//
// - Une erreur technique ne doit jamais être interprétée comme un indice
//   d'authenticité ou de falsification.
// ===========================================================================

// ---------------------------------------------------------------------------
// Evidence construction from available data.
// ---------------------------------------------------------------------------

function observationsFromVision(
  analysis: VisionResult,
): Array<{ text: string; confidence: "low" | "medium" | "high" }> {
  const items: Array<{ text: string; confidence: "low" | "medium" | "high" }> = [];

  if (analysis.description.text) {
    items.push({ text: analysis.description.text, confidence: analysis.description.confidence });
  }
  for (const obs of analysis.visualInconsistencies) {
    if (obs.text) items.push({ text: obs.text, confidence: obs.confidence });
  }
  for (const obs of analysis.possibleAIGenerationIndicators) {
    if (obs.text) items.push({ text: obs.text, confidence: obs.confidence });
  }
  for (const obs of analysis.locationClues) {
    if (obs.text) items.push({ text: obs.text, confidence: obs.confidence });
  }

  return items;
}

// ---------------------------------------------------------------------------
// Build the verification report.
// ---------------------------------------------------------------------------

export function buildVerification(
  metadata: ImageMetadata | null,
  exifWarnings: MetadataWarning[],
  visualAnalysis: VisionResult | null,
  visionWarnings: VisionWarning[],
  reverseSearchLinks: ReverseSearch,
  aiDetection: AiDetection | null = null,
): VerificationReport {
  const supportingEvidence: EvidenceItem[] = [];
  const contradictoryEvidence: EvidenceItem[] = [];
  const limitations: string[] = [];

  // Collect IA observations (if available).
  const visualObservations: Array<{ text: string; confidence: "low" | "medium" | "high" }> =
    visualAnalysis === null
      ? []
      : observationsFromVision(visualAnalysis);

  // ---------------------------------------------------------------------------
  // Supporting evidence (relevant elements, but not proof of truth)
  // ---------------------------------------------------------------------------

  if (metadata !== null) {
    if (metadata.camera !== null) {
      supportingEvidence.push({
        provenance: "metadata",
        content: `Appareil photographique déclaré dans les métadonnées : ${metadata.camera}.`,
        confidence: "medium",
      });
    }
    if (metadata.software !== null) {
      supportingEvidence.push({
        provenance: "metadata",
        content: `Logiciel de traitement détecté dans les métadonnées : ${metadata.software}.`,
        confidence: "medium",
      });
    }
    if (metadata.dateTaken !== null) {
      supportingEvidence.push({
        provenance: "metadata",
        content: `Date de prise de vue déclarée dans les métadonnées : ${metadata.dateTaken}. Une date EXIF ne prouve pas la date réelle de prise de vue.`,
        confidence: "medium",
      });
    }
    if (metadata.creationDate !== null) {
      supportingEvidence.push({
        provenance: "metadata",
        content: `Date de création déclarée dans les métadonnées : ${metadata.creationDate}. Une date EXIF ne prouve pas la date réelle de création.`,
        confidence: "medium",
      });
    }
    // GPS presence is an element but does not confirm or refute authenticity.
    if (metadata.hasGPS) {
      supportingEvidence.push({
        provenance: "metadata",
        content:
          "Des coordonnées GPS sont présentes dans les métadonnées. Leur présence ne prouve pas que la photo a été prise à l'endroit indiqué.",
        confidence: "low",
      });
    }
  }

  if (visualAnalysis !== null) {
    // General description: kept as context, never as proof.
    if (visualAnalysis.description.text) {
      supportingEvidence.push({
        provenance: "visualAnalysis",
        content: `Analyse visuelle (IA) — description : ${visualAnalysis.description.text}`,
        confidence: visualAnalysis.description.confidence,
      });
    }

    // Location clues: contextual elements, never proof of a real location.
    for (const obs of visualAnalysis.locationClues) {
      if (obs.text) {
        supportingEvidence.push({
          provenance: "visualAnalysis",
          content: `Analyse visuelle (IA) — indice de lieu : ${obs.text}`,
          confidence: obs.confidence,
        });
      }
    }

    // No major anomaly noted: worth mentioning, never proof of authenticity.
    if (visualAnalysis.visualInconsistencies.length === 0) {
      supportingEvidence.push({
        provenance: "visualAnalysis",
        content:
          "L'analyse visuelle n'a relevé aucune incohérence majeure. L'absence d'indice ne prouve pas que l'image est authentique.",
        confidence: "low",
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Contradictory evidence
  // ---------------------------------------------------------------------------

  // A contradiction can only be declared if solid evidence (not only an
  // uncertain IA observation) reveals a substantial inconsistency. Without
  // such evidence, no contradiction is declared.
  //
  // IA generation indicators (possibleAIGenerationIndicators) are hints, not
  // proof of falsity — even at "high" confidence.
  //
  // Rule: an anomaly noted only by IA is not enough.
  // ---------------------------------------------------------------------------

  // For now, without a validated external source, no solid contradictory
  // evidence can be produced: the status stays "non concluant".
  //
  // (If later a validated external source reveals a contradiction, it would
  // be integrated via an external call; that is not the case today.)

  // ---------------------------------------------------------------------------
  // Limitations
  // ---------------------------------------------------------------------------

  // IA-related limitations.
  if (visualAnalysis === null) {
    limitations.push(
      "L'analyse visuelle automatique est indisponible. Les indices qui dépendent de cette analyse ne peuvent pas être produits.",
    );
  } else {
    if (visualAnalysis.limitations.text) {
      limitations.push(
        `L'analyse visuelle rend compte de ses propres limites : ${visualAnalysis.limitations.text}`,
      );
    }

    // If IA only raised uncertain hints, say so.
    if (
      visualAnalysis.possibleAIGenerationIndicators.length > 0 &&
      visualAnalysis.possibleAIGenerationIndicators.every(
        (o) => o.confidence === "low" || o.confidence === "medium",
      )
    ) {
      limitations.push(
        "Les indices de génération artificielle relevés sont incertains. Un tel indice ne prouve pas à lui seul que l'image est fausse.",
      );
    }

    // If IA found no meaningful signal, note it.
    if (
      visualObservations.length === 0 &&
      visualAnalysis.visualInconsistencies.length === 0 &&
      visualAnalysis.possibleAIGenerationIndicators.length === 0
    ) {
      limitations.push("L'analyse visuelle n'a relevé aucun indice significatif.");
    }

    // Multiple observations from the same model are not several independent sources.
    limitations.push(
      "Plusieurs observations peuvent provenir du même modèle d'intelligence artificielle ; elles ne forment pas plusieurs sources indépendantes.",
    );
  }

  limitations.push(...detectionLimitations(aiDetection));

  // EXIF-related limitations.
  if (metadata === null || !metadata.available) {
    limitations.push(
      "Aucune métadonnée exploitable n'a été trouvée. Certaines plateformes, notamment WhatsApp et Facebook, peuvent supprimer les métadonnées lors du partage des images.",
    );
  }

  // EXIF and IA observations alone are not independent sources.
  if (metadata !== null && metadata.available && visualAnalysis !== null) {
    limitations.push(
      "Les informations EXIF et les observations de l'analyse visuelle proviennent de la même image et ne constituent pas, à elles seules, plusieurs sources indépendantes de corroboration.",
    );
  }

  // Reverse search links are tools, not results.
  limitations.push(
    "Les liens de recherche inversée sont des outils que le journaliste peut consulter. Leur présence ne constitue pas un résultat de recherche.",
  );

  // ---------------------------------------------------------------------------
  // Status determination
  // ---------------------------------------------------------------------------

  // "indices concordants" needs real corroboration from an independent
  // source. With current features, that never happens, so the status cannot
  // become "indices concordants".
  const status: VerificationStatus = "non concluant";

  // A deterministic summary consistent with the evidence.
  const summary = buildSummary(
    metadata,
    visualAnalysis,
    exifWarnings,
    visionWarnings,
    limitations,
    aiDetection,
  );

  return {
    status,
    summary,
    supportingEvidence,
    contradictoryEvidence,
    limitations,
    metadata,
    visualAnalysis,
    reverseSearchLinks,
    warnings: [...exifWarnings, ...visionWarnings],
  };
}

function buildSummary(
  metadata: ImageMetadata | null,
  visualAnalysis: VisionResult | null,
  exifWarnings: MetadataWarning[],
  visionWarnings: VisionWarning[],
  limitations: string[],
  aiDetection: AiDetection | null,
): string {
  const parts: string[] = [];

  if (exifWarnings.some((w) => w.code === "EXIF_UNREADABLE")) {
    parts.push("Les métadonnées EXIF n'ont pas pu être lues.");
  } else if (metadata === null || !metadata.available) {
    parts.push(
      "Aucune métadonnée EXIF exploitable n'a été trouvée. Leur absence ne prouve pas que l'image est fausse.",
    );
  } else {
    const facts: string[] = [];
    if (metadata.dateTaken) facts.push(`date de prise de vue : ${metadata.dateTaken}`);
    if (metadata.creationDate) facts.push(`date de création : ${metadata.creationDate}`);
    if (metadata.camera) facts.push(`appareil : ${metadata.camera}`);
    if (metadata.software) facts.push(`logiciel : ${metadata.software}`);
    if (metadata.hasGPS) facts.push("coordonnées GPS présentes dans les métadonnées");
    parts.push(`Métadonnées EXIF : ${facts.join(" ; ")}.`);
  }

  if (visionWarnings.some((w) => w.code === "ANALYSE_IA_NON_DISPONIBLE")) {
    parts.push("L'analyse visuelle est indisponible.");
  } else if (visualAnalysis === null) {
    parts.push("Aucune analyse visuelle n'a pu être produite.");
  } else {
    const vd = visualAnalysis.description.text;
    if (vd) parts.push(`Analyse visuelle (IA) : ${vd}`);
    if (visualAnalysis.visualInconsistencies.length > 0) {
      parts.push(
        `Incohérences visuelles possiblement relevées : ${visualAnalysis.visualInconsistencies.map((o) => o.text).join(" ; ")}`,
      );
    }
    if (visualAnalysis.possibleAIGenerationIndicators.length > 0) {
      parts.push(
        `Indices possibles de génération par IA : ${visualAnalysis.possibleAIGenerationIndicators.map((o) => o.text).join(" ; ")}`,
      );
    }
  }

  if (aiDetection?.status === "ok") {
    parts.push(
      `Détecteur de génération par IA (${aiDetection.provider}) : indice ${aiDetection.index}/100, ${LEVEL_LABELS[aiDetection.level]}. Cet indice est indicatif.`,
    );
  }

  if (limitations.length > 0) {
    parts.push(`Limites : ${limitations.join(" ; ")}`);
  }

  parts.push(
    "La vérification reste non concluante : les éléments disponibles ne permettent pas d'affirmer que l'image est authentique ou falsifiée.",
  );

  return parts.join(" ");
}

const LEVEL_LABELS: Record<AiSignalLevel, string> = {
  low: "signal faible",
  uncertain: "signal incertain",
  high: "signal élevé",
};

function detectionLimitations(aiDetection: AiDetection | null): string[] {
  if (aiDetection === null || (aiDetection.status === "unavailable" && aiDetection.reason === "mock")) return [];
  if (aiDetection.status === "unavailable") {
    return ["La détection automatique d'image générée par IA est indisponible : aucun indice de génération n'a pu être calculé."];
  }
  return [
    "L'indice de génération par IA vient d'un détecteur automatique. Ce n'est pas une probabilité : les détecteurs se trompent, surtout sur les images compressées, retouchées, recadrées ou les captures d'écran.",
    "Un indice faible ne prouve pas que l'image est authentique ; un indice élevé ne prouve pas qu'elle a été générée.",
  ];
}
