import { describe, expect, it } from "vitest";
import { MAX_IMAGE_BYTES } from "@/lib/image-intake";
import { reverseSearchLinks, type ReverseSearch } from "@/lib/reverse-search";
import { pngOfSize } from "../helpers/png";
import { fixture, formWith, postForm } from "../helpers/upload";

const GOOGLE_LENS = { name: "Google Lens", url: "https://lens.google.com/" };
const TINEYE = { name: "TinEye", url: "https://tineye.com/" };

async function upload(name: string, type = "image/jpeg", ip?: string) {
  const { status, body } = await postForm(
    formWith(fixture(name), name, type),
    ip,
  );
  return { status, body, raw: JSON.stringify(body) };
}

describe("lib/reverse-search", () => {
  it("returns the two expected destinations", () => {
    expect(reverseSearchLinks()).toEqual({
      googleLens: GOOGLE_LENS,
      tineye: TINEYE,
    });
  });

  it("hands out a copy, so one caller cannot alter the destinations", () => {
    const first = reverseSearchLinks();
    first.googleLens.url = "https://evil.example/";
    first.tineye.name = "corrompu";

    expect(reverseSearchLinks()).toEqual({
      googleLens: GOOGLE_LENS,
      tineye: TINEYE,
    });
  });
});

describe("POST /api/verify/image — reverse search links", () => {
  it("returns the links for a valid JPEG", async () => {
    const { status, body } = await upload("valid.jpg");
    expect(status).toBe(200);
    expect(body.reverseSearch).toEqual({ googleLens: GOOGLE_LENS, tineye: TINEYE });
  });

  it("returns the links for a valid PNG", async () => {
    const { body } = await upload("valid.png", "image/png");
    expect(body.reverseSearch.googleLens.url).toBe(GOOGLE_LENS.url);
    expect(body.reverseSearch.tineye.url).toBe(TINEYE.url);
  });

  it("returns the links for a valid WebP", async () => {
    const { body } = await upload("valid.webp", "image/webp");
    expect(body.reverseSearch.googleLens.url).toBe(GOOGLE_LENS.url);
    expect(body.reverseSearch.tineye.url).toBe(TINEYE.url);
  });

  it("returns the links even when the image has no EXIF", async () => {
    const { body } = await upload("valid.jpg");
    expect(body.metadata.available).toBe(false);
    expect(body.warnings[0].code).toBe("EXIF_UNAVAILABLE");
    expect(body.reverseSearch).toEqual({ googleLens: GOOGLE_LENS, tineye: TINEYE });
  });

  it("returns the links without touching the EXIF metadata", async () => {
    const { body } = await upload("exif-full.jpg");
    expect(body.metadata).toEqual({
      available: true,
      dateTaken: "2026:10:25 14:32:00",
      creationDate: "2026:10:26 09:15:00",
      camera: "Canon EOS 90D",
      software: "Adobe Photoshop 2025",
      hasGPS: true,
    });
    expect(body.reverseSearch).toEqual({ googleLens: GOOGLE_LENS, tineye: TINEYE });
  });

  it("keeps the links working when the EXIF block is unreadable", async () => {
    const { status, body } = await upload("exif-broken.jpg");
    expect(status).toBe(200);
    expect(body.warnings[0].code).toBe("EXIF_UNREADABLE");
    expect(body.reverseSearch).toEqual({ googleLens: GOOGLE_LENS, tineye: TINEYE });
  });

  it("carries no GPS data, even for an image that has coordinates", async () => {
    const { body, raw } = await upload("exif-gps-only.jpg");
    expect(body.metadata.hasGPS).toBe(true);

    const links = JSON.stringify(body.reverseSearch);
    expect(links).not.toMatch(/18\.9\d*|47\.5\d*|18,9|47,5/);
    expect(links).not.toMatch(/GPSLatitude|GPSLongitude|latitude|longitude/i);
    expect(raw).not.toMatch(/18\.9\d*|47\.5\d*/);
  });

  it("uses fixed HTTPS destinations without any user data", async () => {
    const { body } = await upload("exif-full.jpg");
    const { googleLens, tineye } = body.reverseSearch as ReverseSearch;
    for (const service of [googleLens, tineye]) {
      expect(service.url.startsWith("https://")).toBe(true);
      // No query string at all: no filename, no path from the client, nothing
      // that could carry the image or its metadata.
      expect(service.url).not.toContain("?");
      expect(service.url).not.toContain("#");
      expect(service.url).not.toContain("exif-full");
      expect(service.url).not.toContain("/api/");
      expect(() => new URL(service.url)).not.toThrow();
    }
  });

  it("ignores client fields and headers that try to change the destinations", async () => {
    const form = formWith(fixture("valid.jpg"), "photo.jpg", "image/jpeg");
    form.append("reverseSearch", '{"googleLens":{"url":"https://evil.example/"}}');
    form.append("url", "https://evil.example/");

    const { status, body } = await postForm(form);
    expect(status).toBe(200);
    expect(body.reverseSearch).toEqual({ googleLens: GOOGLE_LENS, tineye: TINEYE });
    expect(JSON.stringify(body)).not.toContain("evil.example");
  });

  it("never accepts a client-supplied destination in the request body", async () => {
    const { body, raw } = await upload("valid.jpg");
    expect(raw).not.toMatch(/evil\.example|javascript:|data:/i);
    expect(body.reverseSearch).toEqual({ googleLens: GOOGLE_LENS, tineye: TINEYE });
  });

  it("still returns the links when the image field is missing (400)", async () => {
    const form = new FormData();
    form.append("autre", "du texte");
    const { status, body } = await postForm(form);

    expect(status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.reverseSearch).toEqual({ googleLens: GOOGLE_LENS, tineye: TINEYE });
    expect(Object.keys(body).sort()).toEqual(["error", "ok", "reverseSearch"]);
  });

  it("still returns the links when the file is too large (413)", async () => {
    const bytes = pngOfSize(MAX_IMAGE_BYTES + 1);
    const { status, body } = await postForm(
      formWith(bytes, "trop-gros.png", "image/png"),
    );

    expect(status).toBe(413);
    expect(body.reverseSearch).toEqual({ googleLens: GOOGLE_LENS, tineye: TINEYE });
  });

  it("still returns the links when the format is unsupported (415)", async () => {
    const { status, body } = await upload("text-as.jpeg", "image/jpeg");

    expect(status).toBe(415);
    expect(body.reverseSearch).toEqual({ googleLens: GOOGLE_LENS, tineye: TINEYE });
    expect(Object.keys(body).sort()).toEqual(["error", "ok", "reverseSearch"]);
  });

  it("still returns the links when a corrupted image is rejected (400)", async () => {
    const { status, body } = await upload("truncated.png", "image/png");

    expect(status).toBe(400);
    expect(body.reverseSearch).toEqual({ googleLens: GOOGLE_LENS, tineye: TINEYE });
  });

  it("still returns the links when the rate limit is hit (429)", async () => {
    const ip = "203.0.113.42";
    const form = formWith(fixture("valid.jpg"), "photo.jpg", "image/jpeg");

    let last = await postForm(form, ip);
    for (let i = 0; i < 11 && last.status !== 429; i += 1) {
      last = await postForm(form, ip);
    }

    expect(last.status).toBe(429);
    expect(last.body.reverseSearch).toEqual({
      googleLens: GOOGLE_LENS,
      tineye: TINEYE,
    });
  });
});
