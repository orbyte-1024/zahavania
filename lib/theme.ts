import { BRAND_SLUG } from "@/lib/brand";

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = `${BRAND_SLUG}:theme`;
export const THEME_ATTRIBUTE = "data-theme";
export const LIGHT_QUERY = "(prefers-color-scheme: light)";
const SWITCHING_ATTRIBUTE = "data-theme-switching";
const SWITCH_MS = 400;

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

export function resolveTheme(stored: string | null, prefersLight: boolean): Theme {
  if (isTheme(stored)) return stored;
  return prefersLight ? "light" : "dark";
}

export function themeInitScript(): string {
  return `(function(){var d=document.documentElement,s=null;try{s=window.localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})}catch(e){}var l=false;try{l=window.matchMedia(${JSON.stringify(LIGHT_QUERY)}).matches}catch(e){}var t=s==="light"||s==="dark"?s:l?"light":"dark";d.setAttribute(${JSON.stringify(THEME_ATTRIBUTE)},t);d.style.colorScheme=t})();`;
}

export function readStoredTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(value) ? value : null;
  } catch {
    return null;
  }
}

function storeTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    return;
  }
}

export function currentTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.getAttribute(THEME_ATTRIBUTE) === "light" ? "light" : "dark";
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return true;
  }
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (!prefersReducedMotion()) {
    root.setAttribute(SWITCHING_ATTRIBUTE, "");
    window.setTimeout(() => root.removeAttribute(SWITCHING_ATTRIBUTE), SWITCH_MS);
  }
  root.setAttribute(THEME_ATTRIBUTE, theme);
  root.style.colorScheme = theme;
}

export function chooseTheme(theme: Theme): void {
  storeTheme(theme);
  applyTheme(theme);
}

export function subscribeTheme(notify: () => void): () => void {
  const observer = new MutationObserver(notify);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: [THEME_ATTRIBUTE] });
  return () => observer.disconnect();
}
