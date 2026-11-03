import type { Language } from "@/lib/ai/schemas";

export const LANGUAGE_NAMES: Record<Language, string> = {
  mg: "Malagasy",
  fr: "French",
  en: "English",
};

export function outputLanguageLabel(lang?: Language): string {
  return lang ? LANGUAGE_NAMES[lang] : "the same language as the topic";
}

export function neutralizeTags(value: string, tags: readonly string[]): string {
  return value.replace(new RegExp(`<\\/?\\s*(?:${tags.join("|")})\\s*>`, "gi"), "");
}

export function neutralizeDataTags(value: string): string {
  return neutralizeTags(value, ["topic", "context", "candidates"]);
}
