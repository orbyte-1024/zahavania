"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ModuleGlyph } from "@/components/ModuleGlyph";
import { ScreenHeader, rise, stagger } from "@/components/workspace/ui";
import { LIVE_MODULES, MODULE_IDS, modulePath } from "@/lib/modules";
import { BRAND_NAME_UPPER } from "@/lib/brand";

export function Overview() {
  const t = useTranslations();

  return (
    <div className="screen-grid">
      <ScreenHeader need={BRAND_NAME_UPPER} title={t("workspace.overviewTitle")} lead={t("workspace.overviewLead")} />
      <motion.ol className="overview" variants={stagger} initial="hidden" animate="show">
        {MODULE_IDS.map((id) => (
          <motion.li key={id} variants={rise}>
            <Link href={modulePath(id)} className="overview-card" data-live={LIVE_MODULES.has(id) || undefined}>
              <ModuleGlyph id={id} className="overview-glyph" />
              <span className="mono ash">
                {t(`modules.${id}.need`)} · {t(`modules.${id}.state`)}
              </span>
              <span className="overview-name">{t(`modules.${id}.name`)}</span>
              <span className="overview-desc">{t(`modules.${id}.desc`)}</span>
            </Link>
          </motion.li>
        ))}
      </motion.ol>
    </div>
  );
}
