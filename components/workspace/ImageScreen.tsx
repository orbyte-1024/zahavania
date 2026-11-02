"use client";

import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { callLegacy, type Phase } from "@/components/workspace/requests";
import { Badge, ErrorNote, ScreenHeader, SubmitButton, rise, stagger } from "@/components/workspace/ui";

type Evidence = { provenance: "metadata" | "visualAnalysis" | "externalSource"; content: string; confidence: "low" | "medium" | "high" };

type ImageResponse = {
  ok: true;
  file: { format: string; size: number };
  metadata: { available: boolean; dateTaken: string | null; creationDate: string | null; camera: string | null; software: string | null; hasGPS: boolean } | null;
  reverseSearch: { googleLens: { name: string; url: string }; tineye: { name: string; url: string } };
  verification: {
    status: "indices concordants" | "indices contradictoires" | "non concluant";
    summary: string;
    supportingEvidence: Evidence[];
    contradictoryEvidence: Evidence[];
    limitations: string[];
  };
};

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = ["image/jpeg", "image/png", "image/webp"];

function EvidenceList({ title, items }: { title: string; items: Evidence[] }) {
  const t = useTranslations("image.provenance");
  if (items.length === 0) return null;
  return (
    <motion.div className="claim-block" variants={rise}>
      <p className="mono ash">{title}</p>
      <ul className="evidence">
        {items.map((item, i) => (
          <li key={`${item.provenance}-${i}`}>
            <span className="source-kind mono">{t(item.provenance)}</span>
            <span>{item.content}</span>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

export function ImageScreen() {
  const t = useTranslations("image");
  const tm = useTranslations("modules.image");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<Phase<ImageResponse>>({ kind: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const pick = (candidate: File | undefined) => {
    if (!candidate) return;
    if (!ACCEPT.includes(candidate.type) || candidate.size > MAX_BYTES) {
      setPhase({ kind: "error", code: "invalid_input", retryAfter: null });
      return;
    }
    setFile(candidate);
    setPreview(URL.createObjectURL(candidate));
    setPhase({ kind: "idle" });
  };

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    pick(event.dataTransfer.files[0]);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) return;
    setPhase({ kind: "loading" });
    const form = new FormData();
    form.append("image", file);
    const res = await callLegacy<ImageResponse>("/api/verify/image", { method: "POST", body: form });
    if (res.ok) setPhase({ kind: "done", data: res.data });
    else setPhase({ kind: "error", code: res.code, retryAfter: res.retryAfter });
  };

  const report = phase.kind === "done" ? phase.data : null;

  return (
    <div className="screen-grid">
      <ScreenHeader need={`${tm("need")} · ${tm("state")}`} title={t("title")} lead={t("lead")} />

      <motion.form className="panel form" onSubmit={submit} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.7, ease: [0.19, 1, 0.22, 1] }}>
        <label
          className="dropzone"
          data-dragging={dragging || undefined}
          data-filled={preview ? true : undefined}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <input ref={inputRef} type="file" accept={ACCEPT.join(",")} className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
          {preview ? (
            <motion.img key={preview} src={preview} alt="" className="dropzone-preview" initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, ease: [0.19, 1, 0.22, 1] }} />
          ) : (
            <span className="dropzone-text">
              <span className="dropzone-title">{t("drop")}</span>
              <span className="mono ash">
                {t("or")} <u>{t("browse")}</u> · JPEG · PNG · WEBP · 5 MB
              </span>
            </span>
          )}
        </label>
        <div className="form-row form-row-end">
          {preview ? (
            <button type="button" className="link-button mono" onClick={() => inputRef.current?.click()}>
              {t("change")}
            </button>
          ) : (
            <span />
          )}
          <SubmitButton busy={phase.kind === "loading"} disabled={!file}>
            {t("submit")}
          </SubmitButton>
        </div>
      </motion.form>

      <AnimatePresence mode="wait">
        {phase.kind === "loading" && (
          <motion.div key="loading" className="panel skeletons" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {[0, 1].map((i) => (
              <span key={i} className="skeleton" style={{ animationDelay: `${i * 120}ms` }} />
            ))}
          </motion.div>
        )}
        {phase.kind === "error" && <ErrorNote key="error" code={phase.code} retryAfter={phase.retryAfter} />}
        {report && (
          <motion.section key="done" className="result" variants={stagger} initial="hidden" animate="show">
            <motion.div className="verdict" variants={rise} data-verdict={report.verification.status}>
              <span className="mono ash">{t("summary")}</span>
              <p className="verdict-status">{t(`verdict.${report.verification.status}`)}</p>
              <p className="result-summary-text">{report.verification.summary}</p>
            </motion.div>

            <EvidenceList title={t("supporting")} items={report.verification.supportingEvidence} />
            <EvidenceList title={t("contradictory")} items={report.verification.contradictoryEvidence} />

            <motion.div className="claim-block" variants={rise}>
              <p className="mono ash">{t("metadata")}</p>
              {report.metadata?.available ? (
                <dl className="meta-table">
                  {(
                    [
                      ["dateTaken", report.metadata.dateTaken],
                      ["created", report.metadata.creationDate],
                      ["camera", report.metadata.camera],
                      ["software", report.metadata.software],
                    ] as const
                  ).map(([key, value]) =>
                    value ? (
                      <div key={key}>
                        <dt className="mono ash">{t(key)}</dt>
                        <dd>{value}</dd>
                      </div>
                    ) : null,
                  )}
                  {report.metadata.hasGPS && (
                    <div>
                      <dt className="mono ash">GPS</dt>
                      <dd>{t("gps")}</dd>
                    </div>
                  )}
                </dl>
              ) : (
                <p className="ash">{t("noExif")}</p>
              )}
            </motion.div>

            <motion.div className="claim-block" variants={rise}>
              <p className="mono ash">{t("reverse")}</p>
              <div className="handoff">
                {[report.reverseSearch.googleLens, report.reverseSearch.tineye].map((service) => (
                  <a key={service.url} className="ghost-button" href={service.url} target="_blank" rel="noopener noreferrer">
                    {service.name} ↗
                  </a>
                ))}
              </div>
              <p className="mono ash">{t("reverseNote")}</p>
            </motion.div>

            {report.verification.limitations.length > 0 && (
              <motion.div className="limitations" variants={rise}>
                <ul className="bullets">
                  {report.verification.limitations.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </motion.div>
            )}
            <motion.div variants={rise}>
              <Badge>{report.file.format.toUpperCase()}</Badge>
            </motion.div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
