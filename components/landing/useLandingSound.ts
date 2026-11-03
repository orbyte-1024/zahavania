"use client";

import { useEffect } from "react";
import { sound } from "@/lib/browser/sound";

const UNLOCK_EVENTS = ["pointerdown", "keydown", "touchend"] as const;

export function useLandingSound() {
  useEffect(() => {
    sound.init();
    const unlock = () => sound.unlock();
    UNLOCK_EVENTS.forEach((name) => window.addEventListener(name, unlock, { passive: true }));
    return () => UNLOCK_EVENTS.forEach((name) => window.removeEventListener(name, unlock));
  }, []);
}
