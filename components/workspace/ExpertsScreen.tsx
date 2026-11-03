"use client";

import { AnimatePresence, motion } from "motion/react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import type { ExpertSuggestion, Language, Region, SuggestExpertsSuccess } from "@/lib/api/contract";
import { REGIONS } from "@/lib/constants/regions";
import { callApi, type Phase } from "@/components/workspace/requests";
import { Badge, ErrorNote, Field, ScreenHeader, SubmitButton, rise, stagger } from "@/components/workspace/ui";

const LANGS: Language[] = ["mg", "fr", "en"];

function regionName(slug: string): string {
  return slug
    .split("_")
    .map((part, i) => (i > 0 && part === "i" ? "i" : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(" ")
    .replace("Amoron i Mania", "Amoron'i Mania");
}

function ExpertCard({ expert }: { expert: ExpertSuggestion }) {
  const t = useTranslations("experts");
  const tl = useTranslations("locale");
  const locale = useLocale();
  const verified = new Date(expert.lastVerifiedAt).toLocaleDateString(locale);

  return (
    <motion.article className="expert" variants={rise}>
      <header className="expert-head">
        <div>
          <h3 className="expert-name">{expert.fullName}</h3>
          <p className="ash">
            {[expert.title, expert.organization].filter(Boolean).join(" — ")}
          </p>
        </div>
        <div className="expert-badges">
          {expert.isFictional && <Badge tone="accent">{t("fictional")}</Badge>}
          <Badge>{t(`contribution.${expert.contributionType}`)}</Badge>
        </div>
      </header>

      <div className="relevance" aria-label={`${t("relevance")} ${expert.relevance}/100`}>
        <span className="mono ash">{t("relevance")}</span>
        <span className="relevance-track">
          <motion.i initial={{ scaleX: 0 }} animate={{ scaleX: expert.relevance / 100 }} transition={{ duration: 1.1, ease: [0.19, 1, 0.22, 1] }} />
        </span>
        <span className="mono">{expert.relevance}</span>
      </div>

      <p className="expert-reason">{expert.reason}</p>

      <dl className="expert-facts mono">
        <div>
          <dt className="ash">{t("region")}</dt>
          <dd>{expert.regions.length ? expert.regions.map(regionName).join(", ") : t("national")}</dd>
        </div>
        <div>
          <dt className="ash">{t("languages")}</dt>
          <dd>{expert.languages.map((l) => tl(l)).join(", ")}</dd>
        </div>
      </dl>

      <p className="expert-verified mono ash">
        {t("verified", { date: verified })}
        {expert.isStale && <span className="stale"> · {t("stale")}</span>}
      </p>

      {(expert.contactEmail || expert.contactPhone) && (
        <p className="expert-contacts mono">
          {expert.contactEmail && <a href={`mailto:${expert.contactEmail}`}>{expert.contactEmail}</a>}
          {expert.contactPhone && <a href={`tel:${expert.contactPhone.replace(/\s+/g, "")}`}>{expert.contactPhone}</a>}
        </p>
      )}
    </motion.article>
  );
}

export function ExpertsScreen() {
  const t = useTranslations("experts");
  const tm = useTranslations("modules.experts");
  const tc = useTranslations("common");
  const tl = useTranslations("locale");
  const locale = useLocale() as Language;
  const params = useSearchParams();
  const [topic, setTopic] = useState(() => params.get("topic") ?? "");
  const [context, setContext] = useState("");
  const [region, setRegion] = useState<Region | "">("");
  const [languages, setLanguages] = useState<Language[]>([]);
  const [phase, setPhase] = useState<Phase<SuggestExpertsSuccess>>({ kind: "idle" });

  const toggleLang = (lang: Language) =>
    setLanguages((current) => (current.includes(lang) ? current.filter((l) => l !== lang) : [...current, lang]));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (topic.trim().length < 3) return;
    setPhase({ kind: "loading" });
    const res = await callApi("/api/sources/suggest", {
      topic: topic.trim(),
      lang: locale,
      limit: 5,
      ...(context.trim() ? { context: context.trim() } : {}),
      ...(region ? { region } : {}),
      ...(languages.length ? { languages } : {}),
    });
    if (res.ok) setPhase({ kind: "done", data: res });
    else setPhase({ kind: "error", code: res.error.code, retryAfter: res.retryAfterSeconds });
  };

  return (
    <div className="screen-grid">
      <ScreenHeader kicker={`${tm("state")}`} title={t("title")} lead={t("lead")} />

      <motion.form className="panel form" onSubmit={submit} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.7, ease: [0.19, 1, 0.22, 1] }}>
        <div className="form-row">
          <span />
          <button type="button" className="link-button mono" onClick={() => setTopic(t("example"))}>
            {tc("useExample")}
          </button>
        </div>
        <Field label={t("topic")} htmlFor="experts-topic">
          <input id="experts-topic" className="input" value={topic} maxLength={500} placeholder={t("topicPlaceholder")} onChange={(e) => setTopic(e.target.value)} />
        </Field>
        <Field label={t("context")} htmlFor="experts-context">
          <textarea id="experts-context" className="input textarea" rows={3} maxLength={2000} value={context} onChange={(e) => setContext(e.target.value)} />
        </Field>
        <div className="form-row form-row-end">
          <Field label={t("region")} htmlFor="experts-region">
            <select id="experts-region" className="input select" value={region} onChange={(e) => setRegion(e.target.value as Region | "")}>
              <option value="">{t("anyRegion")}</option>
              {REGIONS.map((r) => (
                <option key={r} value={r}>
                  {regionName(r)}
                </option>
              ))}
            </select>
          </Field>
          <fieldset className="field">
            <legend className="field-label mono">{t("languages")}</legend>
            <div className="chips">
              {LANGS.map((lang) => (
                <button key={lang} type="button" className="chip-toggle mono" aria-pressed={languages.includes(lang)} onClick={() => toggleLang(lang)}>
                  {tl(lang)}
                </button>
              ))}
            </div>
          </fieldset>
          <SubmitButton busy={phase.kind === "loading"} disabled={topic.trim().length < 3}>
            {t("submit")}
          </SubmitButton>
        </div>
      </motion.form>

      <AnimatePresence mode="wait">
        {phase.kind === "loading" && (
          <motion.div key="loading" className="panel skeletons" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {[0, 1, 2].map((i) => (
              <span key={i} className="skeleton" style={{ animationDelay: `${i * 120}ms` }} />
            ))}
          </motion.div>
        )}
        {phase.kind === "error" && <ErrorNote key="error" code={phase.code} retryAfter={phase.retryAfter} />}
        {phase.kind === "done" && (
          <motion.section key="done" className="result" variants={stagger} initial="hidden" animate="show">
            <motion.div className="result-badges" variants={rise}>
              {phase.data.mock && <Badge tone="accent">{tc("demo")}</Badge>}
              {phase.data.meta.cached && <Badge>{tc("cached")}</Badge>}
            </motion.div>
            {phase.data.regionBroadened && (
              <motion.p className="notice" variants={rise}>
                {t("broadened")}
              </motion.p>
            )}
            {phase.data.notice && (
              <motion.p className="notice" variants={rise}>
                {phase.data.notice.message}
              </motion.p>
            )}
            <motion.div className="experts" variants={stagger}>
              {phase.data.suggestions.map((expert) => (
                <ExpertCard key={expert.id} expert={expert} />
              ))}
            </motion.div>
            {phase.data.missingProfiles.length > 0 && (
              <motion.div className="limitations" variants={rise}>
                <p className="mono ash">{t("missing")}</p>
                <ul className="bullets">
                  {phase.data.missingProfiles.map((profile) => (
                    <li key={profile}>{profile}</li>
                  ))}
                </ul>
              </motion.div>
            )}
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
