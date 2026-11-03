const MAX_CALLS = 10;
let calls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  calls += 1;
  if (calls > MAX_CALLS) throw new Error("call budget exhausted");
  return realFetch(url, init);
};
const { translateText } = await import("../lib/ai/translate.ts");
const cases = [
  ["fr", "mg", "Le Président de la République a inauguré le nouveau centre de santé de la commune d'Ambohidratrimo le 12 mars 2025."],
  ["mg", "fr", "Nanambara ny Banky Foiben'i Madagasikara fa nihena 3,2 % ny vidin'ny vary tao amin'ny faritra Analamanga tamin'ny volana jona 2024."],
  ["fr", "mg", "L'Assemblée nationale et le Sénat ont adopté la loi de finances 2025. Selon l'INSTAT, l'inflation atteint 7,5 %."],
  ["en", "mg", "The fokontany chief said 1,200 households in the district of Toamasina II lost access to water after the cyclone."],
  ["mg", "en", "Nilaza ny CENI fa hatao amin'ny 15 novambra 2025 ny fifidianana kaominaly ao amin'ny distrikan'i Antsirabe I."],
];
for (const [sourceLang, targetLang, text] of cases) {
  const before = calls;
  try {
    const r = await translateText({ sourceLang, targetLang, text });
    console.log(JSON.stringify({ case: `${sourceLang}->${targetLang}`, calls: calls - before, needsReview: r.needsReview, input: text, output: r.translatedText }));
  } catch (e) {
    console.log(JSON.stringify({ case: `${sourceLang}->${targetLang}`, calls: calls - before, error: e.code ?? e.name, providerStatus: e.providerStatus ?? null }));
  }
}
console.log("total calls", calls);
