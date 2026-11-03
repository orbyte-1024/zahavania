"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Language, ScoreItem, ScoredClaim, VerifyTextSuccess } from "@/lib/api/contract";
import { reportTitle, saveReport, type Decision } from "@/lib/dossiers";
import { CLAIMS_HANDOFF_KEY, callApi, type Phase } from "@/components/workspace/requests";
import {
  Badge,
  ErrorNote,
  Field,
  IndexGauge,
  ScreenHeader,
  Segmented,
  Stages,
  StatusChip,
  SubmitButton,
  rise,
  stagger,
} from "@/components/workspace/ui";
import { BRAND_NAME } from "@/lib/brand";

const MAX_TEXT = 8000;
type Mode = "text" | "url" | "image";

function Breakdown({ items }: { items: ScoreItem[] }) {
  const t = useTranslations("score");
  return (
    <ul className="breakdown">
      {items.map((item, i) => (
        <li key={`${item.code}-${i}`} title={item.label}>
          <span>{item.code === "claim_contribution" ? t("claim_contribution", { index: i + 1 }) : t(item.code)}</span>
          <span className="breakdown-points" data-sign={item.points > 0 ? "plus" : item.points < 0 ? "minus" : "zero"}>
            {item.points > 0 ? `+${item.points}` : item.points}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Why({ items, label }: { items: ScoreItem[]; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="why">
      <button type="button" className="why-toggle mono" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {label}
        <motion.span aria-hidden="true" animate={{ rotate: open ? 45 : 0 }}>
          +
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.19, 1, 0.22, 1] }}
            style={{ overflow: "hidden" }}
          >
            <Breakdown items={items} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ClaimCard({
  claim,
  index,
  decision,
  onDecide,
}: {
  claim: ScoredClaim;
  index: number;
  decision: Decision | null;
  onDecide: (decision: Decision | null) => void;
}) {
  const t = useTranslations("verify");

  return (
    <motion.article className="claim" variants={rise} data-decision={decision ?? undefined}>
      <header className="claim-head">
        <span className="claim-index mono ash">{String(index + 1).padStart(2, "0")}</span>
        <StatusChip status={claim.status} />
        <span className="claim-score">
          <strong>{claim.confidenceIndex}</strong>
          <span className="mono ash">/100</span>
        </span>
      </header>
      <p className="claim-text">{claim.text}</p>
      <p className="claim-rationale">{claim.rationale}</p>

      <div className="claim-block">
        <p className="mono ash">{t("sources")}</p>
        {claim.sources.length === 0 ? (
          <p className="ash">{t("noSource")}</p>
        ) : (
          <ul className="sources">
            {claim.sources.map((source) => (
              <li key={source.url}>
                <a href={source.url} target="_blank" rel="noopener noreferrer" className="source">
                  <span className="source-kind mono" data-kind={source.kind}>
                    {t(`kind.${source.kind}`)}
                  </span>
                  <span className="source-title">{source.title}</span>
                  <span className="source-meta mono ash">
                    {source.publisher}
                    {source.date ? ` · ${source.date}` : ""} · {t(`stance.${source.stance}`)} ↗
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      {claim.contradictions.length > 0 && (
        <div className="claim-block">
          <p className="mono ash">{t("contradictions")}</p>
          <ul className="bullets">
            {claim.contradictions.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      {claim.recommendedChecks.length > 0 && (
        <div className="claim-block">
          <p className="mono ash">{t("checks")}</p>
          <ul className="bullets">
            {claim.recommendedChecks.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      <footer className="claim-foot">
        <Why items={claim.breakdown} label={t("why")} />
        <div className="decision" role="group" aria-label={t("decision")}>
          {(["validate", "complete", "reject"] as const).map((d) => (
            <button key={d} type="button" className="decision-item mono" aria-pressed={decision === d} onClick={() => onDecide(decision === d ? null : d)}>
              {t(d)}
            </button>
          ))}
        </div>
      </footer>
    </motion.article>
  );
}

export function VerifyReport({
  data,
  decisions,
  onDecide,
  actions,
}: {
  data: VerifyTextSuccess;
  decisions: Record<string, Decision>;
  onDecide: (index: number, decision: Decision | null) => void;
  actions?: ReactNode;
}) {
  const t = useTranslations("verify");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const { result, meta, mock } = data;

  const toAngles = () => {
    const claims = result.claims.map((c) => ({ text: c.text, status: c.status }));
    window.sessionStorage.setItem(CLAIMS_HANDOFF_KEY, JSON.stringify(claims));
    router.push("/app/angles");
  };

  const toExperts = () => router.push(`/app/experts?topic=${encodeURIComponent(result.claims[0]?.text.slice(0, 300) ?? "")}`);

  return (
    <motion.section className="result" variants={stagger} initial="hidden" animate="show">
      <motion.div className="result-badges" variants={rise}>
        {mock && <Badge tone="accent">{tc("demo")}</Badge>}
        {meta.cached && <Badge>{tc("cached")}</Badge>}
        {meta.replayed && meta.recordedAt && (
          <Badge tone="warn">{tc("replayed", { date: new Date(meta.recordedAt).toLocaleDateString(locale) })}</Badge>
        )}
        {mock && <span className="mono ash">{tc("demoNote")}</span>}
      </motion.div>

      <motion.div className="result-top" variants={rise}>
        <IndexGauge value={result.globalIndex} label={t("globalIndex")} note={t("indexNote")} />
        <div className="result-summary">
          <p className="result-summary-text">{result.summary}</p>
          <p className="mono ash">{t("dropped", { count: meta.droppedSources })}</p>
          <Why items={result.globalBreakdown} label={t("why")} />
          <div className="handoff">
            <button type="button" className="ghost-button" onClick={toAngles} disabled={result.claims.length === 0}>
              {t("toAngles")} →
            </button>
            <button type="button" className="ghost-button" onClick={toExperts} disabled={result.claims.length === 0}>
              {t("toExperts")} →
            </button>
            {actions}
          </div>
        </div>
      </motion.div>

      <motion.h2 className="section-title" variants={rise}>
        {t("claims")}
      </motion.h2>
      {result.claims.length === 0 ? (
        <motion.p className="empty" variants={rise}>
          {t("empty")}
        </motion.p>
      ) : (
        <motion.div className="claims" variants={stagger}>
          {result.claims.map((claim, i) => (
            <ClaimCard
              key={`${i}-${claim.text}`}
              claim={claim}
              index={i}
              decision={decisions[String(i)] ?? null}
              onDecide={(d) => onDecide(i, d)}
            />
          ))}
        </motion.div>
      )}

      {result.limitations.length > 0 && (
        <motion.div className="limitations" variants={rise}>
          <p className="mono ash">{t("limitations")}</p>
          <ul className="bullets">
            {result.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </motion.div>
      )}
    </motion.section>
  );
}

export function VerifyScreen() {
  const t = useTranslations("verify");
  const tm = useTranslations("modules.verify");
  const tc = useTranslations("common");
  const tl = useTranslations("locale");
  const params = useSearchParams();
  const [mode, setMode] = useState<Mode>(() => (params.get("url") ? "url" : "text"));
  const [content, setContent] = useState(() => params.get("url") ?? "");
  const [lang, setLang] = useState<Language | "auto">("auto");
  const [phase, setPhase] = useState<Phase<VerifyTextSuccess>>({ kind: "idle" });
  const [stage, setStage] = useState(0);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [savedState, setSavedState] = useState<"idle" | "saved" | "failed">("idle");
  const router = useRouter();
  const stages = t.raw("stages") as string[];

  useEffect(() => {
    if (phase.kind !== "loading") return;
    const timer = window.setInterval(() => setStage((s) => Math.min(s + 1, stages.length - 1)), 2600);
    return () => window.clearInterval(timer);
  }, [phase.kind, stages.length]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = content.trim();
    if (!value) return;
    if (mode === "image") return;
    setStage(0);
    setDecisions({});
    setSavedState("idle");
    setPhase({ kind: "loading" });
    const res = await callApi("/api/verify/text", { content: value, type: mode, ...(lang === "auto" ? {} : { lang }) });
    if (res.ok) setPhase({ kind: "done", data: res });
    else setPhase({ kind: "error", code: res.error.code, retryAfter: res.retryAfterSeconds });
  };

  const busy = phase.kind === "loading";

  return (
    <div className="screen-grid">
      <ScreenHeader kicker={`${tm("state")}`} title={t("title")} lead={t("lead", { brand: BRAND_NAME })} />

      <motion.form className="panel form" onSubmit={submit} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.7, ease: [0.19, 1, 0.22, 1] }}>
        <div className="form-row">
          <Segmented
            label={t("title")}
            value={mode}
            onChange={(m) => {
              if (m === "image") {
                router.push("/app/image");
                return;
              }
              setMode(m);
              setContent("");
            }}
            options={[
              { value: "text", label: t("modeText") },
              { value: "url", label: t("modeUrl") },
              { value: "image", label: t("modeImage") },
            ]}
          />
          {mode === "text" && (
            <button type="button" className="link-button mono" onClick={() => setContent(t("example"))}>
              {tc("useExample")}
            </button>
          )}
        </div>

        <Field
          label={mode === "text" ? t("modeText") : t("modeUrl")}
          htmlFor="verify-content"
          hint={mode === "text" ? tc("characters", { count: content.length, max: MAX_TEXT }) : undefined}
        >
          {mode === "text" ? (
            <textarea
              id="verify-content"
              className="input textarea"
              value={content}
              maxLength={MAX_TEXT}
              rows={7}
              placeholder={t("placeholderText")}
              onChange={(e) => setContent(e.target.value)}
            />
          ) : (
            <input
              id="verify-content"
              className="input"
              type="url"
              inputMode="url"
              value={content}
              maxLength={2048}
              placeholder={t("placeholderUrl")}
              onChange={(e) => setContent(e.target.value)}
            />
          )}
        </Field>

        <div className="form-row form-row-end">
          <Field label={t("outputLang")} htmlFor="verify-lang">
            <select id="verify-lang" className="input select" value={lang} onChange={(e) => setLang(e.target.value as Language | "auto")}>
              <option value="auto">{t("auto")}</option>
              <option value="mg">{tl("mg")}</option>
              <option value="fr">{tl("fr")}</option>
              <option value="en">{tl("en")}</option>
            </select>
          </Field>
          <SubmitButton busy={busy} disabled={!content.trim()}>
            {t("submit")}
          </SubmitButton>
        </div>
      </motion.form>

      <AnimatePresence mode="wait">
        {phase.kind === "loading" && (
          <motion.div key="loading" className="panel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Stages stages={stages} active={stage} />
          </motion.div>
        )}
        {phase.kind === "error" && <ErrorNote key="error" code={phase.code} retryAfter={phase.retryAfter} />}
        {phase.kind === "done" && (
          <VerifyReport
            key="result"
            data={phase.data}
            decisions={decisions}
            onDecide={(index, d) => {
              setDecisions((current) => {
                const next = { ...current };
                if (d) next[String(index)] = d;
                else delete next[String(index)];
                return next;
              });
              setSavedState("idle");
            }}
            actions={
              <button
                type="button"
                className="ghost-button"
                disabled={savedState === "saved"}
                onClick={() => {
                  const saved = saveReport({
                    title: reportTitle(phase.data.result),
                    mode: mode === "url" ? "url" : "text",
                    mock: phase.data.mock,
                    result: phase.data.result,
                    meta: phase.data.meta,
                    decisions,
                  });
                  setSavedState(saved ? "saved" : "failed");
                }}
              >
                {savedState === "saved" ? t("saved") : savedState === "failed" ? t("saveFailed") : t("save")}
              </button>
            }
          />
        )}
      </AnimatePresence>
    </div>
  );
}
