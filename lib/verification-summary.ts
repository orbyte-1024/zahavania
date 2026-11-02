import type { ImageMetadata, MetadataWarning } from "./exif";
import type {
  VisionResult,
  VisionObservation,
  VisionAnalysisResult,
} from "./vision-analyzer";
import type { ReverseSearch } from "./reverse-search";

// ===========================================================================
// Types de statut et de rapport de vérification
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
// Warnings compatibles avec les deux sources
// ===========================================================================

export type VisionWarning = {
  code: "ANALYSE_IA_NON_DISPONIBLE";
  message: string;
};

// ===========================================================================
// Principe décisionnel (règles mission §2-§3)
// ===========================================================================
//
// - Les statuts "indices concordants" / "indices contradictoires" exigent des
//   preuves suffisantes issues de sources suffisamment indépendantes.
//
// - Avec les fonctionnalités actuelles (EXIF, analyse IA, liens de recherche
//   inversée sans résultats réels), il n'existe aucune source externe indé-
//   pendante ayant réellement corroboré l'image. Le statut "indices concordants"
//   reste donc inaccessible.
//
// - Une observation issue du même modèle IA ne constitue pas plusieurs sources
//   indépendantes de corroboration.
//
// - Une contradiction ne peut être déclarée que si des preuves solides (non
//   uniquement une observation IA incertaine) révèlent une incohérence substan-
//   tielle. Une anomalie visuelle signalée uniquement par l'IA ne suffit pas.
//
// - En l'absence de preuves suffisantes, le statut par défaut est "non concluant".
//
// - L'absence d'EXIF, une IA indisponible, ou des indices incertains mènent au
//   statut par défaut : l'absence n'est pas une preuve de falsification.
//
// - Une erreur technique ne doit jamais être interprétée comme un indice de
//   falsification.
// ===========================================================================

// ---------------------------------------------------------------------------
// Construction des preuves à partir des données disponibles.
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

/**
 * Combinaison de confiance :
 *   - "high"  → "high"
 *   - "medium" → "medium" (sauf s'il y a un high)
 *   - "low"   → "low"   (sauf s'il y a un medium ou high)
 *
 * Utilisé pour exprimer la confiance globale d'un ensemble d'observations
 * provenant de la même source (ex. toutes issues de l'analyse IA).
 */
function combinedConfidence(
  items: Array<{ confidence: "low" | "medium" | "high" }>,
): "low" | "medium" | "high" {
  if (items.some((i) => i.confidence === "high")) return "high";
  if (items.some((i) => i.confidence === "medium")) return "medium";
  return "low";
}

// ---------------------------------------------------------------------------
// Construction du rapport de vérification.
// ---------------------------------------------------------------------------

export function buildVerification(
  metadata: ImageMetadata | null,
  exifWarnings: MetadataWarning[],
  visualAnalysis: VisionResult | null,
  visionWarnings: VisionWarning[],
  reverseSearchLinks: ReverseSearch,
): VerificationReport {
  const supportingEvidence: EvidenceItem[] = [];
  const contradictoryEvidence: EvidenceItem[] = [];
  const limitations: string[] = [];

  // On recueille les observations IA (si disponibles).
  const visualObservations: Array<{ text: string; confidence: "low" | "medium" | "high" }> =
    visualAnalysis === null
      ? []
      : observationsFromVision(visualAnalysis);

  // ---------------------------------------------------------------------------
  // Preuves de soutien (éléments pertinents, mais pas preuve de vérité)
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
    // La présence de GPS est un élément, mais n'infirmme ni ne prouve quoi que ce soit
    // concernant l'authenticité de l'image.
    if (metadata.hasGPS) {
      supportingEvidence.push({
        provenance: "metadata",
        content:
          "Des coordonnées GPS sont présentes dans les métadonnées. Leur présence ne prouve pas que la photo a été prise à l'endroit indiqué.",
        confidence: "low",
      });
    }
  }

  // Observations IA utiles (description cohérente, localisation, absence d'anomalie
  // majeure) sont conservées comme éléments, jamais comme preuve de vérité.
  if (visualAnalysis !== null) {
    // Description générale : on la garde comme élément de contexte.
    if (visualAnalysis.description.text) {
      supportingEvidence.push({
        provenance: "visualAnalysis",
        content: `Analyse visuelle (IA) — description : ${visualAnalysis.description.text}`,
        confidence: visualAnalysis.description.confidence,
      });
    }

    // Indices de lieu : éléments contextuels, jamais preuve d'un lieu réel.
    for (const obs of visualAnalysis.locationClues) {
      if (obs.text) {
        supportingEvidence.push({
          provenance: "visualAnalysis",
          content: `Analyse visuelle (IA) — indice de lieu : ${obs.text}`,
          confidence: obs.confidence,
        });
      }
    }

    // Absence d'anomalie majeure : un élément à noter, jamais preuve d'authenticité.
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
  // Preuves contradictoires
  // ---------------------------------------------------------------------------

  // Une contradiction ne peut être déclarée que si des preuves solides (non
  // uniquement une observation IA incertaine) révèlent une incohérence substan-
  // tielle. En l'absence de telles preuves, aucune contradiction n'est déclarée.
  //
  // Les observations IA de génération artificielle (possibleAIGenerationIndicators)
  // sont des indices, pas des preuves de fausseté — même à confiance "high".
  //
  // Règle : une anomalie visuelle signalée uniquement par l'IA ne suffit pas.
  // ---------------------------------------------------------------------------

  // Pour l'instant, sans source externe indépendante validée, on ne peut produire
  // aucune preuve contradictoire solide : on reste en "non concluant".
  //
  // (Si plus tard une source externe valide révèle une contradiction, elle sera
  // intégrée via un appel externe ; ce n'est pas le cas aujourd'hui.)

  // ---------------------------------------------------------------------------
  // Limitations
  // ---------------------------------------------------------------------------

  // Limitations liées à l'IA
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

    // Si l'IA n'a relevé que des indices incertains, on le signale.
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

    // Si l'IA n'a relevé aucun indice significatif, on le note.
    if (
      visualObservations.length === 0 &&
      visualAnalysis.visualInconsistencies.length === 0 &&
      visualAnalysis.possibleAIGenerationIndicators.length === 0
    ) {
      limitations.push("L'analyse visuelle n'a relevé aucun indice significatif.");
    }
  }

  // Limitation liée aux métadonnées EXIF
  if (metadata === null || !metadata.available) {
    limitations.push(
      "Aucune métadonnée EXIF exploitable n'a été trouvée. Certaines plateformes, notamment WhatsApp et Facebook, peuvent supprimer les métadonnées lors du partage des images. Leur absence ne constitue pas un indice de falsification.",
    );
  }

  // Limitation générale : absence de source externe indépendante validée.
  if (reverseSearchLinks.googleLens && reverseSearchLinks.tineye) {
    limitations.push(
      "Aucune source externe indépendante n'a encore été consultée pour corroborer ou infirmer l'image. Les liens de recherche inversée sont fournis comme outils que le journaliste peut consulter lui-même, mais aucun résultat n'est associé à l'image à ce stade.",
    );
  }

  // Limitation des liens de recherche inversée
  if (reverseSearchLinks.googleLens && reverseSearchLinks.tineye) {
    limitations.push(
      "Les liens Google Lens et TinEye sont fournis comme outils que le journaliste peut consulter lui-même. Ils ne constituent pas des résultats de recherche et n'ont pas été utilisés pour établir le statut.",
    );
  }

  // Limitation concernant les observations provenant du même modèle IA
  if (visualAnalysis !== null && visualObservations.length > 0) {
    limitations.push(
      "Plusieurs observations peuvent provenir du même modèle d'intelligence artificielle. Elles ne constituent pas plusieurs sources indépendantes de corroboration.",
    );
  }


  // ---------------------------------------------------------------------------
  // Statut
  // ---------------------------------------------------------------------------

  // Règle : avec les fonctionnalités actuelles, il n'existe aucune source exter-
  // ne indépendante ayant réellement corroboré l'image.
  //
  // Par conséquent, le statut "indices concordants" reste inaccessible.
  //
  // Règle : une contradiction ne peut être déclarée que si des preuves solides
  // révèlent une incohérence substantielle. Sans telle preuve, on ne peut pas
  // déclarer "indices contradictoires".
  //
  // Statut par défaut : "non concluant".
  // ---------------------------------------------------------------------------

  const status: VerificationStatus = "non concluant";

  // ---------------------------------------------------------------------------
  // Synthèse
  // ---------------------------------------------------------------------------

  const summary = buildSummary(metadata, visualAnalysis, status, limitations);

  // ---------------------------------------------------------------------------
  // Rapport final
  // ---------------------------------------------------------------------------

  const warnings: Array<MetadataWarning | VisionWarning> = [
    ...exifWarnings,
    ...visionWarnings,
  ];

  return {
    status,
    summary,
    supportingEvidence,
    contradictoryEvidence,
    limitations,
    metadata,
    visualAnalysis,
    reverseSearchLinks,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Construction de la synthèse textuelle.
// ---------------------------------------------------------------------------

function buildSummary(
  metadata: ImageMetadata | null,
  visualAnalysis: VisionResult | null,
  status: VerificationStatus,
  limitations: string[],
): string {
  const parts: string[] = [];

  parts.push(
    status === "non concluant"
      ? "Les informations disponibles ne permettent pas de conclure sur l'authenticité de l'image."
      : status === "indices concordants"
        ? "Plusieurs éléments indépendants corroborent les informations examinées."
        : "Des éléments solides révèlent une contradiction.",
  );

  if (metadata !== null && metadata.available) {
    if (metadata.dateTaken !== null) {
      parts.push(
        `La date de prise de vue déclarée dans les métadonnées est ${metadata.dateTaken}.`,
      );
    }
    if (metadata.camera !== null) {
      parts.push(`L'appareil photographique déclaré est ${metadata.camera}.`);
    }
    if (metadata.software !== null) {
      parts.push(`Un logiciel de traitement (${metadata.software}) a été détecté dans les métadonnées.`);
    }
    if (metadata.hasGPS) {
      parts.push(
        `Des coordonnées GPS sont présentes dans les métadonnées, mais leur présence ne prouve pas que la photo a été prise à l'endroit indiqué.`,
      );
    }
  }

  if (visualAnalysis !== null) {
    if (visualAnalysis.description.text) {
      parts.push(
        `L'analyse visuelle décrit l'image comme ${visualAnalysis.description.text.toLowerCase()}.`,
      );
    }
    if (visualAnalysis.locationClues.length > 0) {
      const clues = visualAnalysis.locationClues
        .map((o) => o.text)
        .join(" ; ");
      parts.push(`Des indices de lieu ont été relevés : ${clues.toLowerCase()}.`);
    }
    if (visualAnalysis.visualInconsistencies.length > 0) {
      const anomalies = visualAnalysis.visualInconsistencies
        .map((o) => o.text)
        .join(" ; ");
      parts.push(`Des incohérences visuelles ont été relevées : ${anomalies.toLowerCase()}.`);
    }
    if (visualAnalysis.possibleAIGenerationIndicators.length > 0) {
      const indicators = visualAnalysis.possibleAIGenerationIndicators
        .map((o) => o.text)
        .join(" ; ");
      parts.push(
        `Des indices de génération artificielle ont été relevés : ${indicators.toLowerCase()}. Ces indices ne prouvent pas à eux seuls que l'image est fausse.`,
      );
    }
  }

  if (limitations.length > 0) {
    parts.push(
      "Des limites empêchent de conclure définitivement : " +
        limitations.slice(0, 2).join(" ; ") +
        (limitations.length > 2 ? " ; et d'autres limites." : "."),
    );
  }

  return parts.join(" ");
}
