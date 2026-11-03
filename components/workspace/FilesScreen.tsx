"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState, useSyncExternalStore } from "react";
import { VerifyReport } from "@/components/workspace/VerifyScreen";
import { Badge, ScreenHeader, StatusChip, rise, stagger } from "@/components/workspace/ui";
import {
  parseReports,
  readRaw,
  removeReport,
  reportToText,
  subscribeReports,
  updateDecisions,
  type Decision,
  type SavedReport,
} from "@/lib/dossiers";
import { BRAND_SLUG } from "@/lib/brand";

const serverSnapshot = () => null;

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function ReportRow({ report }: { report: SavedReport }) {
  const t = useTranslations("files");
  const tv = useTranslations("verify");
  const ts = useTranslations("status");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const exportText = () =>
    download(
      `${BRAND_SLUG}-${report.savedAt.slice(0, 10)}.txt`,
      reportToText(report, {
        status: (s) => ts(s),
        decision: (d) => tv(d),
        globalIndex: tv("globalIndex"),
        sources: tv("sources"),
        limitations: tv("limitations"),
        savedOn: t("savedOn"),
      }),
    );

  const setDecision = (index: number, decision: Decision | null) => {
    const next = { ...report.decisions };
    if (decision) next[String(index)] = decision;
    else delete next[String(index)];
    updateDecisions(report.id, next);
  };

  return (
    <motion.li className="file" variants={rise} layout>
      <div className="file-head">
        <div className="file-summary">
          <p className="mono ash">
            {t("savedOn")} {new Date(report.savedAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}
            {report.mode === "url" ? ` · ${tv("modeUrl")}` : ""}
          </p>
          <p className="file-title">{report.title}</p>
          <div className="file-statuses">
            {report.result.claims.map((claim, i) => (
              <StatusChip key={i} status={claim.status} />
            ))}
            {report.mock && <Badge tone="accent">{tc("demo")}</Badge>}
          </div>
        </div>
        <p className="file-index">
          <strong>{report.result.globalIndex}</strong>
          <span className="mono ash">/100</span>
        </p>
      </div>
      <div className="file-actions">
        <button type="button" className="ghost-button" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? t("close") : t("open")}
        </button>
        <button type="button" className="ghost-button" onClick={exportText}>
          {t("export")}
        </button>
        {confirming ? (
          <>
            <button type="button" className="ghost-button danger" onClick={() => removeReport(report.id)}>
              {t("confirmDelete")}
            </button>
            <button type="button" className="link-button mono" onClick={() => setConfirming(false)}>
              {t("cancel")}
            </button>
          </>
        ) : (
          <button type="button" className="link-button mono" onClick={() => setConfirming(true)}>
            {t("delete")}
          </button>
        )}
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="file-report"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.55, ease: [0.19, 1, 0.22, 1] }}
            style={{ overflow: "hidden" }}
          >
            <VerifyReport
              data={{ ok: true, mock: report.mock, result: report.result, meta: report.meta }}
              decisions={report.decisions}
              onDecide={setDecision}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

export function FilesScreen() {
  const t = useTranslations("files");
  const raw = useSyncExternalStore(subscribeReports, readRaw, serverSnapshot);
  const reports = useMemo(() => parseReports(raw), [raw]);

  return (
    <div className="screen-grid">
      <ScreenHeader kicker={t("kicker")} title={t("title")} lead={t("lead")} />
      {reports.length === 0 ? (
        <motion.div className="panel empty-state" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <p>{t("empty")}</p>
          <Link className="ghost-button" href="/app/verify">
            {t("start")} →
          </Link>
        </motion.div>
      ) : (
        <motion.ol className="files" variants={stagger} initial="hidden" animate="show">
          {reports.map((report) => (
            <ReportRow key={report.id} report={report} />
          ))}
        </motion.ol>
      )}
    </div>
  );
}
