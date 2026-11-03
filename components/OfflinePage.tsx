"use client";

import { useTranslations } from "next-intl";
import "@/components/credits.css";

export function OfflinePage() {
  const t = useTranslations("offline");
  return (
    <main className="credits">
      <header className="credits-head">
        <p className="mono ash">{t("kicker")}</p>
        <h1 className="credits-title">{t("title")}</h1>
        <p className="credits-lead">{t("lead")}</p>
        <p className="credits-lead">{t("files")}</p>
      </header>
      <button type="button" className="offline-retry mono" onClick={() => window.location.reload()}>
        {t("retry")}
      </button>
    </main>
  );
}
