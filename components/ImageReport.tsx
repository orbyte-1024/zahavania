import { useTranslations } from "next-intl";
import { Icon } from "./ui/Icon";
import type { Signal } from "@/lib/image/summarize";

export type ImageReportProps = {
  signals: Signal[];
  status: "loading" | "error" | "ready" | "empty";
  ela?: { applicable: boolean; metric?: number; mapBase64?: string };
};

export function ImageReport({ signals, status, ela }: ImageReportProps) {
  const t = useTranslations("imageReport");

  if (status === "loading") {
    return (
      <section className="border-t border-rule pt-6 mt-6" aria-label={t("loading")}>
        <p className="text-sm text-muted">{t("loading")}</p>
      </section>
    );
  }

  if (status === "error") {
    return (
      <section className="border-t border-rule pt-6 mt-6" aria-label={t("error")}>
        <p className="text-sm text-bad">{t("error")}</p>
      </section>
    );
  }

  if (status === "empty") {
    return (
      <section className="border-t border-rule pt-6 mt-6" aria-label={t("empty")}>
        <p className="text-sm text-muted">{t("empty")}</p>
      </section>
    );
  }

  // Bandeau mode démonstration (clair pour le journaliste)
  const isMock = process.env.USE_MOCK === "true";

  return (
    <article className="border-t border-rule pt-6 mt-6">
      {/* Bandeau mode démonstration — visible uniquement en mode mock */}
      {isMock && (
        <div className="bg-warn/10 rounded-sm px-4 py-3 mb-4 border border-warn/30">
          <p className="text-xs font-sans text-warn font-medium leading-relaxed">
            {t("demoBadge")}
          </p>
        </div>
      )}

      {/* Bandeau fixe : absence d'anomalie ne prouve pas l'authenticité */}
      <div className="bg-paper rounded-sm px-4 py-3 mb-6 border border-rule">
        <p className="text-xs font-sans text-ink/80 leading-relaxed">
          {t("banner")}
        </p>
      </div>

      {/* Signaux */}
      <div className="space-y-4">
        {signals.map((s) => (
          <div
            key={s.id}
            className="flex items-start gap-3 text-sm"
            aria-label={`${s.label} — ${s.level}`}
          >
            <span aria-hidden="true" className="mt-0.5 shrink-0">
              <Icon name={levelToIcon(s.level)} size={16} />
            </span>
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <strong className="font-serif text-ink">{s.label}</strong>
                <span className="text-[10px] font-sans uppercase tracking-wide text-muted">
                  {s.level}
                </span>
              </div>
              <p className="text-xs text-ink/70 mt-1">{s.detail}</p>
              <p className="text-[10px] text-muted mt-0.5">{s.limit}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ELA */}
      {ela && (
        <div className="mt-6">
          <h3 className="font-serif text-sm text-ink mb-2">{t("elaTitle")}</h3>
          {ela.applicable ? (
            <div className="rounded-sm overflow-hidden border border-rule bg-paper">
              <img
                src={ela.mapBase64}
                alt={t("elaAlt")}
                className="w-full h-auto"
              />
              <div className="px-3 py-2 bg-muted/30 text-[10px] text-muted border-t border-rule">
                {t("elaMetric")} {ela.metric?.toFixed(1)}%
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted">{t("elaNotApplicable")}</p>
          )}
        </div>
      )}
    </article>
  );
}

function levelToIcon(level: Signal["level"]): string {
  switch (level) {
    case "high":
      return "cross";
    case "medium":
      return "info";
    case "low":
      return "info";
    case "info":
      return "check";
    default:
      return "info";
  }
}
