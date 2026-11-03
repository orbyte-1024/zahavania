"use client";

import { AnimatePresence, motion } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { callForm, type Phase } from "@/components/workspace/requests";
import type { ImageEvidence, VerifyImageSuccess, VerifyVideoSuccess } from "@/lib/api/contract";
import { compressImage, ImageDecodeError, readDeviceExif, SOURCE_MAX_BYTES } from "@/lib/browser/image-prep";
import { extractKeyframes, VIDEO_SOURCE_MAX_BYTES, VideoTooLongError } from "@/lib/browser/video-prep";
import { VideoFindings } from "@/components/workspace/VideoFindings";
import { Badge, ErrorNote, ScreenHeader, SubmitButton, rise, stagger } from "@/components/workspace/ui";

type Evidence = ImageEvidence;

type Report = { kind: "image"; data: VerifyImageSuccess } | { kind: "video"; data: VerifyVideoSuccess };

type Progress = { stage: "preparing" } | { stage: "extracting"; done: number; total: number } | { stage: "analysing"; frames: number | null };

const IMAGE_ACCEPT = ["image/jpeg", "image/png", "image/webp"];
const VIDEO_ACCEPT = ["video/mp4", "video/webm", "video/quicktime"];
const ACCEPT = [...IMAGE_ACCEPT, ...VIDEO_ACCEPT];

function videoErrorCode(error: unknown): string {
  if (error instanceof VideoTooLongError) return "video_too_long";
  return "video_decode_failed";
}

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
  const [phase, setPhase] = useState<Phase<Report>>({ kind: "idle" });
  const [progress, setProgress] = useState<Progress>({ stage: "preparing" });
  const locale = useLocale();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const pick = (candidate: File | undefined) => {
    if (!candidate) return;
    if (!ACCEPT.includes(candidate.type)) {
      setPhase({ kind: "error", code: "unsupported_media", retryAfter: null });
      return;
    }
    const isVideo = VIDEO_ACCEPT.includes(candidate.type);
    if (candidate.size > (isVideo ? VIDEO_SOURCE_MAX_BYTES : SOURCE_MAX_BYTES)) {
      setPhase({ kind: "error", code: "image_too_large", retryAfter: null });
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

  const submitVideo = async (video: File) => {
    setProgress({ stage: "extracting", done: 0, total: 0 });
    const form = new FormData();
    try {
      const extracted = await extractKeyframes(video, (done, total) => setProgress({ stage: "extracting", done, total }));
      extracted.frames.forEach((frame, i) => form.append("frame", frame, `frame-${i}.jpg`));
      form.append("duration", String(extracted.duration));
      form.append("timestamps", JSON.stringify(extracted.timestamps));
      form.append("lang", locale);
      setProgress({ stage: "analysing", frames: extracted.frames.length });
    } catch (error) {
      setPhase({ kind: "error", code: videoErrorCode(error), retryAfter: null });
      return;
    }
    const res = await callForm<VerifyVideoSuccess>("/api/verify/video", form);
    if (res.ok) setPhase({ kind: "done", data: { kind: "video", data: res.data } });
    else setPhase({ kind: "error", code: res.code, retryAfter: res.retryAfter });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) return;
    setPhase({ kind: "loading" });
    if (VIDEO_ACCEPT.includes(file.type)) {
      await submitVideo(file);
      return;
    }
    setProgress({ stage: "preparing" });
    const form = new FormData();
    try {
      const exif = await readDeviceExif(file);
      const compressed = await compressImage(file);
      form.append("image", compressed, "photo.jpg");
      form.append("lang", locale);
      if (exif) form.append("exif", JSON.stringify(exif));
    } catch (error) {
      setPhase({ kind: "error", code: error instanceof ImageDecodeError ? "image_decode_failed" : "invalid_image", retryAfter: null });
      return;
    }
    setProgress({ stage: "analysing", frames: null });
    const res = await callForm<VerifyImageSuccess>("/api/verify/image", form);
    if (res.ok) setPhase({ kind: "done", data: { kind: "image", data: res.data } });
    else setPhase({ kind: "error", code: res.code, retryAfter: res.retryAfter });
  };

  const result = phase.kind === "done" ? phase.data : null;
  const report = result?.data ?? null;
  const fileIsVideo = file !== null && VIDEO_ACCEPT.includes(file.type);
  const progressText =
    progress.stage === "preparing"
      ? t("preparing")
      : progress.stage === "extracting"
        ? t("video.extracting", { done: progress.done, total: progress.total || 6 })
        : progress.frames
          ? t("video.analysing", { count: progress.frames })
          : t("analysing");

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
          {preview && fileIsVideo ? (
            <video key={preview} src={preview} className="dropzone-preview" muted playsInline controls preload="metadata" />
          ) : preview ? (
            <motion.img key={preview} src={preview} alt="" className="dropzone-preview" initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, ease: [0.19, 1, 0.22, 1] }} />
          ) : (
            <span className="dropzone-text">
              <span className="dropzone-title">{t("drop")}</span>
              <span className="mono ash">
                {t("or")} <u>{t("browse")}</u> · JPEG · PNG · WEBP · MP4 · WEBM
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
            <p className="mono ash" aria-live="polite">
              {progressText}
            </p>
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

            {result?.kind === "video" && <VideoFindings report={result.data} />}

            {result?.kind === "image" && (
              <motion.div className="claim-block" variants={rise}>
                <p className="mono ash">
                  {t("metadata")} · {t(`metadataSource.${result.data.metadataSource}`)}
                </p>
                {result.data.metadata.available ? (
                  <dl className="meta-table">
                    {(
                      [
                        ["dateTaken", result.data.metadata.dateTaken],
                        ["created", result.data.metadata.creationDate],
                        ["camera", result.data.metadata.camera],
                        ["software", result.data.metadata.software],
                      ] as const
                    ).map(([key, value]) =>
                      value ? (
                        <div key={key}>
                          <dt className="mono ash">{t(key)}</dt>
                          <dd>{value}</dd>
                        </div>
                      ) : null,
                    )}
                    {result.data.metadata.hasGPS && (
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
            )}

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
            <motion.div className="journalist-block" variants={rise} style={{ marginTop: "1.25rem", padding: "1rem", border: "1px solid var(--rule)", borderRadius: "6px", background: "var(--surface)" }}>
              <h3 className="mono" style={{ fontSize: "0.75rem", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "0.75rem" }}>Pour le journaliste : que faire maintenant ?</h3>
              <p style={{ fontSize: "0.95rem", lineHeight: 1.55, marginBottom: "0.75rem" }}>
                <strong>Indice de confiance : indicatif 0–100</strong> — jamais une probabilité. Basé sur : statut ({report.verification.status}), indépendance et fraîcheur des sources, contradictions repérées, éléments manquants.
              </p>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
                {["Valider", "Compléter", "Rejeter"].map((action) => (
                  <span key={action} style={{ padding: "0.35rem 0.7rem", border: "1px solid var(--ink)", borderRadius: "4px", fontSize: "0.85rem", fontWeight: 600 }} aria-label={action}>{action}</span>
                ))}
              </div>
              <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginBottom: "0.5rem" }}>
                Limites affichées ci-dessus : une image sans anomalie n’est pas “authentique”. Les sources sont cliquables (titre, domaine, date, URL). Vérifiez avant publication.
              </p>
              <p style={{ fontSize: "0.85rem", fontStyle: "italic" }}>
                Option — proposition d’angle / expert : consultez le profil suggéré dans le rapport ou contactez un expert du domaine (annuaire consentant, données fictives en démo).
              </p>
            </motion.div>

            <motion.div variants={rise}>
              <Badge>{result?.kind === "image" ? result.data.file.format.toUpperCase() : `${result?.data.frames.length ?? 0} × JPEG`}</Badge>
            </motion.div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
