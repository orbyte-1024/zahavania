"use client";

import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import type { Language, TranslateSuccess } from "@/lib/api/contract";
import { callApi, type Phase } from "@/components/workspace/requests";
import { Badge, ErrorNote, Field, ScreenHeader, SubmitButton } from "@/components/workspace/ui";

const LANGS: Language[] = ["mg", "fr", "en"];

export function TranslateScreen() {
  const t = useTranslations("translate");
  const tm = useTranslations("modules.translate");
  const tc = useTranslations("common");
  const tl = useTranslations("locale");
  const [from, setFrom] = useState<Language>("fr");
  const [to, setTo] = useState<Language>("mg");
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const [phase, setPhase] = useState<Phase<TranslateSuccess>>({ kind: "idle" });

  const swap = () => {
    setFrom(to);
    setTo(from);
    if (phase.kind === "done") {
      setText(phase.data.translatedText);
      setPhase({ kind: "idle" });
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim() || from === to) return;
    setPhase({ kind: "loading" });
    setCopied(false);
    const res = await callApi("/api/translate", { sourceLang: from, targetLang: to, text: text.trim() });
    if (res.ok) setPhase({ kind: "done", data: res });
    else setPhase({ kind: "error", code: res.error.code, retryAfter: res.retryAfterSeconds });
  };

  const copy = async () => {
    if (phase.kind !== "done") return;
    await navigator.clipboard.writeText(phase.data.translatedText);
    setCopied(true);
  };

  return (
    <div className="screen-grid">
      <ScreenHeader need={`${tm("need")} · ${tm("state")}`} title={t("title")} lead={t("lead")} />

      <motion.form className="panel form" onSubmit={submit} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.7, ease: [0.19, 1, 0.22, 1] }}>
        <div className="lang-pair">
          <Field label={t("from")} htmlFor="tr-from">
            <select id="tr-from" className="input select" value={from} onChange={(e) => setFrom(e.target.value as Language)}>
              {LANGS.map((l) => (
                <option key={l} value={l}>
                  {tl(l)}
                </option>
              ))}
            </select>
          </Field>
          <motion.button type="button" className="swap" aria-label={t("swap")} onClick={swap} whileTap={{ rotate: 180 }}>
            ⇄
          </motion.button>
          <Field label={t("to")} htmlFor="tr-to">
            <select id="tr-to" className="input select" value={to} onChange={(e) => setTo(e.target.value as Language)}>
              {LANGS.map((l) => (
                <option key={l} value={l}>
                  {tl(l)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label={tl(from)} htmlFor="tr-text" hint={tc("characters", { count: text.length, max: 5000 })}>
          <textarea id="tr-text" className="input textarea" rows={6} maxLength={5000} placeholder={t("placeholder")} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <div className="form-row form-row-end">
          <button type="button" className="link-button mono" onClick={() => setText(t("example"))}>
            {tc("useExample")}
          </button>
          <SubmitButton busy={phase.kind === "loading"} disabled={!text.trim() || from === to}>
            {t("submit")}
          </SubmitButton>
        </div>
      </motion.form>

      <AnimatePresence mode="wait">
        {phase.kind === "loading" && (
          <motion.div key="loading" className="panel skeletons" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <span className="skeleton" />
          </motion.div>
        )}
        {phase.kind === "error" && <ErrorNote key="error" code={phase.code} retryAfter={phase.retryAfter} />}
        {phase.kind === "done" && (
          <motion.section key="done" className="panel translation" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.19, 1, 0.22, 1] }}>
            <div className="form-row">
              <p className="mono ash">
                {t("result")} · {tl(phase.data.targetLang)}
              </p>
              {phase.data.needsReview && <Badge tone="warn">{t("review")}</Badge>}
              {phase.data.mock && <Badge tone="accent">{tc("demo")}</Badge>}
            </div>
            <p className="translation-text">{phase.data.translatedText}</p>
            <button type="button" className="link-button mono" onClick={copy}>
              {copied ? tc("copied") : tc("copy")}
            </button>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
