"use client";

import { z } from "zod";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Badge, ErrorNote, Field, ScreenHeader, SubmitButton } from "@/components/workspace/ui";
import { callApi, type Phase } from "@/components/workspace/requests";
import type { Language, MonitorMetadataSuccess, MonitorRequest, MonitorSuccess, Region } from "@/lib/api/contract";
import type { MonitorArticle, MonitorEvent, MonitorTheme } from "@/lib/monitor/types";
import { MONITOR_THEMES } from "@/lib/monitor/taxonomy";
import { REGIONS } from "@/lib/constants/regions";

const monitorMetadataSchema = z.object({
  ok: z.literal(true),
  auditedAt: z.string(),
  policy: z.string(),
  sources: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      homepage: z.string().url(),
      lang: z.enum(["mg", "fr", "en"]),
      scope: z.enum(["national", "international"]),
      checkedAt: z.string(),
    }),
  ),
  regions: z.array(
    z.object({
      id: z.enum(REGIONS),
      name: z.string(),
      districts: z.array(z.object({ id: z.string(), name: z.string() })),
    }),
  ),
  themes: z.array(z.enum(MONITOR_THEMES)),
  limitations: z.array(z.string()),
});

type MonitorFilters = {
  articleLang: Language | "";
  sourceId: string;
  region: Region | "";
  district: string;
  theme: MonitorTheme | "";
  query: string;
  sinceHours: number;
  maxArticles: number;
};

function initialFilters(): MonitorFilters {
  return { articleLang: "", sourceId: "", region: "", district: "", theme: "", query: "", sinceHours: 72, maxArticles: 60 };
}

function toRequest(filters: MonitorFilters, lang: Language): MonitorRequest {
  return {
    lang,
    ...(filters.articleLang ? { articleLang: filters.articleLang } : {}),
    ...(filters.sourceId ? { sourceId: filters.sourceId } : {}),
    ...(filters.region ? { region: filters.region } : {}),
    ...(filters.district ? { district: filters.district } : {}),
    ...(filters.theme ? { theme: filters.theme } : {}),
    ...(filters.query.trim() ? { query: filters.query.trim() } : {}),
    sinceHours: filters.sinceHours,
    maxArticles: filters.maxArticles,
  };
}

function formatDate(value: string, locale: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function ArticleLink({ article, locale }: { article: MonitorArticle; locale: string }) {
  const t = useTranslations("monitor");
  return (
    <article className="monitor-article">
      <a className="monitor-article-title" href={article.url} target="_blank" rel="noopener noreferrer">
        {article.title} <span aria-hidden="true">↗</span>
      </a>
      <p className="monitor-article-meta mono ash">
        {article.sourceName} · {t(`languages.${article.lang}`)} · {formatDate(article.publishedAt, locale)}
      </p>
      {article.excerpt && <p className="monitor-excerpt">{article.excerpt}</p>}
    </article>
  );
}

function EventCard({
  event,
  articles,
  locale,
  regionName,
}: {
  event: MonitorEvent;
  articles: Map<string, MonitorArticle>;
  locale: string;
  regionName: (region: Region | null, district: string | null) => string | null;
}) {
  const t = useTranslations("monitor");
  const eventArticles = event.articleIds.map((id) => articles.get(id)).filter((article): article is MonitorArticle => article !== undefined);
  const place = regionName(event.region, event.district);

  return (
    <article className="monitor-event">
      <div className="monitor-event-head">
        <div>
          <h3>{event.title}</h3>
          <p className="monitor-event-meta mono ash">
            {t("eventCounts", { articles: event.articleCount, sources: event.sourceCount })}
            {place ? ` · ${place}` : ""}
          </p>
        </div>
        <Badge tone={event.momentum.level === "steady" ? "neutral" : "warn"}>
          {t(`momentum.${event.momentum.level}`)}
        </Badge>
      </div>

      <p className="monitor-event-meta mono ash">
        {t("lastSeen", { date: formatDate(event.lastSeenAt, locale) })} · {t(`versions.${event.versions.coverage}`)}
      </p>

      {event.versions.summary && <p className="monitor-summary">{event.versions.summary}</p>}
      {event.versions.summary && <p className="monitor-small-note mono ash">{t("summaryNote")}</p>}

      {event.versions.sharedFacts.length > 0 && (
        <div className="monitor-event-notes">
          <p className="mono ash">{t("sharedFacts")}</p>
          <ul className="monitor-list">
            {event.versions.sharedFacts.map((fact, index) => <li key={`${event.id}-fact-${index}`}>{fact}</li>)}
          </ul>
        </div>
      )}

      {event.versions.divergences.length > 0 && (
        <div className="monitor-event-notes">
          <p className="mono ash">{t("divergences")}</p>
          {event.versions.divergences.map((divergence, index) => (
            <section className="monitor-divergence" key={`${event.id}-divergence-${index}`}>
              <p>{divergence.point}</p>
              <p className="mono ash">{t(`divergenceStatus.${divergence.status}`)}</p>
              <ul className="monitor-list">
                {divergence.positions.map((position) => {
                  const article = articles.get(position.articleId);
                  return (
                    <li key={`${position.articleId}-${position.sourceId}`}>
                      <strong>{position.sourceName}:</strong> {position.position}
                      {article && (
                        <a className="monitor-inline-link" href={article.url} target="_blank" rel="noopener noreferrer">
                          {t("openSource")} ↗
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <details className="monitor-details">
        <summary>{t("eventArticles", { count: eventArticles.length })}</summary>
        <div className="monitor-article-list">
          {eventArticles.map((article) => <ArticleLink key={article.id} article={article} locale={locale} />)}
        </div>
      </details>
    </article>
  );
}

export function MonitorScreen() {
  const locale = useLocale();
  const t = useTranslations("monitor");
  const tm = useTranslations("modules.monitor");
  const tc = useTranslations("common");
  const [filters, setFilters] = useState(() => initialFilters());
  const [metadata, setMetadata] = useState<MonitorMetadataSuccess | null>(null);
  const [metadataError, setMetadataError] = useState(false);
  const [phase, setPhase] = useState<Phase<MonitorSuccess>>({ kind: "loading" });
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 310_000);
    let active = true;

    const load = async () => {
      let sourceData: MonitorMetadataSuccess;
      try {
        const response = await fetch("/api/monitor/sources", { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("metadata_unavailable");
        const parsed = monitorMetadataSchema.safeParse(await response.json());
        if (!parsed.success) throw new Error("metadata_unavailable");
        sourceData = parsed.data;
      } catch {
        if (active) {
          setMetadataError(true);
          setPhase({ kind: "idle" });
        }
        return;
      }

      if (!active) return;
      setMetadata(sourceData);
      const initial = initialFilters();
      setFilters(initial);
      try {
        const result = await callApi("/api/monitor", toRequest(initial, locale as Language), controller.signal);
        if (!active) return;
        if (result.ok) setPhase({ kind: "done", data: result });
        else setPhase({ kind: "error", code: result.error.code, retryAfter: result.retryAfterSeconds });
      } catch {
        if (active) setPhase({ kind: "error", code: "network_error", retryAfter: null });
      }
    };

    void load();
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [locale]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const region = metadata?.regions.find((item) => item.id === filters.region);
  const articles = phase.kind === "done" ? phase.data.articles : [];
  const articlesById = useMemo(
    () => new Map((phase.kind === "done" ? phase.data.articles : []).map((article) => [article.id, article])),
    [phase],
  );
  const events = phase.kind === "done" ? phase.data.events : [];
  const alerts = phase.kind === "done" ? phase.data.alerts : [];

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 310_000);
    setPhase({ kind: "loading" });
    try {
      const result = await callApi("/api/monitor", toRequest(filters, locale as Language), controller.signal);
      if (controller.signal.aborted) return;
      if (result.ok) setPhase({ kind: "done", data: result });
      else setPhase({ kind: "error", code: result.error.code, retryAfter: result.retryAfterSeconds });
    } catch {
      if (!controller.signal.aborted || timedOut) setPhase({ kind: "error", code: "network_error", retryAfter: null });
    } finally {
      window.clearTimeout(timeout);
    }
  };

  const regionName = (id: Region | null, district: string | null) => {
    if (!id) return null;
    const selectedRegion = metadata?.regions.find((item) => item.id === id);
    const selectedDistrict = selectedRegion?.districts.find((item) => item.id === district);
    return selectedDistrict ? `${selectedDistrict.name}, ${selectedRegion?.name}` : selectedRegion?.name ?? id;
  };

  return (
    <div className="screen-grid monitor-grid">
      <ScreenHeader need={`${tm("need")} · ${tm("state")}`} title={t("title")} lead={t("lead")}>
        {metadata && (
          <Badge>{t("audited", { date: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(metadata.auditedAt)) })}</Badge>
        )}
      </ScreenHeader>

      {metadataError && <p className="error-note" role="alert">{t("sourcesError")}</p>}

      <form className="panel monitor-filters" onSubmit={submit}>
        <div className="monitor-filter-grid">
          <Field label={t("fields.language")} htmlFor="monitor-language">
            <select id="monitor-language" className="input select" value={filters.articleLang} onChange={(event) => setFilters({ ...filters, articleLang: event.target.value as Language | "" })}>
              <option value="">{t("allLanguages")}</option>
              {(["mg", "fr", "en"] as const).map((lang) => <option key={lang} value={lang}>{t(`languages.${lang}`)}</option>)}
            </select>
          </Field>
          <Field label={t("fields.source")} htmlFor="monitor-source">
            <select id="monitor-source" className="input select" value={filters.sourceId} onChange={(event) => setFilters({ ...filters, sourceId: event.target.value })}>
              <option value="">{t("allSources")}</option>
              {metadata?.sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
            </select>
          </Field>
          <Field label={t("fields.region")} htmlFor="monitor-region">
            <select id="monitor-region" className="input select" value={filters.region} onChange={(event) => setFilters({ ...filters, region: event.target.value as Region | "", district: "" })}>
              <option value="">{t("allRegions")}</option>
              {metadata?.regions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </Field>
          <Field label={t("fields.district")} htmlFor="monitor-district">
            <select id="monitor-district" className="input select" value={filters.district} disabled={!region} onChange={(event) => setFilters({ ...filters, district: event.target.value })}>
              <option value="">{t("allDistricts")}</option>
              {region?.districts.map((district) => <option key={district.id} value={district.id}>{district.name}</option>)}
            </select>
          </Field>
          <Field label={t("fields.theme")} htmlFor="monitor-theme">
            <select id="monitor-theme" className="input select" value={filters.theme} onChange={(event) => setFilters({ ...filters, theme: event.target.value as MonitorTheme | "" })}>
              <option value="">{t("allThemes")}</option>
              {metadata?.themes.map((theme) => <option key={theme} value={theme}>{t(`themes.${theme}`)}</option>)}
            </select>
          </Field>
          <Field label={t("fields.period")} htmlFor="monitor-period">
            <select id="monitor-period" className="input select" value={filters.sinceHours} onChange={(event) => setFilters({ ...filters, sinceHours: Number(event.target.value) })}>
              {[24, 72, 168].map((hours) => <option key={hours} value={hours}>{t(`periods.${hours}`)}</option>)}
            </select>
          </Field>
          <Field label={t("fields.maxArticles")} htmlFor="monitor-limit">
            <select id="monitor-limit" className="input select" value={filters.maxArticles} onChange={(event) => setFilters({ ...filters, maxArticles: Number(event.target.value) })}>
              {[30, 60, 120].map((count) => <option key={count} value={count}>{count}</option>)}
            </select>
          </Field>
          <Field label={t("fields.query")} htmlFor="monitor-query">
            <input id="monitor-query" className="input" type="search" maxLength={80} minLength={2} value={filters.query} onChange={(event) => setFilters({ ...filters, query: event.target.value })} />
          </Field>
        </div>
        <div className="monitor-filter-actions">
          <p className="monitor-small-note mono ash">{t("filterNote")}</p>
          <SubmitButton busy={phase.kind === "loading"} disabled={!metadata || filters.query.trim().length === 1}>
            {t("refresh")}
          </SubmitButton>
        </div>
      </form>

      <section className="panel monitor-source-panel">
        <div className="monitor-section-head">
          <div>
            <p className="mono ash">{t("sourceTitle")}</p>
            <h2 className="section-title">{t("sourcesCount", { count: metadata?.sources.length ?? 0 })}</h2>
          </div>
          {metadata && <p className="monitor-small-note mono ash">{t("auditDate", { date: metadata.auditedAt })}</p>}
        </div>
        <ul className="monitor-source-list">
          {metadata?.sources.map((source) => (
            <li key={source.id}>
              <a href={source.homepage} target="_blank" rel="noopener noreferrer">{source.name} ↗</a>
              <span className="mono ash">{t(`languages.${source.lang}`)} · {t(`scope.${source.scope}`)} · {source.checkedAt}</span>
            </li>
          ))}
        </ul>
      </section>

      {phase.kind === "loading" && (
        <p className="panel monitor-state" role="status" aria-live="polite">{t("loading")}</p>
      )}
      {phase.kind === "error" && (
        <div className="monitor-error">
          <ErrorNote code={phase.code} retryAfter={phase.retryAfter} />
          <p className="monitor-small-note mono ash">{t("retryNote")}</p>
        </div>
      )}
      {phase.kind === "done" && (
        <div className="monitor-results">
          <section className="panel monitor-coverage">
            <div className="monitor-section-head">
              <div>
                <p className="mono ash">{t("coverageTitle")}</p>
                <h2 className="section-title">{t("generated", { date: formatDate(phase.data.generatedAt, locale) })}</h2>
              </div>
              <div className="monitor-badges">
                {phase.data.mock && <Badge tone="accent">{tc("demo")}</Badge>}
                {phase.data.meta.cached && <Badge>{tc("cached")}</Badge>}
                <Badge tone={phase.data.meta.analysis === "unavailable" ? "warn" : "neutral"}>
                  {t(`analysis.${phase.data.meta.analysis}`)}
                </Badge>
              </div>
            </div>
            {phase.data.mock && <p className="monitor-small-note">{tc("demoNote")}</p>}
            <div className="monitor-counts">
              <p><strong>{phase.data.coverage.sourcesFetched}/{phase.data.coverage.sourcesConfigured}</strong><span>{t("sourcesReached")}</span></p>
              <p><strong>{phase.data.coverage.articlesFetched}</strong><span>{t("articlesFetched")}</span></p>
              <p><strong>{phase.data.coverage.articlesMatched}</strong><span>{t("articlesMatched")}</span></p>
              <p><strong>{phase.data.events.length}</strong><span>{t("eventsCount")}</span></p>
            </div>
            <p className="monitor-small-note mono ash">{t("coverageNote", { from: formatDate(phase.data.window.from, locale), to: formatDate(phase.data.window.to, locale) })}</p>
            {phase.data.coverage.failed.length > 0 && (
              <div className="monitor-failures">
                <p className="mono ash">{t("failedFeeds", { count: phase.data.coverage.failed.length })}</p>
                <ul>{phase.data.coverage.failed.map((failure) => <li key={failure.sourceId}>{failure.sourceName}</li>)}</ul>
              </div>
            )}
          </section>

          <section className="monitor-section">
            <div className="monitor-section-head">
              <h2 className="section-title">{t("alertsTitle")}</h2>
              <p className="monitor-small-note mono ash">{t("alertsNote")}</p>
            </div>
            {alerts.length === 0 ? (
              <p className="monitor-empty">{t("alertsEmpty")}</p>
            ) : (
              <ul className="monitor-alert-list">
                {alerts.map((alert) => (
                  <li className="monitor-alert" key={alert.id} data-severity={alert.severity}>
                    <Badge tone={alert.severity === "urgent" ? "warn" : "neutral"}>{t(`severity.${alert.severity}`)}</Badge>
                    <div>
                      <p className="monitor-alert-title">{alert.title}</p>
                      <p className="monitor-small-note mono ash">{t(`alertKinds.${alert.kind}`)} · {t(`alertReasons.${alert.reason.code}`)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="monitor-section">
            <h2 className="section-title">{t("eventsTitle")}</h2>
            <p className="monitor-small-note mono ash">{t("eventMethodNote")}</p>
            {events.length === 0 ? (
              <p className="monitor-empty">{t("eventsEmpty")}</p>
            ) : (
              <div className="monitor-event-list">
                {events.map((event) => (
                  <EventCard key={event.id} event={event} articles={articlesById} locale={locale} regionName={regionName} />
                ))}
              </div>
            )}
          </section>

          <section className="monitor-section">
            <div className="monitor-section-head">
              <h2 className="section-title">{t("articlesTitle", { count: articles.length })}</h2>
              {phase.data.coverage.truncated && <Badge tone="warn">{t("truncated")}</Badge>}
            </div>
            {articles.length === 0 ? (
              <p className="monitor-empty">{t("articlesEmpty")}</p>
            ) : (
              <div className="monitor-article-list">
                {articles.map((article) => <ArticleLink key={article.id} article={article} locale={locale} />)}
              </div>
            )}
          </section>

          <section className="panel monitor-limitations">
            <p className="mono ash">{t("limitationsTitle")}</p>
            <ul className="monitor-list">
              {phase.data.limitations.map((limitation) => (
                <li key={limitation}>{t.has(`limitations.${limitation}`) ? t(`limitations.${limitation}`) : t("genericLimitation")}</li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
