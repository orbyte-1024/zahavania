"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useRef } from "react";
import { ModuleGlyph } from "@/components/ModuleGlyph";
import { useScene, type SceneFactory } from "@/components/landing/engine";
import { easeOut, seg } from "@/lib/motion/scroll";
import { LIVE_MODULES, MODULE_IDS, modulePath } from "@/lib/modules";

export function Tools() {
  const t = useTranslations();
  const sectionRef = useRef<HTMLElement>(null);

  const factory = useCallback<SceneFactory>((el) => {
    const rows = Array.from(el.querySelectorAll<HTMLElement>("[data-arrive]")).map((row, i) => {
      const seed = ((i * 137 + 41) % 89) / 89;
      return {
        row,
        dx: (i % 2 ? 1 : -1) * (60 + seed * 110),
        dy: 140 + seed * 160,
        rot: (i % 3 === 0 ? 1 : -1) * (3 + seed * 5),
      };
    });

    return {
      update({ vh }) {
        for (const a of rows) {
          const top = a.row.getBoundingClientRect().top - (Number(a.row.dataset.shift) || 0);
          const k = 1 - seg(vh - top, 60, 60 + vh * 0.6, easeOut);
          a.row.dataset.shift = String(a.dy * k);
          a.row.style.transform = `translate3d(${(a.dx * k).toFixed(1)}px, ${(a.dy * k).toFixed(1)}px, 0) rotate(${(a.rot * k).toFixed(2)}deg)`;
        }
      },
    };
  }, []);

  useScene(sectionRef, factory);

  return (
    <section ref={sectionRef} className="tools" id="tools">
      <header className="tools-head">
        <p className="mono ash">{t("landing.toolsHead.kicker")}</p>
        <h2 className="tools-title">{t("landing.toolsHead.title")}</h2>
        <p className="tools-sub">{t("landing.toolsHead.sub")}</p>
        <p className="mono ash">{t("landing.toolsHead.meta")}</p>
      </header>

      <ol className="tools-list">
        {MODULE_IDS.map((id) => {
          const live = LIVE_MODULES.has(id);
          return (
            <li key={id} className="tool-row" data-arrive>
              <Link href={modulePath(id)} className="tool-link" data-live={live || undefined}>
                <ModuleGlyph id={id} className="tool-glyph" />
                <span className="tool-body">
                  <span className="tool-name">{t(`modules.${id}.name`)}</span>
                  <span className="tool-desc">{t(`modules.${id}.desc`)}</span>
                </span>
                <span className="tool-meta mono">
                  <span>{t(`modules.${id}.need`)}</span>
                  <span className={live ? "tool-state live" : "tool-state"}>{t(`modules.${id}.state`)}</span>
                </span>
                <span className="tool-arrow" aria-hidden="true">
                  →
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
