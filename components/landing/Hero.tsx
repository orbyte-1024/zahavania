"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CloudState } from "@/components/landing/DispatchCloud";
import { useEngine, useScene, type SceneFactory } from "@/components/landing/engine";
import { FLOATER_IMAGES } from "@/lib/landing-images";
import { createGrow } from "@/lib/motion/grow";
import { easeInOut, easeOut, mix, pinnedProgress, seg } from "@/lib/motion/scroll";
import { BRAND_NAME_UPPER } from "@/lib/brand";

const DispatchCloud = dynamic(() => import("@/components/landing/DispatchCloud"), { ssr: false });

const FLOATERS = [
  { x: "-4%", y: "13%", w: 196, d: 0.55 },
  { x: "21%", y: "3%", w: 150, d: 0.9 },
  { x: "37%", y: "9%", w: 210, d: 0.4 },
  { x: "63%", y: "7%", w: 140, d: 0.75 },
  { x: "84%", y: "2%", w: 206, d: 1 },
  { x: "-2%", y: "46%", w: 132, d: 0.5 },
  { x: "92%", y: "38%", w: 176, d: 0.7 },
  { x: "12%", y: "72%", w: 236, d: 0.35 },
  { x: "44%", y: "82%", w: 146, d: 0.85 },
  { x: "72%", y: "66%", w: 192, d: 0.6 },
] as const;

export function Hero() {
  const t = useTranslations("landing");
  const { animated } = useEngine();
  const labels = t.raw("floaters") as string[];
  const tc = useTranslations("credits");
  const positioning = t("positioning").split(" ");

  const sectionRef = useRef<HTMLElement>(null);
  const cloud = useRef<CloudState>({ progress: 0, mx: 0, my: 0, still: !animated });
  const [active, setActive] = useState(true);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setActive(entry.isIntersecting), { rootMargin: "20% 0px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const factory = useCallback<SceneFactory>((el) => {
    const growEl = el.querySelector<HTMLElement>("[data-grow]");
    const grow = growEl ? createGrow(growEl) : null;
    const kicker = el.querySelector<HTMLElement>("[data-kicker]");
    const line1 = el.querySelector<HTMLElement>("[data-line1]");
    const words = Array.from(el.querySelectorAll<HTMLElement>("[data-spot] span"));
    const floaters = Array.from(el.querySelectorAll<HTMLElement>("[data-floater]"));
    let dirs: { x: number; y: number; d: number; ex: number; ey: number }[] = [];

    return {
      measure() {
        grow?.measure();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        dirs = floaters.map((floater) => {
          const previous = floater.style.transform;
          floater.style.transform = "none";
          const r = floater.getBoundingClientRect();
          floater.style.transform = previous;
          const ex = r.left + r.width / 2 - vw / 2;
          const ey = r.top + r.height / 2 - vh / 2;
          const n = Math.max(1, Math.hypot(ex, ey));
          return { x: ex / n, y: (ey / n) * 1.5, d: Number(floater.dataset.d), ex, ey };
        });
      },
      update({ rect, vh, mx, my }) {
        const p = pinnedProgress(rect.top, rect.height, vh);
        cloud.current.progress = p;
        cloud.current.mx = mx;
        cloud.current.my = my;

        const enter = seg(p, 0, 0.17, easeOut);
        const drift = seg(p, 0.06, 0.46);
        const scale = mix(0.74, 1, enter) * mix(1, 1.22, drift);
        floaters.forEach((floater, i) => {
          const dir = dirs[i] ?? { x: 0, y: -1, d: 0.5, ex: 0, ey: 0 };
          const pull = (1 - enter) * 0.16;
          const dist = drift * (0.8 + dir.d) * vh * 1.15;
          const tx = -dir.ex * pull + dir.x * dist + mx * dir.d * 40;
          const ty = -dir.ey * pull + dir.y * dist + my * dir.d * 26;
          floater.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0) rotate(${(drift * dir.d * (i % 2 ? 8 : -8)).toFixed(2)}deg) scale(${scale.toFixed(3)})`;
        });

        if (kicker) kicker.style.opacity = String(1 - seg(p, 0.01, 0.1));
        if (line1) line1.style.opacity = String(1 - seg(p, 0.03, 0.15));
        const lift = seg(p, 0.05, 0.22, easeInOut);
        const g = seg(p, 0.26, 0.58, easeInOut);
        grow?.set(g, 1 + seg(p, 0.58, 1) * 0.06, Math.max(lift, g));

        const fade = seg(p, 0.84, 0.94);
        words.forEach((word, i) => {
          const k = seg(p, 0.5 + i * 0.022, 0.6 + i * 0.022, easeOut);
          word.style.opacity = (k * (1 - fade)).toFixed(3);
          word.style.transform = `translateY(${((1 - k) * 14).toFixed(1)}px)`;
        });
      },
    };
  }, []);

  useScene(sectionRef, factory);

  return (
    <section ref={sectionRef} className="scene s-hero" id="top" style={{ "--pin": 5 } as React.CSSProperties}>
      <div className="pin">
        <div className="floaters">
          {FLOATERS.map((f, i) => {
            const image = FLOATER_IMAGES[i];
            if (!image) return null;
            return (
              <figure
                key={image.file}
                className="fl"
                data-floater
                data-d={f.d}
                style={{ "--x": f.x, "--y": f.y, "--w": `${f.w}px`, "--fi": i } as React.CSSProperties}
              >
                <a
                  className="fl-image"
                  href={image.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={tc("photoBy", { label: labels[i], author: image.author, license: image.license })}
                >
                  <Image src={image.file} alt="" fill sizes="(max-width: 900px) 140px, 240px" priority={i < 4} />
                </a>
                <figcaption className="fl-caption">
                  <span className="fl-label mono">{labels[i]}</span>
                </figcaption>
              </figure>
            );
          })}
        </div>

        <div className="hero-copy">
          <p className="hero-kicker mono" data-kicker>
            {t("kicker", { brand: BRAND_NAME_UPPER })}
          </p>
          <h1 className="hero-title">
            <span className="hero-line1" data-line1>
              {t("line1")}
            </span>
            <span className="hero-line2">
              <span className="hl">{t("line2a")}</span>
              <span className="grow" data-grow aria-hidden="true">
                <span className="grow-inner grow-canvas">
                  <DispatchCloud state={cloud} active={active} />
                </span>
              </span>
              <span className="hl">{t("line2b")}</span>
            </span>
          </h1>
        </div>

        <div className="spot" aria-hidden="true">
          <p className="spot-intro" data-spot>
            {positioning.map((word, i) => (
              <span key={i}>{word} </span>
            ))}
          </p>
        </div>
      </div>
    </section>
  );
}
