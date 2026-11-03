"use client";

import { AnimatePresence, motion } from "motion/react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState, useSyncExternalStore, type FormEvent } from "react";
import type { ClaimStatus, EditorialAnglesSuccess, Language } from "@/lib/api/contract";
import { CLAIMS_HANDOFF_KEY, callApi, type Phase } from "@/components/workspace/requests";
import { Badge, ErrorNote, Field, ScreenHeader, StatusChip, SubmitButton, rise, stagger } from "@/components/workspace/ui";

type HandoffClaim = { text: string; status: ClaimStatus };

const subscribe = (notify: () => void) => {
  window.addEventListener("storage", notify);
  return () => window.removeEventListener("storage", notify);
};
const readHandoff = () => window.sessionStorage.getItem(CLAIMS_HANDOFF_KEY);
const serverHandoff = () => null;

function parseClaims(raw: string | null): HandoffClaim[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? (value as HandoffClaim[]).filter((c) => typeof c?.text === "string" && typeof c?.status === "string") : [];
  } catch {
    return [];
  }
}

export function AnglesScreen() {
  const t = useTranslations("angles");
  const tm = useTranslations("modules.angles");
  const tc = useTranslations("common");
  const tl = useTranslations("locale");
  const locale = useLocale() as Language;
  const raw = useSyncExternalStore(subscribe, readHandoff, serverHandoff);
  const [dismissed, setDismissed] = useState(false);
  const claims = useMemo(() => (dismissed ? [] : parseClaims(raw)), [raw, dismissed]);
  const params = useSearchParams();
  const [subject, setSubject] = useState(() => params.get("subject")?.slice(0, 300) ?? "");
  const [lang, setLang] = useState<Language>(locale);
  const [phase, setPhase] = useState<Phase<EditorialAnglesSuccess>>({ kind: "idle" });

  const clear = () => {
    window.sessionStorage.removeItem(CLAIMS_HANDOFF_KEY);
    setDismissed(true);
  };

  const canSubmit = subject.trim().length > 0 || claims.some((c) => c.status === "confirmed");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setPhase({ kind: "loading" });
    const res = await callApi("/api/editorial/angles", {
      lang,
      ...(subject.trim() ? { subject: subject.trim() } : {}),
      ...(claims.length ? { claims: claims.map((c) => ({ text: c.text.slice(0, 1000), status: c.status })) } : {}),
    });
    if (res.ok) setPhase({ kind: "done", data: res });
    else setPhase({ kind: "error", code: res.error.code, retryAfter: res.retryAfterSeconds });
  };

  return (
    <div className="screen-grid">
      <ScreenHeader kicker={`${tm("state")}`} title={t("title")} lead={t("lead")} />

      <motion.form className="panel form" onSubmit={submit} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.7, ease: [0.19, 1, 0.22, 1] }}>
        {claims.length > 0 && (
          <div className="handoff-claims">
            <div className="form-row">
              <p className="mono ash">{t("fromVerification", { count: claims.length })}</p>
              <button type="button" className="link-button mono" onClick={clear}>
                {t("clear")}
              </button>
            </div>
            <ul className="handoff-list">
              {claims.map((c) => (
                <li key={c.text}>
                  <StatusChip status={c.status} />
                  <span>{c.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="form-row">
          <span />
          <button type="button" className="link-button mono" onClick={() => setSubject(t("example"))}>
            {tc("useExample")}
          </button>
        </div>
        <Field label={t("subject")} htmlFor="angles-subject">
          <input id="angles-subject" className="input" value={subject} maxLength={800} placeholder={t("subjectPlaceholder")} onChange={(e) => setSubject(e.target.value)} />
        </Field>
        <div className="form-row form-row-end">
          <Field label={t("language")} htmlFor="angles-lang">
            <select id="angles-lang" className="input select" value={lang} onChange={(e) => setLang(e.target.value as Language)}>
              {(["mg", "fr", "en"] as const).map((l) => (
                <option key={l} value={l}>
                  {tl(l)}
                </option>
              ))}
            </select>
          </Field>
          <SubmitButton busy={phase.kind === "loading"} disabled={!canSubmit}>
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
            {(phase.data.mock || phase.data.recordedAt) && (
              <motion.div className="result-badges" variants={rise}>
                {phase.data.mock && <Badge tone="accent">{tc("demo")}</Badge>}
                {phase.data.recordedAt && <Badge tone="warn">{tc("replayed", { date: new Date(phase.data.recordedAt).toLocaleDateString(locale) })}</Badge>}
              </motion.div>
            )}
            <motion.div className="angles" variants={stagger}>
              {phase.data.angles.map((angle, i) => (
                <motion.article key={angle.title} className="angle" variants={rise}>
                  <header className="angle-head">
                    <span className="claim-index mono ash">{String(i + 1).padStart(2, "0")}</span>
                    <Badge>{t(`format.${angle.format}`)}</Badge>
                  </header>
                  <h3 className="angle-title">{angle.title}</h3>
                  <p className="mono ash">{t("premise")}</p>
                  <p>{angle.premise}</p>
                  <div className="angle-cols">
                    {(
                      [
                        ["questions", angle.interviewQuestions],
                        ["actors", angle.actorTypes],
                        ["data", angle.dataToFind],
                      ] as const
                    ).map(([key, list]) => (
                      <div key={key}>
                        <p className="mono ash">{t(key)}</p>
                        <ul className="bullets">
                          {list.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                  {angle.toVerifyFirst.length > 0 && (
                    <div className="verify-first">
                      <p className="mono">{t("verifyFirst")}</p>
                      <ul className="bullets">
                        {angle.toVerifyFirst.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </motion.article>
              ))}
            </motion.div>
            {phase.data.limitations.length > 0 && (
              <motion.div className="limitations" variants={rise}>
                <ul className="bullets">
                  {phase.data.limitations.map((l) => (
                    <li key={l}>{l}</li>
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
