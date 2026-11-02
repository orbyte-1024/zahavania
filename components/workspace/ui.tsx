"use client";

import { animate, motion, useMotionValue, useTransform, type Variants } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, type ReactNode } from "react";
import type { ClaimStatus } from "@/lib/api/contract";

export const rise: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.19, 1, 0.22, 1] } },
};

export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

const STATUS_SYMBOL: Record<ClaimStatus, string> = {
  confirmed: "●",
  contradicted: "✕",
  needs_verification: "◐",
  insufficient: "○",
};

export function StatusChip({ status }: { status: ClaimStatus }) {
  const t = useTranslations("status");
  return (
    <span className="status-chip" data-status={status}>
      <span aria-hidden="true">{STATUS_SYMBOL[status]}</span>
      {t(status)}
    </span>
  );
}

export function ScreenHeader({ need, title, lead, children }: { need: string; title: string; lead: string; children?: ReactNode }) {
  return (
    <motion.header className="screen-head" variants={stagger} initial="hidden" animate="show">
      <motion.p className="mono ash" variants={rise}>
        {need}
      </motion.p>
      <motion.h1 className="screen-title" variants={rise}>
        {title}
      </motion.h1>
      <motion.p className="screen-lead" variants={rise}>
        {lead}
      </motion.p>
      {children}
    </motion.header>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" | "warn" }) {
  return (
    <span className="badge mono" data-tone={tone}>
      {children}
    </span>
  );
}

export function ErrorNote({ code, retryAfter }: { code: string; retryAfter?: number | null }) {
  const t = useTranslations("common");
  const key = `errors.${code}`;
  return (
    <motion.p className="error-note" role="alert" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <span aria-hidden="true">✕</span>
      <span>
        {t.has(key) ? t(key) : t("errors.internal_error")}
        {retryAfter ? ` ${t("retryIn", { seconds: retryAfter })}` : ""}
      </span>
    </motion.p>
  );
}

export function CountUp({ value, duration = 1.4 }: { value: number; duration?: number }) {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) => Math.round(v).toString());
  useEffect(() => {
    const controls = animate(count, value, { duration, ease: [0.19, 1, 0.22, 1] });
    return () => controls.stop();
  }, [count, value, duration]);
  return <motion.span>{rounded}</motion.span>;
}

export function IndexGauge({ value, label, note }: { value: number; label: string; note: string }) {
  const arc = "M 12 100 A 88 88 0 0 1 188 100";
  return (
    <div className="gauge">
      <svg viewBox="0 0 200 108" className="gauge-svg" aria-hidden="true">
        <path d={arc} className="gauge-track" />
        <motion.path
          d={arc}
          className="gauge-value"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: value / 100 }}
          transition={{ duration: 1.4, ease: [0.19, 1, 0.22, 1] }}
        />
      </svg>
      <div className="gauge-figure">
        <span className="gauge-number">
          <CountUp value={value} />
        </span>
        <span className="gauge-max mono ash">/ 100</span>
      </div>
      <p className="gauge-label">{label}</p>
      <p className="gauge-note mono ash">{note}</p>
    </div>
  );
}

export function Stages({ stages, active }: { stages: string[]; active: number }) {
  return (
    <ol className="stages" aria-live="polite">
      {stages.map((stage, i) => (
        <li key={stage} className="stage mono" data-state={i < active ? "done" : i === active ? "active" : "todo"}>
          <span className="stage-bar">
            <motion.i
              initial={{ scaleX: 0 }}
              animate={{ scaleX: i < active ? 1 : i === active ? 0.6 : 0 }}
              transition={{ duration: i === active ? 2.4 : 0.5, ease: [0.19, 1, 0.22, 1] }}
            />
          </span>
          {stage}
        </li>
      ))}
    </ol>
  );
}

export function Field({ label, htmlFor, children, hint }: { label: string; htmlFor: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="field">
      <label className="field-label mono" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint ? <p className="field-hint mono ash">{hint}</p> : null}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className="segmented-item mono"
          onClick={() => onChange(option.value)}
        >
          {option.value === value && <motion.span layoutId={`seg-${label}`} className="segmented-thumb" transition={{ type: "spring", stiffness: 420, damping: 36 }} />}
          <span className="segmented-text">{option.label}</span>
        </button>
      ))}
    </div>
  );
}

export function SubmitButton({ children, busy, disabled }: { children: ReactNode; busy: boolean; disabled?: boolean }) {
  return (
    <button type="submit" className="submit" disabled={busy || disabled} data-busy={busy || undefined}>
      <span>{children}</span>
      <span className="submit-arrow" aria-hidden="true">
        →
      </span>
    </button>
  );
}
