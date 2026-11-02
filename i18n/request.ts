import { cookies } from "next/headers";
import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { LOCALE_COOKIE } from "@/i18n/locale";
import { routing } from "@/i18n/routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  const candidate = requested ?? fromCookie;
  const locale = candidate && hasLocale(routing.locales, candidate) ? candidate : routing.defaultLocale;

  const messages =
    locale === "mg"
      ? (await import("@/messages/mg.json")).default
      : locale === "fr"
        ? (await import("@/messages/fr.json")).default
        : (await import("@/messages/en.json")).default;

  return { locale, messages };
});
