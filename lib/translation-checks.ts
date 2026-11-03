import type { Language } from "@/lib/ai/schemas";

export const TRANSLATE_CHUNK_CHARS = 1_800;
const MIN_WORDS_TO_JUDGE = 4;

const STOPWORDS: Record<Language, ReadonlySet<string>> = {
  mg: new Set([
    "ny", "sy", "dia", "ary", "fa", "tsy", "izay", "ho", "no", "ireo", "izy", "azy", "koa", "noho", "mba", "avy", "hoe", "efa",
    "ka", "eto", "teo", "amin'ny", "tamin'ny", "an'ny", "ao", "any", "izao", "ireny", "rehetra", "mbola", "nefa", "satria", "raha",
  ]),
  fr: new Set([
    "le", "la", "les", "de", "des", "du", "et", "est", "un", "une", "en", "que", "qui", "dans", "pour", "pas", "sur", "au", "aux",
    "avec", "il", "elle", "ce", "cette", "sont", "par", "ont", "été", "mais", "ou", "leur", "plus", "selon", "d'un", "d'une",
  ]),
  en: new Set([
    "the", "and", "of", "to", "is", "in", "that", "it", "for", "was", "on", "are", "with", "as", "by", "this", "be", "at", "from",
    "have", "has", "not", "were", "which", "their", "will", "been", "its", "an", "or", "but", "said",
  ]),
};

const LANGUAGES = Object.keys(STOPWORDS) as Language[];

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .match(/[\p{L}']+/gu)?.map((token) => token.replace(/^'+|'+$/g, "")).filter(Boolean) ?? [];
}

export function languageScores(text: string): Record<Language, number> {
  const scores: Record<Language, number> = { mg: 0, fr: 0, en: 0 };
  for (const token of tokenize(text)) {
    for (const lang of LANGUAGES) if (STOPWORDS[lang].has(token)) scores[lang] += 1;
  }
  return scores;
}

export function detectLanguage(text: string): Language | null {
  const scores = languageScores(text);
  const ranked = [...LANGUAGES].sort((a, b) => scores[b] - scores[a]);
  const [best, second] = ranked;
  if (!best || !second) return null;
  if (scores[best] < 2 || scores[best] === scores[second]) return null;
  return best;
}

function normalized(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function isUnchangedTranslation(output: string, input: string): boolean {
  if (tokenize(input).length < MIN_WORDS_TO_JUDGE) return false;
  return normalized(output) === normalized(input);
}

export function looksLikeLanguage(text: string, target: Language): boolean {
  if (tokenize(text).length < MIN_WORDS_TO_JUDGE) return true;
  const detected = detectLanguage(text);
  return detected === null || detected === target;
}

export function acceptTranslation(output: string, input: string, target: Language): boolean {
  return !isUnchangedTranslation(output, input) && looksLikeLanguage(output, target);
}

export function needsReview(source: Language, target: Language): boolean {
  return source === "mg" || target === "mg";
}

function splitLongParagraph(paragraph: string, maxChars: number): string[] {
  const sentences = paragraph.match(/[^.!?]+(?:[.!?]+|$)\s*/g) ?? [paragraph];
  const parts: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current && current.length + sentence.length > maxChars) {
      parts.push(current.trim());
      current = "";
    }
    if (sentence.length > maxChars) {
      for (let i = 0; i < sentence.length; i += maxChars) parts.push(sentence.slice(i, i + maxChars).trim());
      continue;
    }
    current += sentence;
  }
  if (current.trim()) parts.push(current.trim());
  return parts.filter(Boolean);
}

export function splitIntoChunks(text: string, maxChars = TRANSLATE_CHUNK_CHARS): string[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .flatMap((paragraph) => (paragraph.length > maxChars ? splitLongParagraph(paragraph, maxChars) : [paragraph]));
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (current && candidate.length > maxChars) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
