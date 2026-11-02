import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const locale = await requestLocale;
  const resolvedLocale = locale && hasLocale(routing.locales, locale)
    ? locale
    : routing.defaultLocale;

  let messages;
  if (resolvedLocale === "mg") {
    messages = (await import("@/messages/mg.json")).default;
  } else if (resolvedLocale === "fr") {
    messages = (await import("@/messages/fr.json")).default;
  } else {
    messages = (await import("@/messages/en.json")).default;
  }

  return {
    locale: resolvedLocale,
    messages,
  };
});
