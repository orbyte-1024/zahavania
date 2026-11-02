import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("tests/fixtures are readable and correctly typed", () => {
  it("reads the expected byte signatures for the shared fixtures", () => {
    const fixtures = [
      { name: "valid.jpg", head: "ffd8ffe0" },
      { name: "valid.png", head: "89504e47" },
      { name: "valid.webp", head: "52494646" },
      { name: "text-as.jpeg", head: "74686973" },
    ];

    for (const f of fixtures) {
      const buf = readFileSync(resolve("tests/fixtures", f.name));
      const headHex = Array.from(buf.slice(0, 4))
        .map((v) => v.toString(16).padStart(2, "0"))
        .join("");
      expect(headHex).toBe(f.head);
    }
  });

  it("reads the PNG-only fixture without touching other fixtures", () => {
    const png = readFileSync(resolve("tests/fixtures", "png-version-only.png"));
    const headHex = Array.from(png.slice(0, 4))
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("");
    expect(headHex).toBe("89504e47");
  });
});
