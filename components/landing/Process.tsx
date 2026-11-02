"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useRef } from "react";
import { HandOval } from "@/components/HandOval";
import { useScene, type SceneFactory } from "@/components/landing/engine";
import { createDraw } from "@/lib/motion/draw";
import { createGrow } from "@/lib/motion/grow";
import { easeInOut, easeOut, pinnedProgress, relayOpacity, seg } from "@/lib/motion/scroll";

type Step = { name: string; meta: string; desc: string };

const SLATS = 7;

export function Process() {
  const t = useTranslations("landing.process");
  const steps = t.raw("steps") as Step[];
  const sectionRef = useRef<HTMLElement>(null);

  const factory = useCallback<SceneFactory>(
    (el) => {
      const growEl = el.querySelector<HTMLElement>("[data-grow]");
      const grow = growEl ? createGrow(growEl) : null;
      const line = el.querySelector<HTMLElement>("[data-line]");
      const words = Array.from(el.querySelectorAll<HTMLElement>("[data-nw]"));
      const slats = Array.from(el.querySelectorAll<HTMLElement>("[data-slat]"));
      const bigNum = el.querySelector<HTMLElement>("[data-bignum]");
      const roll = el.querySelector<HTMLElement>("[data-roll]");
      const stepEls = Array.from(el.querySelectorAll<HTMLElement>("[data-step]"));
      const cta = el.querySelector<HTMLElement>("[data-cta]");
      const ovalPath = el.querySelector<SVGPathElement>("[data-cta] path");
      const oval = ovalPath ? createDraw(ovalPath) : null;
      const count = Math.max(stepEls.length - 1, 1);

      return {
        measure() {
          grow?.measure();
          oval?.measure();
        },
        update({ rect, vh }) {
          const p = pinnedProgress(rect.top, rect.height, vh);
          words.forEach((w, i) => {
            const k = seg(p, 0.01 + i * 0.024, 0.06 + i * 0.024, easeOut);
            w.style.opacity = k.toFixed(3);
            w.style.transform = `translateY(${((1 - k) * 16).toFixed(1)}px)`;
          });
          grow?.set(seg(p, 0.08, 0.3, easeInOut), 1 + seg(p, 0.3, 0.52, easeOut) * 0.18);

          slats.forEach((slat, i) => {
            const j = slats.length - 1 - i;
            const cover = seg(p, 0.3 + i * 0.005, 0.36 + i * 0.005, easeInOut);
            const clear = seg(p, 0.42 + j * 0.005, 0.48 + j * 0.005, easeInOut);
            slat.style.transformOrigin = clear > 0 ? "top" : "bottom";
            slat.style.transform = `scaleY(${(cover - clear).toFixed(4)})`;
          });
          if (line) line.style.opacity = p > 0.41 ? "0" : "1";

          const cont = seg(p, 0.5, 0.88) * count;
          const gate = seg(p, 0.335, 0.44);
          if (bigNum && roll) {
            bigNum.style.opacity = gate.toFixed(3);
            roll.style.transform = `translateY(${(-cont).toFixed(4)}em)`;
          }
          stepEls.forEach((step, i) => {
            const d = cont - i;
            step.style.opacity = (relayOpacity(d) * gate).toFixed(3);
            step.style.transform = `translateY(calc(-50% + ${(-d * 96).toFixed(1)}px))`;
          });

          const e = seg(p, 0.89, 0.94, easeOut);
          if (cta) {
            cta.style.opacity = e.toFixed(3);
            cta.style.transform = `translate(-50%, ${((1 - e) * 26).toFixed(1)}px)`;
          }
          oval?.set(1 - seg(p, 0.92, 0.99));
        },
      };
    },
    [],
  );

  useScene(sectionRef, factory);

  return (
    <section ref={sectionRef} className="scene s-process" style={{ "--pin": 9 } as React.CSSProperties}>
      <div className="pin">
        <div className="process-line" data-line>
          <span className="hl nw" data-nw>
            {t("introA")}
          </span>
          <span className="hl nw" data-nw>
            {t("introB")}
          </span>
          <span className="grow" data-grow aria-hidden="true">
            <span className="grow-inner claim-slab">
              <span className="claim-slab-text">{t("claim")}</span>
            </span>
          </span>
          <span className="hl nw" data-nw>
            {t("introC")}
          </span>
        </div>

        <div className="bignum" data-bignum aria-hidden="true">
          <span className="bignum-fixed">0</span>
          <span className="bignum-roll">
            <span data-roll>
              {steps.map((_, i) => (
                <i key={i}>{i + 1}</i>
              ))}
            </span>
          </span>
        </div>

        <ol className="psteps">
          {steps.map((step) => (
            <li key={step.meta} className="pstep" data-step>
              <span className="pstep-meta mono ash">{step.meta}</span>
              <h3>{step.name}</h3>
              <p>{step.desc}</p>
            </li>
          ))}
        </ol>

        <p className="steps-cta" data-cta>
          <Link href="/app/verify">
            {t("cta")}
            <HandOval className="hand-oval cta-oval" />
          </Link>
        </p>

        <div className="wipe" aria-hidden="true">
          {Array.from({ length: SLATS }, (_, i) => (
            <span key={i} data-slat />
          ))}
        </div>
      </div>
    </section>
  );
}
