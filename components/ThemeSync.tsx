"use client";

import { useEffect } from "react";
import { applyTheme, LIGHT_QUERY, readStoredTheme } from "@/lib/theme";

export function ThemeSync() {
  useEffect(() => {
    let media: MediaQueryList;
    try {
      media = window.matchMedia(LIGHT_QUERY);
    } catch {
      return;
    }
    const follow = (event: MediaQueryListEvent) => {
      if (readStoredTheme() === null) applyTheme(event.matches ? "light" : "dark");
    };
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
  }, []);
  return null;
}
