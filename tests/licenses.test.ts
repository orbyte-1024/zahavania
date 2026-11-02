import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("LICENSES.md", () => {
  it("documents the image-analysis dependencies", () => {
    const licenses = readFileSync(new URL("../LICENSES.md", import.meta.url), "utf8");

    expect(licenses).toContain("exifr");
    expect(licenses).toContain("image-size");
    expect(licenses).toContain("sharp");
  });
});
