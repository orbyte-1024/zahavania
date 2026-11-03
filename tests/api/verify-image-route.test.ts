import { afterEach, describe, expect, it } from "vitest";
import { fixture, formWith, postForm } from "../helpers/upload";

const plain = fixture("valid.jpg");
const withExif = fixture("exif-full.jpg");

function deviceForm(bytes: Uint8Array, fields: Record<string, string>) {
  const form = formWith(bytes, "photo.jpg", "image/jpeg");
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return form;
}

describe("POST /api/verify/image — session, language and device EXIF", () => {
  afterEach(() => {
    process.env.DEMO_MODE = "true";
  });

  it("refuses to run without a session when auth is not configured", async () => {
    process.env.DEMO_MODE = "false";
    const { status, body } = await postForm(formWith(plain, "photo.jpg", "image/jpeg"));
    expect(status).toBe(503);
    expect(body).toMatchObject({ ok: false, error: { code: "auth_unavailable" } });
  });

  it("uses the EXIF read on the device when the uploaded copy has none", async () => {
    const exif = JSON.stringify({ dateTaken: "2026:10:30 08:12:00", camera: "Samsung SM-A155F", hasGPS: true });
    const { status, body } = await postForm(deviceForm(plain, { lang: "en", exif }));
    expect(status).toBe(200);
    expect(body.metadataSource).toBe("device");
    expect(body.metadata).toMatchObject({ available: true, camera: "Samsung SM-A155F", hasGPS: true });
    expect(body.warnings.map((w: { code: string }) => w.code)).not.toContain("EXIF_UNAVAILABLE");
  });

  it("prefers the file's own EXIF over the device fields", async () => {
    const exif = JSON.stringify({ camera: "Something else" });
    const { body } = await postForm(deviceForm(withExif, { exif }));
    expect(body.metadataSource).toBe("file");
    expect(body.metadata.camera).not.toBe("Something else");
  });

  it("rejects device EXIF that carries coordinates or unknown fields", async () => {
    const exif = JSON.stringify({ camera: "X", latitude: -18.91, longitude: 47.52 });
    const { status, body } = await postForm(deviceForm(plain, { exif }));
    expect(status).toBe(400);
    expect(body.error.code).toBe("invalid_input");
    expect(JSON.stringify(body)).not.toContain("47.52");
  });

  it("rejects an unknown language and malformed EXIF JSON", async () => {
    expect((await postForm(deviceForm(plain, { lang: "de" }))).status).toBe(400);
    expect((await postForm(deviceForm(plain, { exif: "{not json" }))).status).toBe(400);
  });

  it("reports no metadata when neither the file nor the device has any", async () => {
    const { body } = await postForm(deviceForm(plain, { exif: JSON.stringify({}) }));
    expect(body.metadataSource).toBe("none");
    expect(body.metadata.available).toBe(false);
  });
});
