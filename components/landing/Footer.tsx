"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

export function Footer() {
  const t = useTranslations("landing.footer");
  const tc = useTranslations("credits");
  const nameRef = useRef<HTMLHeadingElement>(null);
  const name = "Checkeko";

  useEffect(() => {
    const el = nameRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("in-view");
          observer.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <footer className="footer" id="contact">
      <p className="footer-kicker mono ash">{t("kicker")}</p>
      <Link className="footer-cta" href="/app">
        <span className="footer-cta-text">{t("cta")}</span> <span aria-hidden="true">→</span>
      </Link>
      <p className="footer-reassurance mono ash">{t("reassurance")}</p>
      <h2 ref={nameRef} className="footer-name" aria-label={name}>
        {Array.from(name).map((char, i) => (
          <span key={i} className="ch" aria-hidden="true">
            <span className="chi" style={{ "--i": i } as React.CSSProperties}>
              {char}
            </span>
          </span>
        ))}
      </h2>
      <div className="footer-bottom">
        <p className="mono ash">
          {t("left")} ·{" "}
          <Link className="footer-credits" href="/credits">
            {tc("link")}
          </Link>
        </p>
        <p className="mono">{t("middle")}</p>
        <p className="mono ash">{t("right")}</p>
      </div>
    </footer>
  );
}
