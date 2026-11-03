"use client";

import { gsap } from "gsap";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Dock } from "@/components/landing/Dock";
import { EngineProvider, useEngine } from "@/components/landing/engine";
import { Footer } from "@/components/landing/Footer";
import { Hero } from "@/components/landing/Hero";
import { Manifesto } from "@/components/landing/Manifesto";
import { Motto } from "@/components/landing/Motto";
import { Objections } from "@/components/landing/Objections";
import { Process } from "@/components/landing/Process";
import { Rule } from "@/components/landing/Rule";
import { Tools } from "@/components/landing/Tools";
import "@/components/landing/landing.css";
import { BRAND_NAME } from "@/lib/brand";

const WORDMARK = BRAND_NAME;
const HANDOFF_MS = 900;

function Chrome() {
  const { engine, animated } = useEngine();
  const loaderRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLElement>(null);
  const wordRef = useRef<HTMLParagraphElement>(null);
  const dockWordRef = useRef<HTMLAnchorElement>(null);
  const [loaderGone, setLoaderGone] = useState(false);

  useEffect(() => {
    const body = document.body;
    if (!animated) {
      body.classList.add("is-ready");
      const done = window.setTimeout(() => setLoaderGone(true), 0);
      return () => window.clearTimeout(done);
    }

    const bar = barRef.current;
    const word = wordRef.current;
    const loader = loaderRef.current;
    const timers: number[] = [];

    const tween = gsap.fromTo(
      bar,
      { scaleX: 0 },
      {
        scaleX: 1,
        duration: 0.7,
        ease: "power2.out",
        onComplete: () => {
          engine.measure();
          body.classList.add("handoff");
          const to = dockWordRef.current?.getBoundingClientRect();
          const from = word?.getBoundingClientRect();
          if (word && to && from && from.width && to.width) {
            const dx = to.left + to.width / 2 - (from.left + from.width / 2);
            const dy = to.top + to.height / 2 - (from.top + from.height / 2);
            word.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${(to.width / from.width).toFixed(4)})`;
          }
          body.classList.add("is-ready");
          loader?.classList.add("done");
          timers.push(
            window.setTimeout(() => {
              word?.classList.add("landed");
              body.classList.remove("handoff");
            }, HANDOFF_MS),
            window.setTimeout(() => setLoaderGone(true), 1400),
          );
        },
      },
    );

    return () => {
      tween.kill();
      timers.forEach((id) => window.clearTimeout(id));
      body.classList.remove("is-ready", "handoff");
    };
  }, [animated, engine]);

  return (
    <>
      {!loaderGone && (
        <div ref={loaderRef} className="loader" aria-hidden="true">
          <div className="loader-inner">
            <p ref={wordRef} className="loader-wordmark">
              {WORDMARK}
            </p>
            <span className="loader-rule">
              <i ref={barRef} />
            </span>
          </div>
        </div>
      )}

      <Dock wordmarkRef={dockWordRef} wordmark={WORDMARK} />
    </>
  );
}

export function Landing() {
  const t = useTranslations("nav");
  return (
    <EngineProvider>
      <a className="skip-link mono" href="#tools">
        {t("skip")}
      </a>
      <Chrome />
      <main className="landing">
        <Hero />
        <Manifesto />
        <Tools />
        <Motto />
        <Process />
        <Rule />
        <Objections />
        <Footer />
      </main>
    </EngineProvider>
  );
}
