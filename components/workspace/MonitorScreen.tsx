"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Language, MonitorAlert, MonitorArticle, MonitorEvent, MonitorSuccess, MonitorTheme, Region } from "@/lib/api/contract";
import type { ApiResult } from "@/lib/api/fetcher";
import { callApi, type Phase } from "@/components/workspace/requests";
import { Badge, ErrorNote, Field, ScreenHeader, Segmented, StatusChip, SubmitButton, rise, stagger } from "@/components/workspace/ui";

export type MonitorSetup = {
  auditedAt: string;
  sources: { id: string; name: string; homepage: string; lang: Language }[];
  regions: { id: Region; name: string; districts: { id: string; name: string }[] }[];
  themes: MonitorTheme[];
};

type Period = "24" | "72" | "168";

const SEVERITY_SYMBOL: Record<MonitorAlert["severity"], string> = { info: "○", attention: "◐", urgent: "●" };
const MOMENTUM_SYMBOL: Record<MonitorEvent["momentum"]["level"], string> = { steady: "→", rising: "↗", surge: "⇈" };
const EVENTS_SHOWN = 12;
const DEFAULT_PERIOD: Period = "72";

function toPhase(res: ApiResult<"/api/monitor">): Phase<MonitorSuccess> {
  return res.ok ? { kind: "done", data: res } : { kind: "error", code: res.error.code, retryAfter: res.retryAfterSeconds };
}

function useDateFormat() {
  const locale = useLocale();
  return (iso: string) => new Date(iso).toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function placeName(setup: MonitorSetup, region: Region | null, district: string | null): string | null {
  if (!region) return null;
  const entry = setup.regions.find((r) => r.id === region);
  const districtName = district ? entry?.districts.find((d) => d.id === district)?.name : null;
  return [districtName, entry?.name ?? region].filter(Boolean).join(", ");
}

function ArticleLine({ article }: { article: MonitorArticle }) {
  const t = useTranslations("monitor");
  const formatDate = useDateFormat();
  return (
    <li className="monitor-article">
      <a href={article.url} target="_blank" rel="noopener noreferrer" className="monitor-article-title">
        {article.title} ↗
      </a>
      <span className="mono ash">
        {article.sourceName} · {formatDate(article.publishedAt)}
      </span>
      {article.excerpt && <span className="monitor-excerpt">{article.excerpt}</span>}
      <Link className="link-button mono" href={`/app/verify?url=${encodeURIComponent(article.url)}`}>
        {t("verifyArticle")} →
      </Link>
    </li>
  );
}

function Versions({ event }: { event: MonitorEvent }) {
  const t = useTranslations("monitor");
  const { versions } = event;
  return (
    <div className="monitor-versions">
      <p className="mono ash">{t(`coverage.${versions.coverage}`)}</p>
      {versions.summary && <p>{versions.summary}</p>}
      {versions.sharedFacts.length > 0 && (
        <>
          <p className="mono ash">{t("sharedFacts")}</p>
          <ul className="bullets">
            {versions.sharedFacts.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
        </>
      )}
      {versions.divergences.map((divergence) => (
        <div key={divergence.point} className="monitor-divergence">
          <p className="monitor-divergence-point">
            <StatusChip status={divergence.status} /> {divergence.point}
          </p>
          <ul className="evidence">
            {divergence.positions.map((position) => (
              <li key={`${position.articleId}-${position.position}`}>
                <span className="source-kind mono">{position.sourceName}</span>
                <span>{position.position}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {versions.limitations.length > 0 && (
        <ul className="bullets ash">
          {versions.limitations.map((limit) => (
            <li key={limit}>{limit}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EventCard({ event, articles, setup }: { event: MonitorEvent; articles: Map<string, MonitorArticle>; setup: MonitorSetup }) {
  const t = useTranslations("monitor");
  const formatDate = useDateFormat();
  const place = placeName(setup, event.region, event.district);
  const items = event.articleIds.flatMap((id) => articles.get(id) ?? []);
  return (
    <motion.article className="monitor-event" variants={rise}>
      <header className="monitor-event-head">
        <h3 className="monitor-event-title">{event.title}</h3>
        <span className="monitor-momentum mono" data-level={event.momentum.level}>
          <span aria-hidden="true">{MOMENTUM_SYMBOL[event.momentum.level]}</span> {t(`momentum.${event.momentum.level}`)} · {event.momentum.score}/100
        </span>
      </header>
      <p className="mono ash">
        {t("eventFacts", { articles: event.articleCount, sources: event.sourceCount })} · {t("lastSeen", { date: formatDate(event.lastSeenAt) })}
        {place ? ` · ${place}` : ""}
      </p>
      <div className="chips">
        {event.themes.map((theme) => (
          <Badge key={theme}>{t(`theme.${theme}`)}</Badge>
        ))}
      </div>
      {event.versions.coverage !== "single_source" && event.versions.coverage !== "not_analysed" && <Versions event={event} />}
      <ul className="monitor-articles">
        {items.map((article) => (
          <ArticleLine key={article.id} article={article} />
        ))}
      </ul>
      <div className="handoff">
        <Link className="ghost-button" href={`/app/angles?subject=${encodeURIComponent(event.title)}`}>
          {t("toAngles")} →
        </Link>
      </div>
    </motion.article>
  );
}

function AlertList({ alerts }: { alerts: MonitorAlert[] }) {
  const t = useTranslations("monitor");
  if (alerts.length === 0) return null;
  return (
    <motion.div className="claim-block" variants={rise}>
      <p className="mono ash">{t("alerts")}</p>
      <ul className="monitor-alerts">
        {alerts.map((alert) => (
          <li key={alert.id} className="monitor-alert" data-severity={alert.severity}>
            <span className="mono">
              <span aria-hidden="true">{SEVERITY_SYMBOL[alert.severity]}</span> {t(`severity.${alert.severity}`)} · {t(`alertKind.${alert.kind}`)}
            </span>
            <a href={`#${alert.eventId}`}>{alert.title}</a>
            <span className="mono ash">{t("eventFacts", { articles: alert.reason.articleCount, sources: alert.reason.sourceCount })}</span>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

function CoverageLine({ data, setup }: { data: MonitorSuccess; setup: MonitorSetup }) {
  const t = useTranslations("monitor");
  const tc = useTranslations("common");
  const formatDate = useDateFormat();
  const failed = data.coverage.failed.map((f) => f.sourceName);
  return (
    <motion.div className="claim-block" variants={rise}>
      <div className="result-badges">
        {data.mock && <Badge tone="accent">{tc("demo")}</Badge>}
        {data.meta.cached && <Badge>{tc("cached")}</Badge>}
        {data.meta.analysis === "unavailable" && <Badge tone="warn">{t("analysisUnavailable")}</Badge>}
      </div>
      <p>
        {t("coverageLine", {
          matched: data.coverage.articlesMatched,
          fetched: data.coverage.articlesFetched,
          sources: data.coverage.sourcesFetched,
          configured: data.coverage.sourcesConfigured,
        })}
      </p>
      <p className="mono ash">
        {t("window", { from: formatDate(data.window.from), to: formatDate(data.window.to) })} · {t("audited", { date: new Date(setup.auditedAt).toLocaleDateString() })}
      </p>
      {failed.length > 0 && <p className="notice">{t("failedSources", { names: failed.join(", ") })}</p>}
      {data.coverage.truncated && <p className="notice">{t("truncated")}</p>}
    </motion.div>
  );
}

export function MonitorScreen({ setup }: { setup: MonitorSetup }) {
  const t = useTranslations("monitor");
  const tm = useTranslations("modules.monitor");
  const locale = useLocale() as Language;
  const [theme, setTheme] = useState<MonitorTheme | "">("");
  const [region, setRegion] = useState<Region | "">("");
  const [district, setDistrict] = useState("");
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState<Period>(DEFAULT_PERIOD);
  const [showAll, setShowAll] = useState(false);
  const [phase, setPhase] = useState<Phase<MonitorSuccess>>({ kind: "loading" });

  const districts = setup.regions.find((r) => r.id === region)?.districts ?? [];
  const articles = useMemo(
    () => new Map((phase.kind === "done" ? phase.data.articles : []).map((article) => [article.id, article])),
    [phase],
  );

  const run = async () => {
    setPhase({ kind: "loading" });
    setShowAll(false);
    const res = await callApi("/api/monitor", {
      lang: locale,
      sinceHours: Number(period),
      ...(theme ? { theme } : {}),
      ...(region ? { region } : {}),
      ...(region && district ? { district } : {}),
      ...(query.trim().length >= 2 ? { query: query.trim() } : {}),
    });
    setPhase(toPhase(res));
  };

  useEffect(() => {
    let cancelled = false;
    void callApi("/api/monitor", { lang: locale, sinceHours: Number(DEFAULT_PERIOD) }).then((res) => {
      if (!cancelled) setPhase(toPhase(res));
    });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run();
  };

  const events = phase.kind === "done" ? phase.data.events : [];
  const shown = showAll ? events : events.slice(0, EVENTS_SHOWN);

  return (
    <div className="screen-grid">
      <ScreenHeader kicker={`${tm("state")}`} title={t("title")} lead={t("lead")} />

      <motion.form className="panel form" onSubmit={submit} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.7, ease: [0.19, 1, 0.22, 1] }}>
        <Field label={t("query")} htmlFor="monitor-query">
          <input id="monitor-query" className="input" value={query} maxLength={80} placeholder={t("queryPlaceholder")} onChange={(e) => setQuery(e.target.value)} />
        </Field>
        <div className="form-row">
          <Field label={t("themeLabel")} htmlFor="monitor-theme">
            <select id="monitor-theme" className="input select" value={theme} onChange={(e) => setTheme(e.target.value as MonitorTheme | "")}>
              <option value="">{t("anyTheme")}</option>
              {setup.themes.map((id) => (
                <option key={id} value={id}>
                  {t(`theme.${id}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("region")} htmlFor="monitor-region">
            <select
              id="monitor-region"
              className="input select"
              value={region}
              onChange={(e) => {
                setRegion(e.target.value as Region | "");
                setDistrict("");
              }}
            >
              <option value="">{t("anyRegion")}</option>
              {setup.regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("district")} htmlFor="monitor-district">
            <select id="monitor-district" className="input select" value={district} disabled={!region} onChange={(e) => setDistrict(e.target.value)}>
              <option value="">{t("anyDistrict")}</option>
              {districts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="form-row form-row-end">
          <Segmented<Period>
            label={t("period")}
            value={period}
            onChange={setPeriod}
            options={[
              { value: "24", label: t("periods.24") },
              { value: "72", label: t("periods.72") },
              { value: "168", label: t("periods.168") },
            ]}
          />
          <SubmitButton busy={phase.kind === "loading"}>{t("submit")}</SubmitButton>
        </div>
      </motion.form>

      <AnimatePresence mode="wait">
        {phase.kind === "loading" && (
          <motion.div key="loading" className="panel skeletons" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <p className="mono ash" aria-live="polite">
              {t("loading", { count: setup.sources.length })}
            </p>
            {[0, 1, 2].map((i) => (
              <span key={i} className="skeleton" style={{ animationDelay: `${i * 120}ms` }} />
            ))}
          </motion.div>
        )}
        {phase.kind === "error" && <ErrorNote key="error" code={phase.code} retryAfter={phase.retryAfter} />}
        {phase.kind === "done" && (
          <motion.section key="done" className="result" variants={stagger} initial="hidden" animate="show">
            <CoverageLine data={phase.data} setup={setup} />
            <AlertList alerts={phase.data.alerts} />
            {events.length === 0 ? (
              <motion.p className="notice" variants={rise}>
                {t("empty")}
              </motion.p>
            ) : (
              <motion.div className="monitor-events" variants={stagger}>
                {shown.map((event) => (
                  <div key={event.id} id={event.id}>
                    <EventCard event={event} articles={articles} setup={setup} />
                  </div>
                ))}
              </motion.div>
            )}
            {events.length > EVENTS_SHOWN && (
              <motion.div variants={rise}>
                <button type="button" className="link-button mono" onClick={() => setShowAll((open) => !open)}>
                  {showAll ? t("showLess") : t("showAll", { count: events.length })}
                </button>
              </motion.div>
            )}
            <motion.div className="limitations" variants={rise}>
              <p className="mono ash">{t("limitsTitle")}</p>
              <ul className="bullets">
                {phase.data.limitations.map((code) => (
                  <li key={code}>{t.has(`limits.${code}`) ? t(`limits.${code}`) : code}</li>
                ))}
              </ul>
            </motion.div>
          </motion.section>
        )}
      </AnimatePresence>

      <motion.aside className="panel" variants={rise} initial="hidden" animate="show">
        <p className="mono ash">{t("sourcesTitle", { count: setup.sources.length })}</p>
        <ul className="monitor-sources">
          {setup.sources.map((source) => (
            <li key={source.id}>
              <a href={source.homepage} target="_blank" rel="noopener noreferrer">
                {source.name} ↗
              </a>
            </li>
          ))}
        </ul>
        <p className="mono ash">{t("policy")}</p>
      </motion.aside>
    </div>
  );
}
