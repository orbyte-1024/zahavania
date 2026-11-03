import type { MonitorTheme } from "@/lib/monitor/types";

export const MONITOR_THEMES = [
  "politics",
  "economy",
  "agriculture",
  "health",
  "education",
  "environment",
  "security_justice",
  "infrastructure",
  "energy_mining",
  "society",
  "sport",
  "general",
] as const;

export type MonitorThemeId = (typeof MONITOR_THEMES)[number];

export function isMonitorTheme(value: string): value is MonitorThemeId {
  return (MONITOR_THEMES as readonly string[]).includes(value);
}

const THEME_KEYWORDS: Readonly<Record<Exclude<MonitorTheme, "general">, readonly string[]>> = {
  politics: [
    "politique", "politika", "gouvernement", "governemanta", "fanjakana", "president",
    "presidential", "fifidianana", "election", "elections", "minister", "ministre", "ministry",
    "assemblee", "antenimiera", "senat", "senatera", "ceni", "constitution", "referendum",
    "lalam panorenana", "parti", "maires", "maire", "commune", "kaominina", "depute",
    "deputes", "gouverneur", "prefecture", "cabinet", "premier ministre", "prima minisitra",
  ],
  economy: [
    "economie", "toekarena", "ariary", "inflation", "budget", "prix", "vidiny",
    "marche", "tsena", "banque", "banky", "entreprise", "orinasa", "commerce", "varotra",
    "export", "import", "fiscale", "fiscal", "impot", "croissance", "fitomboana", "salaire",
    "karama", "chomage", "trosa", "dette", "investissement", "fampiasam-bola",
  ],
  agriculture: [
    "riz", "vary", "vanille", "lavanila", "girofle", "jirofo", "letchi", "cafe", "kafe",
    "agriculture", "tantsaha", "agriculteur", "recolte", "vokatra", "peche", "fanjonoana",
    "elevage", "fiompiana", "engrais", "semence", "zana-bary", "plantation", "sorghum",
    "mais", "katsaka", "tubercule", "ovy", "manioc", "mangahazo", "exportateur",
  ],
  health: [
    "sante", "fahasalamana", "hopital", "mpitsabo", "medecin", "docteur", "infirmier",
    "cholera", "peste", "paludisme", "tazomoka", "vaccination", "vaksiny",
    "medicament", "fanafody", "epidemie", "aretina", "malnutrition", "nutrition",
    "mortalite", "maternite", "clinique", "pharmacie",
  ],
  education: [
    "education", "fanabeazana", "ecole", "sekoly", "universite", "oniversite", "etudiant",
    "mpianatra", "enseignant", "mpampianatra", "baccalaureat", "bac", "examen", "programme",
    "scolaire", "rentree", "classe", "diplome", "formation", "alphabetisation",
  ],
  environment: [
    "environnement", "tontolo iainana", "cyclone", "rivodoza", "inondation", "tondra-drano",
    "secheresse", "haintany", "foret", "ala", "deforestation", "biodiversite", "lemurien",
    "varika", "climat", "toetrandro", "pollution", "dechets", "fako", "katastrofa",
    "catastrophe", "erosion", "lac", "farihy", "riviere", "renirano", "ocean",
  ],
  security_justice: [
    "securite", "fiarovana", "police", "polisy", "gendarmerie", "zandary", "justice",
    "fitsarana", "tribunal", "prison", "fitoriana", "crime", "heloka", "meurtre", "vol",
    "cambriolage", "corruption", "kolikoly", "trafic", "drogue", "dahalo", "banditisme",
    "arrestation", "trial", "verdict", "condamnation",
  ],
  infrastructure: [
    "route", "lalambe", "pont", "tetezana", "port", "seranan-tsambo", "aeroport",
    "seranam-piaramanidina", "transport", "train", "lalamby", "eau potable", "rano",
    "electricite", "jiro", "barrage", "travaux", "chantier", "construction", "infrastructure",
    "piste", "bitume", "embouteillage",
  ],
  energy_mining: [
    "energie", "angovo", "petrole", "solika", "essence", "carburant", "gasoil", "mine",
    "harena", "nickel", "cobalt", "ilmenite", "graphite", "or", "volamena", "jirama",
    "electricite", "centrale", "solaire", "eolien", "hydroelectricite", "extraction",
    "minerai", "qmm", "ambatovy",
  ],
  society: [
    "societe", "fiaraha-monina", "population", "mponina", "femmes", "vehivavy", "enfants",
    "ankizy", "jeunesse", "tanora", "migration", "fifindra-monina", "religion",
    "fivavahana", "culture", "kolontsaina", "tradition", "fomba", "famille", "fianakaviana",
    "logement", "trano", "pauvrete", "fahantrana", "droits", "zon-draha",
  ],
  sport: [
    "sport", "fanatanjahantena", "football", "baolina", "rugby", "basketball", "athletisme",
    "olympique", "jeux", "match", "championnat", "coupe", "equipe nationale", "barea",
    "tennis", "cyclisme", "boxe",
  ],
};

const THEME_ORDER = Object.keys(THEME_KEYWORDS) as Exclude<MonitorTheme, "general">[];

export function foldText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’'`]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsTerm(foldedText: string, term: string): boolean {
  const padded = ` ${foldedText} `;
  const needle = foldText(term);
  return padded.includes(` ${needle} `) || padded.includes(` ${needle}s `);
}

export function classifyThemes(title: string, excerpt: string): MonitorTheme[] {
  const text = foldText(`${title} ${excerpt}`);
  const scores: { theme: Exclude<MonitorTheme, "general">; hits: number }[] = [];

  for (const theme of THEME_ORDER) {
    const hits = THEME_KEYWORDS[theme].filter((keyword) => containsTerm(text, keyword)).length;
    if (hits > 0) scores.push({ theme, hits });
  }

  if (scores.length === 0) return ["general"];
  scores.sort((a, b) => b.hits - a.hits || THEME_ORDER.indexOf(a.theme) - THEME_ORDER.indexOf(b.theme));
  return scores.slice(0, 3).map((entry) => entry.theme);
}

export function describeTheme(theme: MonitorTheme): string {
  return theme;
}

const STOPWORDS = new Set(
  [
    "les", "des", "une", "aux", "avec", "pour", "dans", "sur", "par", "pas", "plus", "sont",
    "est", "que", "qui", "quoi", "dont", "leur", "leurs", "notre", "votre", "cette", "ces",
    "son", "ses", "nos", "vos", "ils", "elles", "nous", "vous", "mais", "ou", "et", "en",
    "au", "du", "de", "la", "le", "un", "a", "apres", "avant", "entre", "chez", "selon",
    "tres", "tout", "tous", "toute", "toutes", "aussi", "encore", "deja", "comme", "alors",
    "the", "and", "for", "with", "from", "this", "that", "these", "those", "has", "have",
    "was", "were", "will", "its", "his", "her", "not", "are", "but", "into", "over", "under",
    "after", "before", "about", "more", "than", "new", "says", "said", "amid", "against",
    "ny", "sy", "no", "dia", "ireo", "ity", "io", "izay", "amin", "aminy", "ho", "ao", "any",
    "ary", "fa", "ka", "tsy", "efa", "dia", "momba", "n'ny", "tamin", "tamin'ny", "ny",
    "vaovao", "olona", "olona", "isan", "isany", "rehetra", "ankehitriny", "andro",
  ].map((word) => foldText(word)),
);

export function titleTokens(title: string): string[] {
  const tokens = foldText(title)
    .split(" ")
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token) && !/^\d{1,2}$/.test(token));
  return [...new Set(tokens)];
}

export function tokenSet(text: string): Set<string> {
  return new Set(titleTokens(text));
}

const RECURRING_COLUMN_PATTERN = /\b(necrologie|necrologies|horoscope|meteo|programme tv|annonces legales|resultats de la loterie)\b/;

export function isRecurringColumn(title: string): boolean {
  return RECURRING_COLUMN_PATTERN.test(foldText(title));
}

export function overlapCoefficient(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / Math.min(left.size, right.size);
}

export function sharedTokenCount(left: Set<string>, right: Set<string>): number {
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared;
}
