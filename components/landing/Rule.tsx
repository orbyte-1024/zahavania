"use client";

import { useTranslations } from "next-intl";
import { useCallback, useRef } from "react";
import { useScene, type SceneFactory } from "@/components/landing/engine";
import { easeInOut, easeOut, pinnedProgress, seg } from "@/lib/motion/scroll";

export function Rule() {
  const t = useTranslations("landing.rule");
  const target = Number(t("figure"));
  const sectionRef = useRef<HTMLElement>(null);

  const factory = useCallback<SceneFactory>(
    (el) => {
      const glyph = el.querySelector<HTMLElement>("[data-glyph]");
      const text = el.querySelector<HTMLElement>("[data-text]");
      const rule = el.querySelector<HTMLElement>("[data-rule]");
      const name = el.querySelector<HTMLElement>("[data-name]");
      const figure = el.querySelector<HTMLElement>("[data-figure]");
      const value = el.querySelector<HTMLElement>("[data-value]");
      let last = "";

      const rise = (node: HTMLElement | null, k: number, distance: number) => {
        if (!node) return;
        node.style.opacity = k.toFixed(3);
        node.style.transform = `translateY(${((1 - k) * distance).toFixed(1)}px)`;
      };

      return {
        update({ rect, vh }) {
          const p = pinnedProgress(rect.top, rect.height, vh);
          rise(glyph, seg(p, 0.03, 0.15, easeOut), 28);
          rise(text, seg(p, 0.11, 0.36, easeOut), 32);
          if (rule) rule.style.transform = `scaleX(${seg(p, 0.38, 0.58, easeInOut).toFixed(4)})`;
          rise(name, seg(p, 0.52, 0.64, easeOut), 14);
          const f = seg(p, 0.58, 0.84, easeOut);
          if (figure) figure.style.opacity = Math.min(1, f * 3.5).toFixed(3);
          if (value && Number.isFinite(target)) {
            const next = Math.round(target * f).toString();
            if (next !== last) {
              value.textContent = next;
              last = next;
            }
          }
        },
      };
    },
    [target],
  );

  useScene(sectionRef, factory);

  return (
    <section ref={sectionRef} className="scene s-rule" id="rule" style={{ "--pin": 3 } as React.CSSProperties}>
      <div className="pin">
        <div className="q-stack">
          <span className="q-glyph" data-glyph aria-hidden="true">
            “
          </span>
          <blockquote className="q-block">
            <p className="q-text" data-text>
              {t("text")}
            </p>
          </blockquote>
          <div className="q-sign">
            <span className="q-rule" data-rule aria-hidden="true" />
            <div className="q-sign-row">
              <p className="q-name mono" data-name>
                {t("author")}
              </p>
              <p className="q-fig" data-figure>
                <span className="fig-val" data-value>
                  {t("figure")}
                </span>
                <span className="fig-unit">{t("unit")}</span>
                <span className="fig-ctx mono ash">{t("kicker")}</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
