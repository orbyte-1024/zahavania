"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CloudState } from "@/components/landing/DispatchCloud";
import { useEngine, useScene, type SceneFactory } from "@/components/landing/engine";
import { createGrow } from "@/lib/motion/grow";
import { easeInOut, easeOut, mix, pinnedProgress, seg } from "@/lib/motion/scroll";

const DispatchCloud = dynamic(() => import("@/components/landing/DispatchCloud"), { ssr: false });

const FLOATERS = [
  { x: "-4%", y: "13%", w: 196, d: 0.55, image: "/landing/crime-scene.jpg", source: "https://commons.wikimedia.org/wiki/File:NYPD_Crime_Scene_Tape_004.jpg", credit: "Kidfly182 · CC BY 4.0" },
  { x: "21%", y: "3%", w: 150, d: 0.9, image: "/landing/corruption-kharkiv.jpg", source: "https://commons.wikimedia.org/wiki/File:Anticorruption_protests_in_Kharkiv_2025-07-23_-_26.jpg", credit: "Serhii Bobok · CC BY 4.0" },
  { x: "40%", y: "-6%", w: 224, d: 0.4, image: "/landing/corruption-manila.jpg", source: "https://commons.wikimedia.org/wiki/File:September_21_Baha_sa_Luneta_anti-corruption_protest_at_Mendiola.jpg", credit: "Kej Andrés · CC BY-SA 4.0" },
  { x: "63%", y: "7%", w: 140, d: 0.75, image: "/landing/cyclone-madagascar.jpg", source: "https://commons.wikimedia.org/wiki/File:Madagascar_Rova_ambohimanga_courtyard_cyclone_Giovanna_damage.JPG", credit: "Lemurbaby · CC BY-SA 3.0" },
  { x: "84%", y: "2%", w: 206, d: 1, image: "/landing/ballot-box.jpg", source: "https://commons.wikimedia.org/wiki/File:Ballot_box_of_czech_legislative_election_2010_in_T%C5%99eb%C3%AD%C4%8D,_T%C5%99eb%C3%AD%C4%8D_District.jpg", credit: "Jiří Sedláček · CC BY-SA 3.0" },
  { x: "-2%", y: "46%", w: 132, d: 0.5, image: "/landing/forest-fire.jpg", source: "https://commons.wikimedia.org/wiki/File:Black_forest_fire_smoke_rising_to_sky.jpg", credit: "Karen Murphy / USFWS · Public domain" },
  { x: "92%", y: "38%", w: 176, d: 0.7, image: "/landing/deforestation-madagascar.jpg", source: "https://commons.wikimedia.org/wiki/File:Cut_Forest,_Madagascar_(21794304082).jpg", credit: "Rod Waddington · CC BY-SA 2.0" },
  { x: "12%", y: "72%", w: 236, d: 0.35, image: "/landing/press-freedom.jpg", source: "https://commons.wikimedia.org/wiki/File:Photographers_protest_police_harassment,_Cairo_2007_-_001.jpg", credit: "Hossam el-Hamalawy · CC BY-SA 2.0" },
  { x: "44%", y: "82%", w: 146, d: 0.85, image: "/landing/water-pollution.jpg", source: "https://commons.wikimedia.org/wiki/File:Columbia_River_in_East_Wenatchee-_foamy_pollution.jpg", credit: "Thayne Tuason · CC BY 4.0" },
  { x: "72%", y: "66%", w: 192, d: 0.6, image: "/landing/flood-madagascar.jpg", source: "https://commons.wikimedia.org/wiki/File:Flooding_in_Madagascar_(MODIS).jpg", credit: "NASA GSFC · Public domain" },
] as const;

export function Hero() {
  const t = useTranslations("landing");
  const { animated } = useEngine();
  const labels = t.raw("floaters") as string[];
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
          {FLOATERS.map((f, i) => (
            <figure
              key={i}
              className="fl"
              data-floater
              data-d={f.d}
              style={{ "--x": f.x, "--y": f.y, "--w": `${f.w}px`, "--fi": i } as React.CSSProperties}
            >
              <a
                className="fl-image"
                href={f.source}
                target="_blank"
                rel="noreferrer"
                aria-label={`Photo source: ${labels[i]} — ${f.credit}`}
              >
                <Image src={f.image} alt="" fill sizes="(max-width: 480px) 144px, 240px" />
              </a>
              <figcaption className="fl-caption">
                <span className="fl-label mono">{labels[i]}</span>
                <span className="fl-credit mono">
                  {f.credit}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>

        <div className="hero-copy">
          <p className="hero-kicker mono" data-kicker>
            {t("kicker")}
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
