import type { Language, Source, VerifyOutput } from "@/lib/ai/schemas";

export const MOCK_EMPTY_MARKER = "mock:empty";
export const MOCK_ERROR_MARKER = "mock:error";

type LocalizedClaim = {
  text: string;
  rationale: string;
  contradictions: string[];
  recommendedChecks: string[];
};

type LocalizedFixture = {
  summary: string;
  emptySummary: string;
  claims: [LocalizedClaim, LocalizedClaim, LocalizedClaim];
  limitations: string[];
};

const STATISTICS_OFFICE: Source = {
  title: "Indice des prix à la consommation, troisième trimestre 2026",
  url: "https://statistics-office.example.org/publications/ipc-2026-t3",
  publisher: "National statistics office (demo)",
  date: "2026-10-12",
  kind: "official",
  stance: "supports",
};

const DAILY_NEWSPAPER: Source = {
  title: "Marchés d'Antananarivo : le prix du riz local poursuit sa hausse",
  url: "https://daily-newspaper.example.org/economie/prix-riz-antananarivo",
  publisher: "Daily newspaper (demo)",
  date: "2026-10-20",
  kind: "independent",
  stance: "supports",
};

const FARMERS_FORUM: Source = {
  title: "Message relayé sur un groupe de producteurs",
  url: "https://social-network.example.org/groups/producteurs/posts/1842",
  publisher: "Social media post (demo)",
  date: "2026-10-05",
  kind: "other",
  stance: "context",
};

const PUBLIC_WORKS_MINISTRY: Source = {
  title: "État d'avancement des travaux de la route nationale 7",
  url: "https://public-works.example.org/communiques/rn7-avancement-2026",
  publisher: "Ministry of public works (demo)",
  date: "2026-09-02",
  kind: "official",
  stance: "contradicts",
};

const ROAD_WATCH_NGO: Source = {
  title: "Rapport de suivi des chantiers routiers 2026",
  url: "https://road-watch.example.org/rapports/suivi-chantiers-2026",
  publisher: "Road watch NGO (demo)",
  date: "2026-07-15",
  kind: "independent",
  stance: "contradicts",
};

const SCHOOL_RUMOR: Source = {
  title: "Publication non signée sur une campagne de vaccination",
  url: "https://social-network.example.org/pages/info-sekoly/posts/77",
  publisher: "Social media post (demo)",
  date: "2026-10-28",
  kind: "other",
  stance: "context",
};

const TEXTS: Record<Language, LocalizedFixture> = {
  fr: {
    summary:
      "Données de démonstration. Le texte contient trois affirmations : la hausse du prix du riz est documentée, l'achèvement de la RN7 est contredit par deux sources fiables, et la campagne de vaccination n'est étayée par aucune source vérifiable.",
    emptySummary: "Données de démonstration. Aucune affirmation vérifiable n'a été trouvée dans ce texte.",
    claims: [
      {
        text: "Le prix du riz local a augmenté sur les marchés d'Antananarivo au dernier trimestre.",
        rationale:
          "L'indice officiel des prix et un quotidien indépendant rapportent tous deux une hausse sur la période. Un message de producteurs donne du contexte sans constituer une preuve.",
        contradictions: [],
        recommendedChecks: [
          "Comparer avec les relevés de prix d'un autre marché de la capitale.",
          "Demander à l'office statistique la variation exacte sur le trimestre.",
        ],
      },
      {
        text: "Les travaux de la RN7 ont été entièrement achevés en 2025.",
        rationale:
          "Le ministère des travaux publics et une ONG de suivi indiquent que plusieurs tronçons sont encore en chantier en 2026.",
        contradictions: ["Le communiqué du ministère mentionne des travaux en cours sur deux tronçons."],
        recommendedChecks: ["Contacter la direction régionale des travaux publics pour le calendrier à jour."],
      },
      {
        text: "Une campagne de vaccination touchera toutes les écoles dès la semaine prochaine.",
        rationale:
          "La seule trace trouvée est une publication non signée sur un réseau social. Aucune source officielle ni média reconnu ne l'évoque.",
        contradictions: [],
        recommendedChecks: [
          "Interroger le ministère de la santé ou la direction régionale de la santé.",
          "Vérifier auprès de deux établissements scolaires concernés.",
        ],
      },
    ],
    limitations: [
      "Données de démonstration : ceci n'est pas une vraie vérification.",
      "Les sources affichées sont fictives et pointent vers des adresses d'exemple.",
    ],
  },
  en: {
    summary:
      "Demonstration data. The text contains three claims: the rice price increase is documented, the completion of the RN7 is contradicted by two reliable sources, and the vaccination campaign is not backed by any verifiable source.",
    emptySummary: "Demonstration data. No checkable claim was found in this text.",
    claims: [
      {
        text: "The price of local rice rose in Antananarivo markets over the last quarter.",
        rationale:
          "The official price index and an independent daily both report an increase over the period. A farmers' post adds context but is not evidence.",
        contradictions: [],
        recommendedChecks: [
          "Compare with price surveys from another market in the capital.",
          "Ask the statistics office for the exact change over the quarter.",
        ],
      },
      {
        text: "Work on the RN7 was fully completed in 2025.",
        rationale:
          "The ministry of public works and a monitoring NGO both report that several sections are still under construction in 2026.",
        contradictions: ["The ministry statement mentions ongoing work on two sections."],
        recommendedChecks: ["Contact the regional public works office for the current schedule."],
      },
      {
        text: "A vaccination campaign will reach every school starting next week.",
        rationale:
          "The only trace found is an unsigned social media post. No official source or recognized outlet mentions it.",
        contradictions: [],
        recommendedChecks: [
          "Ask the ministry of health or the regional health office.",
          "Check with two of the schools concerned.",
        ],
      },
    ],
    limitations: [
      "Demonstration data: this is not a real verification.",
      "The sources shown are fictional and point to example addresses.",
    ],
  },
  mg: {
    summary:
      "Angona fanehoana. Misy filazana telo ao amin'ilay lahatsoratra: voaporofo ny fiakaran'ny vidin'ny vary, loharano azo itokisana roa no manohitra ny filazana fa vita ny RN7, ary tsy misy loharano azo hamarinina momba ny fanaovana vaksiny.",
    emptySummary: "Angona fanehoana. Tsy nisy filazana azo hamarinina hita tao amin'ity lahatsoratra ity.",
    claims: [
      {
        text: "Niakatra ny vidin'ny vary gasy teny amin'ny tsenan'Antananarivo tao anatin'ny telovolana farany.",
        rationale:
          "Samy milaza fiakarana ny tondro ofisialin'ny vidim-piainana sy gazety tsy miankina iray. Manome toe-javatra ny hafatry ny mpamokatra fa tsy porofo.",
        contradictions: [],
        recommendedChecks: [
          "Ampitahao amin'ny vidiny tamin'ny tsena hafa ao an-drenivohitra.",
          "Anontanio ny biraon'ny antontan'isa ny fiovana marina tao anatin'ny telovolana.",
        ],
      },
      {
        text: "Vita tanteraka tamin'ny taona 2025 ny asa tamin'ny RN7.",
        rationale:
          "Samy milaza ny minisiteran'ny asa vaventy sy fikambanana mpanara-maso iray fa mbola misy faritra an-dalam-panamboarana amin'ny 2026.",
        contradictions: ["Milaza asa mbola mitohy amin'ny faritra roa ny fanambarana avy amin'ny minisitera."],
        recommendedChecks: ["Antsoy ny foibem-paritry ny asa vaventy hahalalana ny fandaharam-potoana vaovao."],
      },
      {
        text: "Hisy fanaovana vaksiny hahatratra ny sekoly rehetra manomboka amin'ny herinandro ho avy.",
        rationale:
          "Hafatra tsy misy sonia tao amin'ny tambajotra sosialy ihany no hita. Tsy misy loharano ofisialy na haino aman-jery fantatra miresaka izany.",
        contradictions: [],
        recommendedChecks: [
          "Anontanio ny minisiteran'ny fahasalamana na ny foibem-paritra misahana ny fahasalamana.",
          "Hamarino amin'ny sekoly roa voakasik'izany.",
        ],
      },
    ],
    limitations: [
      "Angona fanehoana: tsy fanamarinana tena izy ity.",
      "Noforonina ireo loharano aseho ary manondro adiresy ohatra.",
    ],
  },
};

export function verifyFixture(lang: Language): VerifyOutput {
  const text = TEXTS[lang];
  const [rice, road, vaccine] = text.claims;
  return {
    detectedLanguage: lang,
    summary: text.summary,
    claims: [
      { ...rice, status: "confirmed", sources: [STATISTICS_OFFICE, DAILY_NEWSPAPER, FARMERS_FORUM] },
      { ...road, status: "contradicted", sources: [PUBLIC_WORKS_MINISTRY, ROAD_WATCH_NGO] },
      { ...vaccine, status: "insufficient", sources: [SCHOOL_RUMOR] },
    ],
    limitations: text.limitations,
  };
}

export function emptyVerifyFixture(lang: Language): VerifyOutput {
  const text = TEXTS[lang];
  return {
    detectedLanguage: lang,
    summary: text.emptySummary,
    claims: [],
    limitations: text.limitations,
  };
}
