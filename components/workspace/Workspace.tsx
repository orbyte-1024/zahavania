"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { LIVE_MODULES, MODULE_IDS, modulePath, type ModuleId } from "@/lib/modules";
import "@/components/workspace/workspace.css";

function ModuleNav({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations("modules");
  const pathname = usePathname();
  const active = MODULE_IDS.find((id) => pathname.startsWith(modulePath(id)));

  return (
    <ol className="rail-list">
      {MODULE_IDS.map((id: ModuleId) => {
        const current = id === active;
        return (
          <li key={id}>
            <Link
              href={modulePath(id)}
              className="rail-link"
              aria-current={current ? "page" : undefined}
              onClick={onNavigate}
            >
              {current && <motion.span layoutId="rail-active" className="rail-active" transition={{ type: "spring", stiffness: 380, damping: 34 }} />}
              <span className="rail-need mono">{t(`${id}.need`)}</span>
              <span className="rail-name">{t(`${id}.short`)}</span>
              <span className="rail-dot" data-live={LIVE_MODULES.has(id) || undefined} aria-hidden="true" />
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

function FilesLink({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations("files");
  const pathname = usePathname();
  const current = pathname.startsWith("/app/files");
  return (
    <Link href="/app/files" className="rail-link rail-files" aria-current={current ? "page" : undefined} onClick={onNavigate}>
      {current && <motion.span layoutId="rail-active" className="rail-active" transition={{ type: "spring", stiffness: 380, damping: 34 }} />}
      <span className="rail-need mono">{t("kicker")}</span>
      <span className="rail-name">{t("short")}</span>
      <span aria-hidden="true" />
    </Link>
  );
}

export function Workspace({ children }: { children: ReactNode }) {
  const t = useTranslations("workspace");
  const tn = useTranslations("nav");
  const [open, setOpen] = useState(false);

  return (
    <div className="workspace">
      <a className="skip-link mono" href="#screen">
        {tn("skip")}
      </a>

      <aside className="rail">
        <Link href="/" className="rail-wordmark">
          Checkeko
        </Link>
        <ModuleNav />
        <FilesLink />
        <div className="rail-foot">
          <LanguageSwitch />
        </div>
      </aside>

      <header className="topbar">
        <Link href="/" className="rail-wordmark">
          Checkeko
        </Link>
        <button type="button" className="topbar-menu mono" aria-expanded={open} onClick={() => setOpen(true)}>
          {t("menu")}
        </button>
      </header>

      <AnimatePresence>
        {open && (
          <motion.div
            className="sheet"
            initial={{ clipPath: "inset(0 0 100% 0)" }}
            animate={{ clipPath: "inset(0 0 0% 0)" }}
            exit={{ clipPath: "inset(0 0 100% 0)" }}
            transition={{ duration: 0.6, ease: [0.77, 0, 0.175, 1] }}
          >
            <div className="sheet-head">
              <Link href="/" className="rail-wordmark" onClick={() => setOpen(false)}>
                Checkeko
              </Link>
              <button type="button" className="topbar-menu mono" onClick={() => setOpen(false)}>
                {t("close")}
              </button>
            </div>
            <ModuleNav onNavigate={() => setOpen(false)} />
            <FilesLink onNavigate={() => setOpen(false)} />
            <div className="rail-foot">
              <LanguageSwitch />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="screen" id="screen">
        {children}
      </main>
    </div>
  );
}
