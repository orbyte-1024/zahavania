import type { MonitorAnalysis, MonitorEventAnalysisOutput } from "@/lib/ai/schemas";
import type { CollectedArticle } from "@/lib/monitor/collect";
import type { MonitorEvent } from "@/lib/monitor/types";

const HOUR = 60 * 60 * 1_000;

type MockSeed = {
  hoursAgo: number;
  source: string;
  title: string;
  excerpt: string;
};

const SEEDS: MockSeed[] = [
  {
    hoursAgo: 2,
    source: "demo-a",
    title: "[Démonstration] Hausse du prix du riz à Antananarivo",
    excerpt: "Le prix du riz local a augmenté sur les marchés d'Antananarivo selon des vendeurs interrogés sur place. Données simulées.",
  },
  {
    hoursAgo: 5,
    source: "demo-b",
    title: "[Démonstration] Le prix du riz augmente à Antananarivo",
    excerpt: "Des commerçants signalent une hausse du prix du riz à Antananarivo. Contenu de démonstration.",
  },
  {
    hoursAgo: 10,
    source: "demo-a",
    title: "[Démonstration] Riz : flambée des prix à Antananarivo",
    excerpt: "La flambée des prix du riz touche les marchés d'Antananarivo. Contenu de démonstration.",
  },
  {
    hoursAgo: 20,
    source: "demo-c",
    title: "[Démonstration] Prix du riz à Antananarivo : les marchés sous tension",
    excerpt: "Les marchés d'Antananarivo restent sous tension autour du prix du riz. Contenu de démonstration.",
  },
  {
    hoursAgo: 1,
    source: "demo-b",
    title: "[Démonstration] Cyclone à Mananjary : un bilan de trois morts",
    excerpt: "La gendarmerie annonce trois morts après le cyclone à Mananjary. Contenu de démonstration.",
  },
  {
    hoursAgo: 4,
    source: "demo-c",
    title: "[Démonstration] Cyclone à Mananjary : un bilan de cinq morts",
    excerpt: "Le maire de Mananjary évoque cinq morts après le cyclone. Contenu de démonstration.",
  },
  {
    hoursAgo: 26,
    source: "demo-d",
    title: "[Démonstration] Cyclone à Mananjary : un bilan qui s'alourdit",
    excerpt: "Le bilan du cyclone à Mananjary reste provisoire. Contenu de démonstration.",
  },
  {
    hoursAgo: 3,
    source: "demo-a",
    title: "[Démonstration] Rentrée scolaire à Fianarantsoa : un programme contesté",
    excerpt: "Des parents contestent le programme de la rentrée scolaire à Fianarantsoa. Contenu de démonstration.",
  },
  {
    hoursAgo: 8,
    source: "demo-a",
    title: "[Démonstration] Rentrée scolaire à Fianarantsoa : les enseignants s'inquiètent",
    excerpt: "Les enseignants de Fianarantsoa s'inquiètent pour la rentrée scolaire. Contenu de démonstration.",
  },
];

export function mockCollectedArticles(now: Date = new Date()): CollectedArticle[] {
  return SEEDS.map((seed) => ({
    title: seed.title,
    url: `https://example.org/demonstration/${encodeURIComponent(seed.title)}`,
    sourceId: seed.source,
    sourceName: `Démonstration ${seed.source.slice(-1).toUpperCase()}`,
    lang: "fr",
    publishedAt: new Date(now.getTime() - seed.hoursAgo * HOUR).toISOString(),
    excerpt: seed.excerpt,
  }));
}

function demoEntry(event: MonitorEvent, summary: string): MonitorEventAnalysisOutput {
  return {
    eventId: event.id,
    summary,
    sharedFacts: [],
    divergences: [],
    limitations: ["Simulated analysis: no model was called (USE_MOCK=true)."],
  };
}

export function mockVersionAnalysis(events: MonitorEvent[]): MonitorAnalysis {
  const entries: MonitorEventAnalysisOutput[] = [];

  for (const event of events) {
    if (event.articleCount < 2) continue;
    const entry = demoEntry(event, "[Démonstration] Synthèse simulée des titres fournis, sans appel au modèle.");
    if (event.title.includes("Cyclone")) {
      const cited = event.articleIds.slice(0, 2);
      if (cited.length === 2) {
        entry.divergences = [
          {
            point: "[Démonstration] Nombre de morts annoncé",
            status: "contradicted",
            positions: [
              { articleId: cited[0], position: "Trois morts selon la gendarmerie." },
              { articleId: cited[1], position: "Cinq morts selon le maire." },
            ],
          },
        ];
        entry.limitations.push("[Démonstration] Le bilan reste provisoire.");
      }
    }
    entries.push(entry);
  }

  return { events: entries };
}
