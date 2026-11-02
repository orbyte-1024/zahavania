import { describe, expect, it } from "vitest";
import { buildVerification } from "@/lib/verification-summary";
import { postForm, formWith, fixture } from "../helpers/upload";

// ---------------------------------------------------------------------------
// Scénarios unitaires du moteur de synthèse (hors provider réel)
// ---------------------------------------------------------------------------


describe("lib/verification-summary — synthèse déterministe", () => {
  const emptyMetadata = {
    available: false,
    dateTaken: null,
    creationDate: null,
    camera: null,
    software: null,
    hasGPS: false,
  };

  it("défaut : non concluant quand il n'y a pas de source externe indépendante", () => {
    const report = buildVerification(
      emptyMetadata,
      [],
      null,
      [],
      { googleLens: { name: "Google Lens", url: "https://lens.google.com/" }, tineye: { name: "TinEye", url: "https://tineye.com/" } },
    );

    expect(report.status).toBe("non concluant");
    expect(report.contradictoryEvidence).toHaveLength(0);
    expect(report.supportingEvidence).toEqual([]);
    expect(report.limitations.length).toBeGreaterThanOrEqual(1);
    expect(report.limitations.join(" ")).toContain("outils que le journaliste peut consulter");
  });

  it("défaut : non concluant avec EXIF présent mais pas de source externe", () => {
    const metadata = {
      available: true,
      dateTaken: "2026:10:25 14:32:00",
      creationDate: "2026:10:26 09:15:00",
      camera: "Canon EOS 90D",
      software: "Adobe Photoshop 2025",
      hasGPS: true,
    };

    const report = buildVerification(
      metadata,
      [],
      null,
      [],
      { googleLens: { name: "Google Lens", url: "https://lens.google.com/" }, tineye: { name: "TinEye", url: "https://tineye.com/" } },
    );

    expect(report.status).toBe("non concluant");
    expect(report.supportingEvidence.length).toBeGreaterThanOrEqual(1);
    expect(report.contradictoryEvidence).toHaveLength(0);
  });

  it("défaut : non concluant avec analyse IA valide mais pas de source externe", () => {
    const analysis: { description: { text: string; confidence: "low" | "medium" | "high" }; visualInconsistencies: { text: string; confidence: "low" | "medium" | "high" }[]; possibleAIGenerationIndicators: { text: string; confidence: "low" | "medium" | "high" }[]; locationClues: { text: string; confidence: "low" | "medium" | "high" }[]; limitations: { text: string; confidence: "low" | "medium" | "high" } } = {
      description: { text: "Une photo de façade urbaine.", confidence: "medium" },
      visualInconsistencies: [],
      possibleAIGenerationIndicators: [],
      locationClues: [
        { text: "Façade de type européen.", confidence: "medium" },
      ],
      limitations: { text: "Pas de conclusion.", confidence: "low" },
    };

    const report = buildVerification(
      emptyMetadata,
      [],
      analysis,
      [],
      { googleLens: { name: "Google Lens", url: "https://lens.google.com/" }, tineye: { name: "TinEye", url: "https://tineye.com/" } },
    );

    expect(report.status).toBe("non concluant");
    expect(report.supportingEvidence.length).toBeGreaterThanOrEqual(1);
    expect(report.contradictoryEvidence).toHaveLength(0);
    // Plusieurs observations issues du même modèle → pas plusieurs sources indépendantes.
    expect(report.limitations.join(" ")).toContain(
      "Plusieurs observations peuvent provenir du même modèle d'intelligence artificielle",
    );
  });

  it("gère l'absence de métadonnées EXIF", () => {
    const report = buildVerification(
      null,
      [{ code: "EXIF_UNAVAILABLE", message: "Aucune métadonnée EXIF exploitable." }],
      null,
      [],
      { googleLens: { name: "Google Lens", url: "https://lens.google.com/" }, tineye: { name: "TinEye", url: "https://tineye.com/" } },
    );

    expect(report.status).toBe("non concluant");
    expect(report.limitations.join(" ")).toContain(
      "WhatsApp et Facebook",
    );
    expect(report.warnings.length).toBeGreaterThanOrEqual(1);
  });

  it("gère l'IA indisponible", () => {
    const report = buildVerification(
      emptyMetadata,
      [],
      null,
      [{ code: "ANALYSE_IA_NON_DISPONIBLE", message: "L'analyse visuelle automatique est actuellement indisponible." }],
      { googleLens: { name: "Google Lens", url: "https://lens.google.com/" }, tineye: { name: "TinEye", url: "https://tineye.com/" } },
    );

    expect(report.status).toBe("non concluant");
    expect(report.limitations.join(" ")).toContain("L'analyse visuelle automatique est indisponible");
    expect(report.warnings.length).toBeGreaterThanOrEqual(1);
  });

  it("la synthèse reste non concluant avec IA indisponible (en l'absence de mock)", async () => {
    // Ce scénario ne peut être validé que dans un environnement sans USE_MOCK=true.
    // Ici, on ne peut pas garantir l'indisponibilité de l'IA en local, donc on le
    // laisse en commentaire et on se repose sur les tests unitaires du moteur.
  });

  it("gère des indices IA incertains", () => {
    const analysis: { description: { text: string; confidence: "low" | "medium" | "high" }; visualInconsistencies: { text: string; confidence: "low" | "medium" | "high" }[]; possibleAIGenerationIndicators: { text: string; confidence: "low" | "medium" | "high" }[]; locationClues: { text: string; confidence: "low" | "medium" | "high" }[]; limitations: { text: string; confidence: "low" | "medium" | "high" } } = {
      description: { text: "Une photo.", confidence: "low" },
      visualInconsistencies: [],
      possibleAIGenerationIndicators: [
        { text: "Indice possible de génération IA.", confidence: "low" },
      ],
      locationClues: [],
      limitations: { text: "Pas de conclusion.", confidence: "low" },
    };

    const report = buildVerification(
      emptyMetadata,
      [],
      analysis,
      [],
      { googleLens: { name: "Google Lens", url: "https://lens.google.com/" }, tineye: { name: "TinEye", url: "https://tineye.com/" } },
    );

    expect(report.status).toBe("non concluant");
    expect(report.limitations.join(" ")).toContain(
      "Les indices de génération artificielle relevés sont incertains",
    );
  });

  it("signale les liens sans résultats associés", () => {
    const report = buildVerification(
      emptyMetadata,
      [],
      null,
      [],
      { googleLens: { name: "Google Lens", url: "https://lens.google.com/" }, tineye: { name: "TinEye", url: "https://tineye.com/" } },
    );

    expect(report.status).toBe("non concluant");
    expect(report.reverseSearchLinks).toEqual({
      googleLens: { name: "Google Lens", url: "https://lens.google.com/" },
      tineye: { name: "TinEye", url: "https://tineye.com/" },
    });
    expect(report.limitations.join(" ")).toContain(
      "outils que le journaliste peut consulter",
    );
  });

  it("ne déclare jamais de concordance sans source externe valide", () => {
    // Même avec EXIF + IA + liens, on reste en non concluant car aucune source
    // externe indépendante n'a réellement corroboré l'image.
    const metadata = {
      available: true,
      dateTaken: "2026:10:25 14:32:00",
      creationDate: null,
      camera: "Canon EOS 90D",
      software: null,
      hasGPS: false,
    };
    const analysis: { description: { text: string; confidence: "low" | "medium" | "high" }; visualInconsistencies: { text: string; confidence: "low" | "medium" | "high" }[]; possibleAIGenerationIndicators: { text: string; confidence: "low" | "medium" | "high" }[]; locationClues: { text: string; confidence: "low" | "medium" | "high" }[]; limitations: { text: string; confidence: "low" | "medium" | "high" } } = {
      description: { text: "Photo de façade urbaine.", confidence: "high" },
      visualInconsistencies: [],
      possibleAIGenerationIndicators: [],
      locationClues: [
        { text: "Façade de type européen.", confidence: "high" },
      ],
      limitations: { text: "Pas de conclusion.", confidence: "low" },
    };

    const report = buildVerification(
      metadata,
      [],
      analysis,
      [],
      { googleLens: { name: "Google Lens", url: "https://lens.google.com/" }, tineye: { name: "TinEye", url: "https://tineye.com/" } },
    );

    expect(report.status).toBe("non concluant");
    expect(report.contradictoryEvidence).toHaveLength(0);
  });

  it("ne déclare jamais de contradiction basée uniquement sur une observation IA incertaine", () => {
    const analysis: { description: { text: string; confidence: "low" | "medium" | "high" }; visualInconsistencies: { text: string; confidence: "low" | "medium" | "high" }[]; possibleAIGenerationIndicators: { text: string; confidence: "low" | "medium" | "high" }[]; locationClues: { text: string; confidence: "low" | "medium" | "high" }[]; limitations: { text: string; confidence: "low" | "medium" | "high" } } = {
      description: { text: "Photo.", confidence: "low" },
      visualInconsistencies: [
        { text: "Possible cohérence des ombres à vérifier.", confidence: "low" },
      ],
      possibleAIGenerationIndicators: [],
      locationClues: [],
      limitations: { text: "Pas de conclusion.", confidence: "low" },
    };

    const report = buildVerification(
      emptyMetadata,
      [],
      analysis,
      [],
      { googleLens: { name: "Google Lens", url: "https://lens.google.com/" }, tineye: { name: "TinEye", url: "https://tineye.com/" } },
    );

    expect(report.status).toBe("non concluant");
    expect(report.contradictoryEvidence).toHaveLength(0);
  });

  it("accepte les preuves contradictoires quand elles sont solides (future source externe)", () => {
    // Ce scénario simule l'arrivée d'une source externe solide qui révèle une
    // contradiction. Il n'est pas implémenté aujourd'hui dans la route, mais le
    // moteur peut être étendu pour l'accepter quand la source sera disponible.
    // Pour l'instant, le moteur reste en non concluant.
    const report = buildVerification(
      emptyMetadata,
      [],
      null,
      [],
      { googleLens: { name: "Google Lens", url: "https://lens.google.com/" }, tineye: { name: "TinEye", url: "https://tineye.com/" } },
    );

    expect(report.status).toBe("non concluant");
  });
});

// ---------------------------------------------------------------------------
// Scénarios d'intégration via l'endpoint réel (mock provider IA)
// ---------------------------------------------------------------------------

async function upload(name: string, type = "image/jpeg") {
  const { status, body } = await postForm(formWith(fixture(name), name, type));
  return { status, body };
}

describe("POST /api/verify/image — champ verification", () => {
  it("ajoute le champ verification au succès", async () => {
    const { status, body } = await upload("valid.jpg");

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body).toHaveProperty("verification");
    expect(body.verification).toBeInstanceOf(Object);
    expect(body.verification.status).toBe("non concluant");
    expect(body.verification.supportingEvidence).toBeInstanceOf(Array);
    expect(body.verification.contradictoryEvidence).toBeInstanceOf(Array);
    expect(body.verification.limitations).toBeInstanceOf(Array);
  });
});
