"use client";

import { AnimatePresence, motion } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { LOCALES, storeLocale, type AppLocale } from "@/i18n/locale";

export function LanguageMenu({ variant = "popover" }: { variant?: "popover" | "list" }) {
  const t = useTranslations();
  const active = useLocale() as AppLocale;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const choose = (locale: AppLocale) => {
    setOpen(false);
    if (locale === active) return;
    storeLocale(locale);
    startTransition(() => router.refresh());
  };

  if (variant === "list") {
    return (
      <div className="lang-list" role="group" aria-label={t("nav.language")} data-pending={pending || undefined}>
        {LOCALES.map((locale) => (
          <button key={locale} type="button" className="lang-list-item" aria-pressed={locale === active} onClick={() => choose(locale)}>
            <span className="mono">{locale}</span>
            <span>{t(`locale.${locale}`)}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="lang-menu" data-pending={pending || undefined}>
      <button
        type="button"
        className="lang-menu-trigger mono"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`${t("nav.language")} : ${t(`locale.${active}`)}`}
        onClick={() => setOpen((value) => !value)}
      >
        {active}
        <motion.span aria-hidden="true" className="lang-menu-caret" animate={{ rotate: open ? 180 : 0 }}>
          ▾
        </motion.span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            id={menuId}
            role="menu"
            className="lang-menu-list"
            initial={{ opacity: 0, y: -6, clipPath: "inset(0 0 100% 0)" }}
            animate={{ opacity: 1, y: 0, clipPath: "inset(0 0 0% 0)" }}
            exit={{ opacity: 0, y: -6, clipPath: "inset(0 0 100% 0)" }}
            transition={{ duration: 0.32, ease: [0.19, 1, 0.22, 1] }}
          >
            {LOCALES.map((locale) => (
              <li key={locale} role="none">
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={locale === active}
                  className="lang-menu-item"
                  onClick={() => choose(locale)}
                >
                  <span className="mono">{locale}</span>
                  <span>{t(`locale.${locale}`)}</span>
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
