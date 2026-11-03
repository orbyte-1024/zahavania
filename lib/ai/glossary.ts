import type { Language } from "@/lib/ai/schemas";

// To be reviewed by a Malagasy speaker of the team before the demo: official institution names and administrative levels.
export const GLOSSARY: ReadonlyArray<Readonly<Record<Language, string>>> = [
  { fr: "Président de la République", mg: "Filohan'ny Repoblika", en: "President of the Republic" },
  { fr: "Assemblée nationale", mg: "Antenimierampirenena", en: "National Assembly" },
  { fr: "Sénat", mg: "Antenimierandoholona", en: "Senate" },
  { fr: "région", mg: "faritra", en: "region" },
  { fr: "district", mg: "distrika", en: "district" },
  { fr: "commune", mg: "kaominina", en: "commune" },
  { fr: "fokontany", mg: "fokontany", en: "fokontany" },
  { fr: "Banque centrale de Madagascar", mg: "Banky Foiben'i Madagasikara", en: "Central Bank of Madagascar" },
];

export function glossaryLines(source: Language, target: Language): string[] {
  return GLOSSARY.map((entry) => `${entry[source]} → ${entry[target]}`);
}
