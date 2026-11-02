"use client";

import { useTranslations } from "next-intl";
import { Fragment, useCallback, useRef } from "react";
import { HandOval } from "@/components/HandOval";
import { useScene, type SceneFactory } from "@/components/landing/engine";
import { createDraw } from "@/lib/motion/draw";
import { pinnedProgress, seg } from "@/lib/motion/scroll";

function Chars({ text }: { text: string }) {
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <>
      {words.map((word, i) => (
        <Fragment key={i}>
          <span className="fw">
            {Array.from(word).map((char, j) => (
              <span key={j} className="fc">
                {char}
              </span>
            ))}
          </span>{" "}
        </Fragment>
      ))}
    </>
  );
}

export function Manifesto() {
  const t = useTranslations("landing.manifesto");
  const sectionRef = useRef<HTMLElement>(null);

  const factory = useCallback<SceneFactory>((el) => {
    const text = el.querySelector<HTMLElement>("[data-fill]");
    const chars = Array.from(el.querySelectorAll<HTMLElement>(".fc"));
    const path = el.querySelector<SVGPathElement>("[data-box] path");
    const draw = path ? createDraw(path) : null;
    let last = 0;

    return {
      measure: () => draw?.measure(),
      update({ rect, vh }) {
        const p = pinnedProgress(rect.top, rect.height, vh);
        const idx = Math.round(seg(p, 0.05, 0.58) * chars.length);
        if (idx !== last) {
          const lo = Math.min(idx, last);
          const hi = Math.max(idx, last);
          for (let i = lo; i < hi; i += 1) chars[i].classList.toggle("on", i < idx);
          last = idx;
        }
        draw?.set(1 - seg(p, 0.46, 0.6));
        text?.classList.toggle("greyed", p > 0.7);
      },
    };
  }, []);

  useScene(sectionRef, factory);

  return (
    <section ref={sectionRef} className="scene s-fill" style={{ "--pin": 3.5 } as React.CSSProperties}>
      <div className="pin">
        <p className="fill-text" data-fill>
          <Chars text={t("before")} />
          <span className="boxed" data-box>
            <Chars text={t("boxed")} />
            <HandOval className="hand-oval box-svg" />
          </span>{" "}
          <Chars text={t("after")} />
        </p>
      </div>
    </section>
  );
}
