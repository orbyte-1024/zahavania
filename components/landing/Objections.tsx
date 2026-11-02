"use client";

import { gsap } from "gsap";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef } from "react";
import { HandOval } from "@/components/HandOval";
import { useEngine, useScene, type SceneFactory } from "@/components/landing/engine";
import { createDraw } from "@/lib/motion/draw";
import { pinnedProgress, seg } from "@/lib/motion/scroll";

const POOL = 18;

export function Objections() {
  const t = useTranslations("landing.objections");
  const items = t.raw("items") as string[];
  const trail = t.raw("trail") as string[];
  const { animated } = useEngine();
  const sectionRef = useRef<HTMLElement>(null);
  const trailRef = useRef<HTMLDivElement>(null);

  const factory = useCallback<SceneFactory>((el) => {
    const lines = Array.from(el.querySelectorAll<HTMLElement>("[data-fs]"));
    const path = el.querySelector<SVGPathElement>("[data-pill] path");
    const draw = path ? createDraw(path) : null;
    return {
      measure: () => draw?.measure(),
      update({ rect, vh }) {
        const p = pinnedProgress(rect.top, rect.height, vh);
        [0.08, 0.2, 0.34, 0.52].forEach((threshold, i) => lines[i]?.classList.toggle("on", p > threshold));
        draw?.set(1 - seg(p, 0.56, 0.72));
      },
    };
  }, []);

  useScene(sectionRef, factory);

  useEffect(() => {
    const section = sectionRef.current;
    const layer = trailRef.current;
    if (!section || !layer || !animated) return;
    if (window.matchMedia("(hover: none), (pointer: coarse)").matches) return;

    const nodes = Array.from(layer.children) as HTMLElement[];
    let index = 0;
    let z = 10;
    let acc = 0;
    let lastX: number | null = null;
    let lastY: number | null = null;

    const onMove = (event: PointerEvent) => {
      const r = section.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) {
        lastX = lastY = null;
        return;
      }
      if (lastX === null || lastY === null) {
        lastX = event.clientX;
        lastY = event.clientY;
        return;
      }
      acc += Math.hypot(event.clientX - lastX, event.clientY - lastY);
      lastX = event.clientX;
      lastY = event.clientY;
      if (acc < 42) return;
      acc = 0;
      const pin = layer.getBoundingClientRect();
      const node = nodes[index % nodes.length];
      index += 1;
      const rotation = ((index * 47) % 17) - 8;
      node.style.zIndex = String((z += 1));
      gsap.killTweensOf(node);
      gsap.set(node, { x: event.clientX - pin.left, y: event.clientY - pin.top, xPercent: -50, yPercent: -50, rotation });
      gsap
        .timeline()
        .fromTo(node, { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.5, ease: "expo.out" })
        .to(node, { opacity: 0, scale: 0.94, duration: 1, ease: "power2.in" }, 2.2);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [animated]);

  return (
    <section ref={sectionRef} className="scene s-final" style={{ "--pin": 2.6 } as React.CSSProperties}>
      <div className="pin">
        <p className="final-text">
          {items.map((item) => (
            <span key={item} className="fs" data-fs>
              {item}{" "}
            </span>
          ))}
          <br />
          <span className="fs" data-fs>
            {t("finale")}{" "}
            <span className="pill" data-pill>
              {t("pill")}
              <HandOval className="hand-oval pill-svg" />
            </span>
          </span>
        </p>
        <div ref={trailRef} className="trail" aria-hidden="true">
          {Array.from({ length: POOL }, (_, i) => (
            <span key={i} className="trail-slip mono" data-tone={i % 3}>
              {trail[i % trail.length]}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
