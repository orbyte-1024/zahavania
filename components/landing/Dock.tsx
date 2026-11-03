"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type MouseEvent, type Ref } from "react";
import { LanguageMenu } from "@/components/LanguageMenu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useEngine } from "@/components/landing/engine";

const SECTIONS = [
  { id: "tools", key: "tools" },
  { id: "method", key: "method" },
  { id: "rule", key: "rule" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export function Dock({ wordmarkRef, wordmark }: { wordmarkRef: Ref<HTMLAnchorElement>; wordmark: string }) {
  const t = useTranslations("nav");
  const { engine, animated } = useEngine();
  const [active, setActive] = useState<SectionId | null>(null);
  const [compact, setCompact] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const progressRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const targets = SECTIONS.map((s) => document.getElementById(s.id)).filter((el): el is HTMLElement => el !== null);
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) visible.set(entry.target.id, entry.isIntersecting ? entry.intersectionRatio : 0);
        let best: SectionId | null = null;
        let ratio = 0;
        for (const s of SECTIONS) {
          const r = visible.get(s.id) ?? 0;
          if (r > ratio) {
            ratio = r;
            best = s.id;
          }
        }
        setActive(best);
      },
      { threshold: [0, 0.15, 0.35, 0.6] },
    );
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const progress = max > 0 ? window.scrollY / max : 0;
        if (progressRef.current) progressRef.current.style.transform = `scaleX(${progress.toFixed(4)})`;
        setCompact(window.scrollY > window.innerHeight * 0.08);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.body.classList.add("menu-open");
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.classList.remove("menu-open");
    };
  }, [menuOpen]);

  const jump = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    event.preventDefault();
    setMenuOpen(false);
    engine.scrollTo(target, animated && id === "method" ? window.innerHeight * 0.4 : 0);
  };

  return (
    <>
      <header className="dock" data-compact={compact || undefined}>
        <a ref={wordmarkRef} className="dock-wordmark" href="#top" onClick={(e) => jump(e, "top")}>
          {wordmark}
        </a>
        <nav className="dock-nav" aria-label={wordmark}>
          {SECTIONS.map((section) => (
            <a
              key={section.id}
              className="dock-link"
              href={`#${section.id}`}
              aria-current={active === section.id ? "true" : undefined}
              onClick={(e) => jump(e, section.id)}
            >
              {t(section.key)}
              {active === section.id && <motion.span layoutId="dock-underline" className="dock-underline" transition={{ type: "spring", stiffness: 420, damping: 36 }} />}
            </a>
          ))}
        </nav>
        <div className="dock-actions">
          <ThemeToggle className="dock-theme" />
          <LanguageMenu />
          <Link className="dock-cta" href="/app">
            {t("open")}
            <span aria-hidden="true">→</span>
          </Link>
          <button type="button" className="dock-menu mono" aria-expanded={menuOpen} aria-controls="dock-sheet" onClick={() => setMenuOpen(true)}>
            {t("menu")}
          </button>
        </div>
        <span className="dock-progress" aria-hidden="true">
          <span ref={progressRef} />
        </span>
      </header>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            id="dock-sheet"
            className="dock-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={t("menu")}
            initial={{ clipPath: "inset(0 0 100% 0)" }}
            animate={{ clipPath: "inset(0 0 0% 0)" }}
            exit={{ clipPath: "inset(0 0 100% 0)" }}
            transition={{ duration: 0.6, ease: [0.77, 0, 0.175, 1] }}
          >
            <div className="dock-sheet-head">
              <span className="dock-wordmark">{wordmark}</span>
              <button type="button" className="dock-menu mono" onClick={() => setMenuOpen(false)}>
                {t("close")}
              </button>
            </div>
            <nav className="dock-sheet-nav" aria-label={wordmark}>
              {SECTIONS.map((section, i) => (
                <motion.a
                  key={section.id}
                  href={`#${section.id}`}
                  className="dock-sheet-link"
                  onClick={(e) => jump(e, section.id)}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 + i * 0.07, duration: 0.6, ease: [0.19, 1, 0.22, 1] }}
                >
                  <span className="mono ash">{String(i + 1).padStart(2, "0")}</span>
                  {t(section.key)}
                </motion.a>
              ))}
            </nav>
            <LanguageMenu variant="list" />
            <ThemeToggle />
            <Link className="dock-cta dock-sheet-cta" href="/app">
              {t("open")}
              <span aria-hidden="true">→</span>
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
