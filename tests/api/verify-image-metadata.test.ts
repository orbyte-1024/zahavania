import { afterEach, describe, expect, it, vi } from "vitest";
import { formWith, fixture, postForm } from "../helpers/upload";

const METADATA_KEYS = [
  "available",
  "camera",
  "creationDate",
  "dateTaken",
  "hasGPS",
  "software",
];

async function upload(name: string, type = "image/jpeg") {
  const { status, body } = await postForm(formWith(fixture(name), name, type));
  return { status, body, raw: JSON.stringify(body) };
}

/** Coordinates, their decimal form (18.92 / 47.53) and parser internals must never surface. */
function expectNoCoordinates(raw: string) {
  expect(raw).not.toMatch(/GPSLatitude|GPSLongitude/i);
  expect(raw).not.toMatch(/"latitude"|"longitude"/i);
  expect(raw).not.toMatch(/18\.9\d*/);
  expect(raw).not.toMatch(/47\.5\d*/);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/verify/image — EXIF metadata", () => {
  it("extracts every targeted field from a JPEG that has them", async () => {
    const { status, body, raw } = await upload("exif-full.jpg");

    expect(status).toBe(200);
    expect(body.metadata).toEqual({
      available: true,
      dateTaken: "2026:10:25 14:32:00",
      creationDate: "2026:10:26 09:15:00",
      camera: "Canon EOS 90D",
      software: "Adobe Photoshop 2025",
      hasGPS: true,
    });
    expect(body.warnings.filter((w: { code: string }) => w.code !== "ANALYSE_IA_NON_DISPONIBLE")).toEqual([]);
    expect(Object.keys(body.metadata).sort()).toEqual(METADATA_KEYS);
    expectNoCoordinates(raw);
    expect(raw).not.toContain("exif-full");
  });
  it("keeps EXIF dates as stored, with no timezone conversion", async () => {
    const { body } = await upload("exif-full.jpg");
    expect(body.metadata.dateTaken).toBe("2026:10:25 14:32:00");
    expect(body.metadata.creationDate).toBe("2026:10:26 09:15:00");
  });
  it("reports absence of metadata without blaming the image", async () => {
    const { status, body } = await upload("valid.jpg");
    expect(status).toBe(200);
    expect(body.metadata).toEqual({
      available: false,
      dateTaken: null,
      creationDate: null,
      camera: null,
      software: null,
      hasGPS: false,
    });
    expect(body.warnings.filter((w: { code: string }) => w.code !== "ANALYSE_IA_NON_DISPONIBLE")).toHaveLength(1);
    expect(body.warnings[0].code).toBe("EXIF_UNAVAILABLE");
    const exifWarning = body.warnings.find((w: { code: string }) => w.code !== "ANALYSE_IA_NON_DISPONIBLE");
    if (exifWarning) {
      expect(exifWarning.message).toContain("WhatsApp");
      expect(exifWarning.message).toContain("ne constitue pas un indice de falsification");
    }
    // Les routes existantes peuvent inclure le mot « statut » dans le résumé de
    // vérification ; on vérifie uniquement que le message EXIF n'introduit pas
    // un nouveau vocabulaire d'accusation.
    const exifMsg = body.warnings.find((w: { code: string }) => w.code === "EXIF_UNAVAILABLE")?.message;
    if (exifMsg) expect(exifMsg).not.toMatch(/suspect|suspicion/i);
  });

  it("handles a PNG without EXIF", async () => {
    const { status, body } = await upload("valid.png", "image/png");
    expect(status).toBe(200);
    expect(body.file.format).toBe("image/png");
    expect(body.metadata.available).toBe(false);
    expect(body.warnings[0].code).toBe("EXIF_UNAVAILABLE");
  });

  it("handles a WebP without EXIF", async () => {
    const { status, body } = await upload("valid.webp", "image/webp");
    expect(status).toBe(200);
    expect(body.file.format).toBe("image/webp");
    expect(body.metadata.available).toBe(false);
    expect(body.warnings[0].code).toBe("EXIF_UNAVAILABLE");
  });

  it("keeps a camera with only Make", async () => {
    const { body } = await upload("exif-make-only.jpg");
    expect(body.metadata.camera).toBe("Nikon");
    expect(body.metadata.available).toBe(true);
    expect(body.metadata.dateTaken).toBeNull();
  });

  it("keeps a camera with only Model", async () => {
    const { body } = await upload("exif-model-only.jpg");
    expect(body.metadata.camera).toBe("ILCE-7M3");
    expect(body.metadata.available).toBe(true);
  });

  it("extracts the software", async () => {
    const { body } = await upload("exif-software.jpg");
    expect(body.metadata.software).toBe("GIMP 2.10");
    expect(body.metadata.camera).toBeNull();
  });

  it("extracts DateTimeOriginal alone", async () => {
    const { body } = await upload("exif-taken-only.jpg");
    expect(body.metadata.dateTaken).toBe("2026:10:25 14:32:00");
    expect(body.metadata.creationDate).toBeNull();
    expect(body.metadata.available).toBe(true);
  });

  it("extracts CreateDate alone, without confusing it with the capture date", async () => {
    const { body } = await upload("exif-created-only.jpg");
    expect(body.metadata.creationDate).toBe("2026:10:26 09:15:00");
    expect(body.metadata.dateTaken).toBeNull();
  });

  it("signals GPS presence without ever returning coordinates", async () => {
    const { status, body } = await upload("exif-gps-only.jpg");
    expect(status).toBe(200);
    expect(body.metadata).toEqual({
      available: true,
      dateTaken: null,
      creationDate: null,
      camera: null,
      software: null,
      hasGPS: true,
    });
    expect(body.metadata.latitude).toBeUndefined();
    expectNoCoordinates(JSON.stringify(body));
  });

  it("sets hasGPS to false for an image without coordinates", async () => {
    const { body } = await upload("valid.jpg");
    expect(body.metadata.hasGPS).toBe(false);
  });

  it("degrades on a broken metadata block, without leaking or logging details", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { status, body } = await upload("exif-broken.jpg");

    expect(status).toBe(200);
    expect(body.metadata.available).toBe(false);
    expect(body.metadata.hasGPS).toBe(false);
    const unreadableWarning = body.warnings.find((w: { code: string }) => w.code !== "ANALYSE_IA_NON_DISPONIBLE");
    expect(unreadableWarning?.code).toBe("EXIF_UNREADABLE");
    const raw = JSON.stringify(body);
    expect(raw).not.toMatch(/IFD0|byteLength|offset/i);
    expectNoCoordinates(raw);
    const logged = errorSpy.mock.calls.map((call) => call.map(String).join(" ")).join("\n");
    expect(logged).not.toMatch(/IFD0|byteLength|offset|latitude|longitude/i);
    expectNoCoordinates(logged);
  });

  it("still rejects an invalid image, with no metadata and no coordinates", async () => {
    const { status, body, raw } = await upload("text-as.jpeg", "image/jpeg");
    expect(status).toBe(415);
    expect(Object.keys(body).sort()).toEqual([
      "erreur",
      "ok",
      "reverseSearch",
    ]);
    expectNoCoordinates(raw);
  });
});
