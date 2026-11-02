"use client";

import { useTranslations } from "next-intl";
import { useCallback, useRef } from "react";
import { useScene, type SceneFactory } from "@/components/landing/engine";
import { clamp, mix, pinnedProgress, seg } from "@/lib/motion/scroll";

type MottoWord = { word: string; hint: string };

export function Motto() {
  const t = useTranslations("landing.motto");
  const words = t.raw("words") as MottoWord[];
  const sectionRef = useRef<HTMLElement>(null);

  const factory = useCallback<SceneFactory>(
    (el) => {
      const track = el.querySelector<HTMLElement>("[data-track]");
      const hint = el.querySelector<HTMLElement>("[data-hint]");
      if (!track || !hint) return null;
      let items: { el: HTMLElement; chars: HTMLElement[]; amps: number[]; center: number }[] = [];
      let active = -1;
      let timer = 0;

      return {
        measure() {
          items = Array.from(track.querySelectorAll<HTMLElement>(".mw")).map((word) => {
            const chars = Array.from(word.querySelectorAll<HTMLElement>(".sc"));
            return {
              el: word,
              chars,
              amps: chars.map((_, i) => (((i * 7919 + 31) % 13) - 6) / 6 || 0.45),
              center: word.offsetLeft + word.offsetWidth / 2,
            };
          });
        },
        update({ rect, vh, vw }) {
          if (!items.length) return;
          const p = pinnedProgress(rect.top, rect.height, vh);
          const x = vw / 2 - mix(items[0].center, items[items.length - 1].center, seg(p, 0.03, 0.97));
          track.style.transform = `translate(${x.toFixed(1)}px, -50%)`;
          let best = 0;
          let bestD = Infinity;
          items.forEach((item, wi) => {
            const rel = clamp((item.center + x - vw / 2) / vw, -1.3, 1.3);
            const d = Math.abs(rel);
            if (d < bestD) {
              bestD = d;
              best = wi;
            }
            item.el.style.opacity = (1 - Math.min(d * 1.1, 0.75)).toFixed(3);
            item.chars.forEach((c, i) => {
              c.style.transform = `translate3d(0, ${(item.amps[i] * rel * vh * 0.3).toFixed(1)}px, 0) rotate(${(item.amps[i] * rel * 6).toFixed(2)}deg)`;
            });
          });
          if (best !== active) {
            active = best;
            hint.classList.add("swap");
            window.clearTimeout(timer);
            timer = window.setTimeout(() => {
              hint.textContent = words[best]?.hint ?? "";
              hint.classList.remove("swap");
            }, 150);
          }
        },
      };
    },
    [words],
  );

  useScene(sectionRef, factory);

  return (
    <div className="band" id="method">
      <div className="diag to-accent" aria-hidden="true" />
      <section ref={sectionRef} className="scene s-motto" style={{ "--pin": 4 } as React.CSSProperties}>
        <div className="pin motto-pin">
          <p className="motto-kicker mono">{t("kicker")}</p>
          <div className="motto-track" data-track>
            {words.map((w) => (
              <span key={w.word} className="mw" aria-label={w.word}>
                {Array.from(w.word).map((c, i) => (
                  <span key={i} className="sc" aria-hidden="true">
                    {c}
                  </span>
                ))}
              </span>
            ))}
          </div>
          <p className="motto-hint mono" data-hint>
            {words[0]?.hint}
          </p>
          <ul className="motto-static">
            {words.map((w) => (
              <li key={w.word}>
                <strong>{w.word}</strong>
                <span className="mono">{w.hint}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <div className="diag from-accent" aria-hidden="true" />
    </div>
  );
}
