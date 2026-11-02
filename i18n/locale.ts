export const LOCALE_COOKIE = "NEXT_LOCALE";

export const LOCALES = ["mg", "fr", "en"] as const;

export type AppLocale = (typeof LOCALES)[number];

export function localeCookie(locale: AppLocale): string {
  return `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}

export function storeLocale(locale: AppLocale) {
  document.cookie = localeCookie(locale);
}
