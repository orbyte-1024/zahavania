import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const rows = readFileSync(new URL("../LICENSES.md", import.meta.url), "utf8")
  .split("\n")
  .filter((line) => /^\|\s*[^\s|-]/.test(line) && !line.startsWith("| Paquet"))
  .map((line) => line.split("|")[1].trim());

test("every installed dependency is listed in LICENSES.md", () => {
  const listed = new Set(rows);
  const missing = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter((name) => !listed.has(name));
  assert.deepEqual(missing, []);
});

test("LICENSES.md has no duplicate and no package that is not installed", () => {
  assert.equal(new Set(rows).size, rows.length, "duplicate rows");
  const installed = new Set(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }));
  const fonts = rows.filter((name) => name.includes("Google Fonts"));
  const stray = rows.filter((name) => !installed.has(name) && !fonts.includes(name));
  assert.deepEqual(stray, []);
});
