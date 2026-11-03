"use client";

import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import type { VerifyVideoSuccess, VideoObservation } from "@/lib/api/contract";
import { formatTimestamp } from "@/lib/video-frames";
import { rise } from "@/components/workspace/ui";

function ObservationGroup({ title, items }: { title: string; items: VideoObservation[] }) {
  const t = useTranslations("image.video");
  if (items.length === 0) return null;
  return (
    <motion.div className="claim-block" variants={rise}>
      <p className="mono ash">{title}</p>
      <ul className="evidence">
        {items.map((item) => (
          <li key={item.text}>
            <span className="source-kind mono">{t("seenAt", { times: item.timestamps.map(formatTimestamp).join(", ") })}</span>
            <span>{item.text}</span>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

export function VideoFindings({ report }: { report: VerifyVideoSuccess }) {
  const t = useTranslations("image.video");
  return (
    <>
      <motion.div className="claim-block" variants={rise}>
        <p className="mono ash">
          {t("frames")} · {t("counts", { analysed: report.analysedCount, total: report.frames.length, failed: report.failedCount })}
        </p>
        <ol className="evidence">
          {report.frames.map((frame) => (
            <li key={frame.timestamp}>
              <span className="source-kind mono">
                {t("at", { time: formatTimestamp(frame.timestamp) })} · {frame.status === "analysed" ? `✓ ${t("analysed")}` : `✕ ${t("failed")}`}
              </span>
              {frame.analysis && <span>{frame.analysis.description.text}</span>}
            </li>
          ))}
        </ol>
      </motion.div>
      <ObservationGroup title={t("inconsistencies")} items={report.observations.visualInconsistencies} />
      <ObservationGroup title={t("aiIndicators")} items={report.observations.possibleAIGenerationIndicators} />
      <ObservationGroup title={t("locationClues")} items={report.observations.locationClues} />
      <motion.p className="mono ash" variants={rise}>
        {t("note")}
      </motion.p>
    </>
  );
}
