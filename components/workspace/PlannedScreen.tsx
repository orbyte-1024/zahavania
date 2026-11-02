"use client";

import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { ModuleGlyph } from "@/components/ModuleGlyph";
import { Badge, ScreenHeader, rise, stagger } from "@/components/workspace/ui";

export function PlannedScreen({ id }: { id: "monitor" }) {
  const t = useTranslations(id);
  const tm = useTranslations(`modules.${id}`);
  const rules = t.raw("rules") as string[];

  return (
    <div className="screen-grid">
      <ScreenHeader need={tm("need")} title={t("title")} lead={t("lead")}>
        <Badge tone="warn">{tm("state")}</Badge>
      </ScreenHeader>
      <motion.section className="panel planned" variants={stagger} initial="hidden" animate="show">
        <motion.div className="planned-glyph" variants={rise}>
          <ModuleGlyph id={id} />
        </motion.div>
        <motion.div className="planned-body" variants={stagger}>
          <motion.p className="mono ash" variants={rise}>
            {t("rulesTitle")}
          </motion.p>
          <ol className="planned-rules">
            {rules.map((rule, i) => (
              <motion.li key={rule} variants={rise}>
                <span className="mono ash">{String(i + 1).padStart(2, "0")}</span>
                <span>{rule}</span>
              </motion.li>
            ))}
          </ol>
          <motion.p className="planned-next" variants={rise}>
            {t("next")}
          </motion.p>
        </motion.div>
      </motion.section>
    </div>
  );
}
