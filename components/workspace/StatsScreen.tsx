"use client";

import { motion } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import type { Language } from "@/lib/api/contract";
import type { Indicator } from "@/lib/stats";
import { upcomingAgenda } from "@/lib/stats";
import { AGENDA, STATS } from "@/lib/stats-data";
import { Badge, ScreenHeader, rise, stagger } from "@/components/workspace/ui";

function numberLocale(locale: string): string {
  return locale === "mg" ? "fr-FR" : locale === "fr" ? "fr-FR" : "en-GB";
}

function formatNumber(value: number, indicator: Indicator, locale: string): string {
  const formatter = new Intl.NumberFormat(numberLocale(locale), {
    maximumFractionDigits: indicator.decimals,
    minimumFractionDigits: indicator.unit === "%" ? indicator.decimals : 0,
  });
  return formatter.format(value);
}

function TrendChart({ indicator, label }: { indicator: Indicator; label: string }) {
  const t = useTranslations("stats");
  const locale = useLocale();
  const points = indicator.series;
  if (points.length < 2) return null;
  const width = 220;
  const height = 64;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * (width - 8) + 4;
    const y = height - 6 - ((p.value - min) / span) * (height - 14);
    return [x, y] as const;
  });
  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${coords[coords.length - 1][0].toFixed(1)},${height} L${coords[0][0].toFixed(1)},${height} Z`;
  const format = (value: number) => formatNumber(value, indicator, locale);
  const first = points[0];
  const last = points[points.length - 1];

  return (
    <figure className="trend">
      <div className="trend-plot">
        <span className="trend-max mono ash">{format(max)}</span>
        <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
          <path d={area} className="sparkline-area" />
          <motion.path d={line} className="sparkline-line" initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.4, ease: [0.19, 1, 0.22, 1] }} />
          {coords.map(([x, y], i) => (
            <circle key={points[i].year} cx={x} cy={y} r={i === coords.length - 1 ? 3 : 2} className={i === coords.length - 1 ? "sparkline-end" : "sparkline-point"}>
              <title>{`${points[i].year} · ${format(points[i].value)}`}</title>
            </circle>
          ))}
        </svg>
        <span className="trend-min mono ash">{format(min)}</span>
      </div>
      <figcaption className="trend-axis mono ash">
        <span>{first.year}</span>
        <span>{last.year}</span>
      </figcaption>
      <table className="sr-only">
        <caption>{t("chartCaption", { label, from: first.year, to: last.year })}</caption>
        <thead>
          <tr>
            <th scope="col">{t("year")}</th>
            <th scope="col">{t("value")}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.year}>
              <td>{point.year}</td>
              <td>{format(point.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function IndicatorCard({ indicator }: { indicator: Indicator }) {
  const t = useTranslations("stats");
  const locale = useLocale();
  const label = indicator.label[locale as Language] ?? indicator.label.fr;
  const unit = indicator.unit === "people" ? "" : indicator.unit === "USD" ? " $" : " %";

  return (
    <motion.article className="indicator" variants={rise}>
      <header className="indicator-head">
        <h3 className="indicator-label">{label}</h3>
        {indicator.stale && <Badge tone="warn">{t("stale", { year: indicator.period })}</Badge>}
      </header>
      <p className="indicator-value">
        {formatNumber(indicator.value, indicator, locale)}
        <span className="indicator-unit">{unit}</span>
      </p>
      <p className="mono ash">{t("period", { year: indicator.period })}</p>
      <TrendChart indicator={indicator} label={label} />
      <footer className="indicator-foot mono">
        <a href={indicator.source.url} target="_blank" rel="noopener noreferrer">
          {indicator.source.publisher} ↗
        </a>
        <span className="ash">{t("updated", { date: new Date(indicator.updatedAt).toLocaleDateString(locale) })}</span>
      </footer>
    </motion.article>
  );
}

const noSubscription = () => () => {};
const todayOnClient = () => new Date().toISOString().slice(0, 10);
const noDateOnServer = (): string | null => null;

export function StatsScreen() {
  const t = useTranslations("stats");
  const tm = useTranslations("modules.stats");
  const locale = useLocale();
  const today = useSyncExternalStore(noSubscription, todayOnClient, noDateOnServer);
  const upcoming = today ? upcomingAgenda(AGENDA.items, today) : AGENDA.items;

  return (
    <div className="screen-grid">
      <ScreenHeader need={`${tm("need")} · ${tm("state")}`} title={t("title")} lead={t("lead")}>
        <p className="mono ash">{t("retrieved", { date: new Date(STATS.retrievedAt).toLocaleDateString(locale) })}</p>
      </ScreenHeader>

      <motion.section className="indicators" variants={stagger} initial="hidden" animate="show">
        {STATS.indicators.map((indicator) => (
          <IndicatorCard key={indicator.id} indicator={indicator} />
        ))}
      </motion.section>

      <section className="panel agenda">
        <h2 className="section-title">{t("agendaTitle")}</h2>
        <p className="mono ash">{t("agendaChecked", { date: new Date(AGENDA.updatedAt).toLocaleDateString(locale) })}</p>
        {upcoming.length === 0 ? (
          <p className="ash">{t("agendaEmpty")}</p>
        ) : (
          <ul className="agenda-list">
            {upcoming.map((item) => (
              <li key={`${item.date}-${item.organizer}`}>
                <span className="mono">{new Date(item.date).toLocaleDateString(locale)}</span>
                <span>{item.title[locale as Language] ?? item.title.fr}</span>
                <a className="mono ash" href={item.source.url} target="_blank" rel="noopener noreferrer">
                  {item.organizer} ↗
                </a>
              </li>
            ))}
          </ul>
        )}
        <h3 className="mono ash">{t("watchTitle")}</h3>
        <ul className="agenda-list">
          {AGENDA.watch.map((source) => (
            <li key={source.url}>
              <a href={source.url} target="_blank" rel="noopener noreferrer">
                {source.name} ↗
              </a>
              <span className="ash">{source.topic[locale as Language] ?? source.topic.fr}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
