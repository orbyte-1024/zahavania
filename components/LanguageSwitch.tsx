"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LOCALES, storeLocale, type AppLocale } from "@/i18n/locale";

export function LanguageSwitch({ className = "" }: { className?: string }) {
  const t = useTranslations();
  const active = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const choose = (locale: AppLocale) => {
    if (locale === active) return;
    storeLocale(locale);
    startTransition(() => router.refresh());
  };

  return (
    <div className={`lang-switch ${className}`} role="group" aria-label={t("nav.language")} data-pending={pending || undefined}>
      {LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          className="lang-switch-item mono"
          aria-pressed={locale === active}
          title={t(`locale.${locale}`)}
          onClick={() => choose(locale)}
        >
          {locale}
        </button>
      ))}
    </div>
  );
}
