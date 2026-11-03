import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const { resolveTheme, themeInitScript, THEME_STORAGE_KEY } = await import("../lib/theme.ts");

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

function block(selector) {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `missing ${selector}`);
  return css.slice(start, css.indexOf("\n}", start));
}

function tokens(text) {
  return Object.fromEntries([...text.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

const dark = tokens(block(":root"));
const light = tokens(block(':root[data-theme="light"]'));

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const f = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function runInit({ stored, prefersLight, storageThrows = false, mediaThrows = false }) {
  const attributes = {};
  const documentElement = { style: {}, setAttribute: (k, v) => (attributes[k] = v) };
  const window = {
    localStorage: {
      getItem: (key) => {
        if (storageThrows) throw new Error("blocked");
        return key === THEME_STORAGE_KEY ? stored ?? null : null;
      },
    },
    matchMedia: () => {
      if (mediaThrows) throw new Error("unsupported");
      return { matches: prefersLight };
    },
  };
  vm.runInNewContext(themeInitScript(), { window, document: { documentElement } });
  return { theme: attributes["data-theme"], colorScheme: documentElement.style.colorScheme };
}

test("a stored choice wins, otherwise the system preference decides", () => {
  assert.equal(resolveTheme("light", false), "light");
  assert.equal(resolveTheme("dark", true), "dark");
  assert.equal(resolveTheme(null, true), "light");
  assert.equal(resolveTheme("sepia", false), "dark");
});

test("the inline script sets the theme before first paint", () => {
  assert.deepEqual(runInit({ stored: "light", prefersLight: false }), { theme: "light", colorScheme: "light" });
  assert.deepEqual(runInit({ stored: null, prefersLight: true }), { theme: "light", colorScheme: "light" });
  assert.deepEqual(runInit({ stored: "garbage", prefersLight: false }), { theme: "dark", colorScheme: "dark" });
});

test("the inline script survives blocked storage and missing matchMedia", () => {
  assert.equal(runInit({ storageThrows: true, prefersLight: true }).theme, "light");
  assert.equal(runInit({ stored: null, mediaThrows: true }).theme, "dark");
});

test("every color token of the dark theme has a light value", () => {
  const colorTokens = Object.entries(dark)
    .filter(([, value]) => /^#|^\d+,\s*\d+,\s*\d+$|^rgba\(/.test(value))
    .map(([name]) => name);
  const missing = colorTokens.filter((name) => !(name in light) && !/^ink-(faint|hair)$/.test(name));
  assert.deepEqual(missing, []);
});

test("light theme text and the four statuses meet WCAG AA on every background", () => {
  const backgrounds = ["bone", "surface", "surface-2"];
  const foregrounds = ["ink", "ash", "accent", "accent-deep", "accent-soft", "st-confirmed", "st-contradicted", "st-needs", "st-insufficient"];
  for (const fg of foregrounds) {
    for (const bg of backgrounds) {
      const ratio = contrast(light[fg], light[bg]);
      assert.ok(ratio >= 4.5, `${fg} on ${bg}: ${ratio.toFixed(2)}`);
    }
  }
  for (const bg of ["accent", "accent-deep"]) {
    assert.ok(contrast(light["accent-ink"], light[bg]) >= 4.5, `accent-ink on ${bg}`);
  }
});

test("dark theme: #221811 only as the page, every reading surface at WCAG AA", () => {
  assert.equal(dark.bone, "#221811");
  const uses = Object.entries(dark).filter(([, value]) => value.toLowerCase() === "#221811").map(([name]) => name);
  assert.deepEqual(uses, ["bone"]);
  for (const name of ["surface", "surface-2", "chrome", "field"]) assert.notEqual(dark[name], dark.bone, name);
  const foregrounds = ["ink", "ash", "accent", "accent-soft", "st-confirmed", "st-contradicted", "st-needs", "st-insufficient"];
  for (const fg of foregrounds) {
    for (const bg of ["bone", "surface", "surface-2", "chrome", "field"]) {
      const ratio = contrast(dark[fg], dark[bg]);
      assert.ok(ratio >= 4.5, `${fg} on ${bg}: ${ratio.toFixed(2)}`);
    }
  }
  for (const bg of ["accent", "accent-deep"]) {
    assert.ok(contrast(dark["accent-ink"], dark[bg]) >= 4.5, `accent-ink on ${bg}`);
  }
});

test("paper slips stay light in both themes, loose, sorted, sourced or far in the fog", () => {
  for (const theme of [dark, light]) {
    for (const name of ["scene-paper", "scene-dim", "scene-accent", "scene-fog"]) {
      assert.ok(luminance(theme[name]) >= 0.35, `${name} ${theme[name]} is too dark`);
    }
  }
  assert.ok(contrast(dark["scene-paper"], dark.bone) >= 10, "loose slips on the dark page");
  assert.ok(contrast(dark["scene-dim"], dark.bone) >= 10, "sorted slips on the dark page");
  assert.ok(contrast(dark["scene-accent"], dark.bone) >= 7, "sourced slips on the dark page");
  assert.ok(contrast(light["scene-accent"], light.bone) >= 2, "sourced slips on the light page");
});

test("stylesheets and the 3D scene use theme variables instead of literal colors", () => {
  const literal = /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/;
  for (const path of ["../components/workspace/workspace.css", "../components/landing/landing.css", "../components/credits.css"]) {
    const lines = readFileSync(new URL(path, import.meta.url), "utf8").split("\n").filter((line) => literal.test(line));
    assert.deepEqual(lines, [], path);
  }
  const scene = readFileSync(new URL("../components/landing/DispatchCloud.tsx", import.meta.url), "utf8");
  assert.match(scene, /--scene-paper/);
  assert.doesNotMatch(scene, /args=\{\["#/);
});
