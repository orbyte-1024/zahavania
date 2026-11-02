import { describe, expect, it } from "vitest";
import { MAX_IMAGE_BYTES } from "@/lib/image-intake";
import { pngOfSize } from "../helpers/png";
import {
  fileOf,
  fixture,
  formWith,
  multipart,
  postForm,
  postRaw,
  postStream,
} from "../helpers/upload";

const jpeg = fixture("valid.jpg");
const png = fixture("valid.png");
const webp = fixture("valid.webp");

describe("POST /api/verify/image", () => {
  it("accepts a valid JPEG", async () => {
    const { status, body } = await postForm(
      formWith(jpeg, "photo.jpg", "image/jpeg"),
    );
    expect(status).toBe(200);
    expect(body).toEqual({
      ok: true,
      file: { format: "image/jpeg", size: jpeg.byteLength },
    });
  });

  it("accepts a valid PNG", async () => {
    const { status, body } = await postForm(
      formWith(png, "photo.png", "image/png"),
    );
    expect(status).toBe(200);
    expect(body.file).toEqual({ format: "image/png", size: png.byteLength });
  });

  it("accepts a valid WebP", async () => {
    const { status, body } = await postForm(
      formWith(webp, "photo.webp", "image/webp"),
    );
    expect(status).toBe(200);
    expect(body.file).toEqual({ format: "image/webp", size: webp.byteLength });
  });

  it("never echoes the filename or the file content", async () => {
    const { body } = await postForm(
      formWith(jpeg, "confidentiel-source.jpg", "image/jpeg"),
    );
    expect(JSON.stringify(body)).not.toContain("confidentiel-source");
    expect(Object.keys(body).sort()).toEqual(["file", "ok"]);
  });

  it("rejects a request without the image field", async () => {
    const form = new FormData();
    form.append("photo", fileOf(png, "photo.png", "image/png"));
    const { status, body } = await postForm(form);
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
  });

  it("rejects a text value in the image field", async () => {
    const form = new FormData();
    form.append("image", "juste du texte");
    const { status } = await postForm(form);
    expect(status).toBe(400);
  });

  it("rejects an empty file", async () => {
    const { status } = await postForm(formWith(new Uint8Array(0), "vide.jpg", "image/jpeg"));
    expect(status).toBe(400);
  });

  it("accepts a file of exactly 5 MiB", async () => {
    const bytes = pngOfSize(MAX_IMAGE_BYTES);
    const { status, body } = await postForm(
      formWith(bytes, "limite.png", "image/png"),
    );
    expect(status).toBe(200);
    expect(body.file).toEqual({ format: "image/png", size: MAX_IMAGE_BYTES });
  });

  it("rejects a file of 5 MiB + 1 byte", async () => {
    const bytes = pngOfSize(MAX_IMAGE_BYTES + 1);
    const { status, body } = await postForm(
      formWith(bytes, "trop-gros.png", "image/png"),
    );
    expect(status).toBe(413);
    expect(body.ok).toBe(false);
  });

  it("stops a chunked body that exceeds the cap, without Content-Length", async () => {
    const boundary = "test-boundary-chunked";
    const bytes = pngOfSize(MAX_IMAGE_BYTES + 100 * 1024);
    const payload = multipart(boundary, bytes, "gros.png", "image/png");
    const { status } = await postStream(
      payload,
      `multipart/form-data; boundary=${boundary}`,
    );
    expect(status).toBe(413);
  });

  it("rejects a text file renamed to .jpg", async () => {
    const { status } = await postForm(
      formWith(fixture("text-as.jpeg"), "photo.jpg", "image/jpeg"),
    );
    expect(status).toBe(415);
  });

  it("rejects a non-image file renamed to .jpg", async () => {
    const { status } = await postForm(
      formWith(fixture("pdf-as.jpg"), "document.jpg", "image/jpeg"),
    );
    expect(status).toBe(415);
  });

  it("trusts the content over the declared MIME type", async () => {
    const { status, body } = await postForm(
      formWith(png, "photo.jpg", "image/jpeg"),
    );
    expect(status).toBe(200);
    expect(body.file.format).toBe("image/png");
  });

  it("rejects a falsified MIME type on non-image content", async () => {
    const { status } = await postForm(
      formWith(fixture("text-as.jpeg"), "photo.png", "image/png"),
    );
    expect(status).toBe(415);
  });

  it("rejects a malformed image that has a valid PNG signature", async () => {
    const { status } = await postForm(
      formWith(fixture("truncated.png"), "casse.png", "image/png"),
    );
    expect(status).toBe(400);
  });

  it("rejects a JPEG cut before its end marker", async () => {
    const { status } = await postForm(
      formWith(fixture("truncated.jpg"), "casse.jpg", "image/jpeg"),
    );
    expect(status).toBe(400);
  });

  it("rejects a WebP whose RIFF length disagrees with its size", async () => {
    const { status } = await postForm(
      formWith(webp.subarray(0, webp.byteLength - 40), "casse.webp", "image/webp"),
    );
    expect(status).toBe(400);
  });

  it("rejects several files in one request", async () => {
    const form = new FormData();
    form.append("image", fileOf(png, "un.png", "image/png"));
    form.append("image", fileOf(jpeg, "deux.jpg", "image/jpeg"));
    const { status } = await postForm(form);
    expect(status).toBe(400);
  });

  it("rejects an invalid multipart body", async () => {
    const { status } = await postRaw(
      Buffer.from("ceci n'est pas du multipart"),
      "multipart/form-data; boundary=absent",
    );
    expect(status).toBe(400);
  });

  it("rejects a body that is not multipart", async () => {
    const { status } = await postRaw(Buffer.from('{"image":"x"}'), "application/json");
    expect(status).toBe(400);
  });
});
