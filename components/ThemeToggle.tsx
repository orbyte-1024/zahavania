"use client";

import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import { chooseTheme, currentTheme, subscribeTheme, type Theme } from "@/lib/theme";

const serverTheme = (): Theme => "dark";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const t = useTranslations("nav.theme");
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, serverTheme);
  const next: Theme = theme === "light" ? "dark" : "light";

  return (
    <button
      type="button"
      className={`theme-toggle mono ${className}`}
      aria-label={t(next === "light" ? "toLight" : "toDark")}
      title={t(next === "light" ? "toLight" : "toDark")}
      onClick={() => chooseTheme(next)}
    >
      <span className="theme-toggle-mark" aria-hidden="true" data-theme-mark={theme} />
      {t(next)}
    </button>
  );
}
