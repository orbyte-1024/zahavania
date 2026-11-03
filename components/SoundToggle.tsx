"use client";

import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import { sound } from "@/lib/browser/sound";

const subscribe = (listener: () => void) => sound.subscribe(listener);
const enabledNow = () => sound.isEnabled();
const serverEnabled = () => false;

export function SoundToggle({ className = "" }: { className?: string }) {
  const t = useTranslations("nav.sound");
  const enabled = useSyncExternalStore(subscribe, enabledNow, serverEnabled);
  const label = t(enabled ? "toOff" : "toOn");

  return (
    <button
      type="button"
      className={`theme-toggle sound-toggle mono ${className}`}
      aria-pressed={enabled}
      aria-label={label}
      title={label}
      onClick={() => sound.setEnabled(!enabled)}
    >
      <span className="sound-toggle-mark" aria-hidden="true" data-on={enabled || undefined}>
        <i />
        <i />
        <i />
      </span>
      <span className="sound-toggle-text">{t(enabled ? "on" : "off")}</span>
    </button>
  );
}
