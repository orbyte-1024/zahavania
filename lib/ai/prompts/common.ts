import type { Language } from "@/lib/ai/schemas";

const LANGUAGE_NAMES: Record<Language, string> = {
  mg: "Malagasy",
  fr: "French",
  en: "English",
};

export function outputLanguageLabel(lang?: Language): string {
  return lang ? LANGUAGE_NAMES[lang] : "the same language as the topic";
}

export function neutralizeDataTags(value: string): string {
  return value.replace(/<\/?\s*(topic|context|candidates)\s*>/gi, "");
}
