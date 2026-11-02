import type { Language } from "@/lib/ai/schemas";
import type { ExpertRanking } from "@/lib/ai/expert-schemas";
import type { Domain } from "@/lib/constants/domains";

const DOMAIN_KEYWORDS: Record<Domain, readonly string[]> = {
  health: ["santé", "sante", "health", "fahasalamana", "hôpital", "hopital", "paludisme", "vaccin", "médecin", "medecin"],
  justice_law: ["justice", "law", "lalàna", "lalana", "tribunal", "corruption", "avocat", "droit"],
  economy_finance: ["économie", "economie", "economy", "toekarena", "budget", "inflation", "finance", "prix", "coût", "cout"],
  education: ["éducation", "education", "fanabeazana", "école", "ecole", "scolaire", "université", "universite"],
  agriculture_food: ["agriculture", "riz", "vary", "food", "sakafo", "semence", "récolte", "recolte", "paysan"],
  environment_climate: ["environnement", "environment", "tontolo", "climat", "climate", "forêt", "foret", "pollution", "déchets", "dechets"],
  infrastructure_transport: ["infrastructure", "transport", "route", "pont", "circulation", "mobilité", "mobilite"],
  energy: ["énergie", "energie", "energy", "électricité", "electricite", "jiro", "solaire"],
  statistics_demography: ["statistique", "statistics", "recensement", "census", "démographie", "demographie", "population"],
  governance_politics: ["gouvernement", "government", "politique", "politics", "ministre", "élection", "election", "fifidianana", "maire"],
  security: ["sécurité", "securite", "security", "police", "armée", "armee", "criminalité", "criminalite"],
  human_rights_gender: ["droits humains", "human rights", "genre", "gender", "femmes", "women", "violence"],
  media_communication: ["média", "media", "journalisme", "journalism", "presse", "radio", "désinformation", "desinformation"],
  technology_digital: ["technologie", "technology", "numérique", "numerique", "digital", "internet", "intelligence artificielle"],
  culture_society: ["culture", "société", "societe", "society", "tradition", "musique", "religion"],
  mining_extractives: ["mine", "mines", "mining", "extraction", "minerai", "nickel", "cobalt"],
  disaster_risk: ["catastrophe", "disaster", "cyclone", "inondation", "flood", "risque", "risk", "séisme", "seisme"],
};

const MOCK_REASONS: Record<Language, string> = {
  mg: "Filaharana fanazavana: mombamomba noforonina, tsy nisy fiantsoana ny AI.",
  fr: "Classement de démonstration : profil fictif de l'annuaire, sans appel au modèle.",
  en: "Demonstration ranking: fictional directory profile, no model call.",
};

export type MockCandidate = {
  ref: string;
  domains: string[];
  lastVerifiedAt: string;
};

export function detectMockDomains(topic: string, context?: string): Domain[] {
  const text = `${topic} ${context ?? ""}`.toLowerCase();
  return (Object.keys(DOMAIN_KEYWORDS) as Domain[]).filter((domain) =>
    DOMAIN_KEYWORDS[domain].some((keyword) => text.includes(keyword)),
  );
}

export function buildMockRanking(
  candidates: readonly MockCandidate[],
  domains: Domain[],
  limit: number,
  lang?: Language,
): ExpertRanking {
  const domainSet = new Set(domains);
  const reason = MOCK_REASONS[lang ?? "fr"];

  const sorted = [...candidates].sort((a, b) => {
    const matchesA = a.domains.filter((domain) => domainSet.has(domain as Domain)).length;
    const matchesB = b.domains.filter((domain) => domainSet.has(domain as Domain)).length;
    if (matchesA !== matchesB) return matchesB - matchesA;
    return b.lastVerifiedAt.localeCompare(a.lastVerifiedAt);
  });

  return {
    suggestions: sorted.slice(0, limit).map((candidate, index) => ({
      ref: candidate.ref,
      relevance: Math.max(1, 95 - index * 10),
      reason,
      contributionType: "explain" as const,
    })),
    missingProfiles: [],
  };
}
