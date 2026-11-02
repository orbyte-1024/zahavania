import { imageSize } from "image-size";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ImageFormat } from "./image-intake";

export type VideoFormat = "video/mp4" | "video/webm" | "video/quicktime";
export type MediaFormat = ImageFormat | VideoFormat;
export type MediaType = "image" | "video";

export type MediaIntakeResult =
  | { ok: true; mediaType: MediaType; format: MediaFormat; size: number; bytes: Uint8Array }
  | { ok: false; status: 400 | 413 | 415; erreur: string };

export const MAX_VIDEO_BYTES = 25 * 1024 * 1024;

const TOO_LARGE: MediaIntakeResult = {
  ok: false,
  status: 413,
  erreur: "Fichier trop volumineux",
};

const INVALID_BODY: MediaIntakeResult = {
  ok: false,
  status: 400,
  erreur: "Requête invalide",
};

class BodyTooLargeError extends Error {}

function startsWith(bytes: Uint8Array, expected: number[]): boolean {
  if (bytes.byteLength < expected.length) return false;
  return expected.every((value, index) => bytes[index] === value);
}

function detectImageFormat(bytes: Uint8Array): ImageFormat | null {
  const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

  if (startsWith(bytes, PNG_SIGNATURE)) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50])
  ) {
    return "image/webp";
  }

  return null;
}

export function detectMediaFormat(bytes: Uint8Array): MediaFormat | null {
  const imageFormat = detectImageFormat(bytes);
  if (imageFormat !== null) return imageFormat;

  if (bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    return "video/mp4";
  }

  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) {
    return "video/webm";
  }

  return null;
}

function hasCompleteImageStructure(bytes: Uint8Array, format: ImageFormat): boolean {
  if (format === "image/png") {
    const tail = bytes.subarray(bytes.byteLength - 12);
    return tail.byteLength === 12 && startsWith(tail.subarray(4), [0x49, 0x45, 0x4e, 0x44]);
  }

  if (format === "image/jpeg") {
    return bytes[bytes.byteLength - 2] === 0xff && bytes[bytes.byteLength - 1] === 0xd9;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint32(4, true) + 8 === bytes.byteLength;
}

function isIntactImage(bytes: Uint8Array, format: ImageFormat): boolean {
  try {
    const { width, height, type } = imageSize(bytes);
    if (!width || !height) return false;
    return type !== undefined && { jpg: "image/jpeg", png: "image/png", webp: "image/webp" }[type] === format;
  } catch {
    return false;
  }
}

function isIntactVideo(bytes: Uint8Array, format: VideoFormat): boolean {
  if (bytes.byteLength < 16) return false;

  if (format === "video/webm") {
    return startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3]);
  }

  if (format === "video/mp4") {
    return (
      bytes[4] === 0x66 &&
      bytes[5] === 0x74 &&
      bytes[6] === 0x79 &&
      bytes[7] === 0x70
    );
  }

  return false;
}

function bodyWithinLimit(source: ReadableStream<Uint8Array>, limit: number): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  let received = 0;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (error) {
        controller.error(error);
        return;
      }

      if (chunk.done) {
        controller.close();
        return;
      }

      received += chunk.value.byteLength;
      if (received > limit) {
        await reader.cancel().catch(() => undefined);
        controller.error(new BodyTooLargeError());
        return;
      }

      controller.enqueue(chunk.value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

async function readForm(req: Request): Promise<FormData> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    throw new Error("content_type");
  }

  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_VIDEO_BYTES + 64 * 1024) {
    throw new BodyTooLargeError();
  }

  if (!req.body) throw new Error("body_missing");

  const init: RequestInit & { duplex: "half" } = {
    method: "POST",
    headers: { "content-type": contentType },
    body: bodyWithinLimit(req.body, MAX_VIDEO_BYTES + 64 * 1024),
    duplex: "half",
  };

  return new Request("http://localhost/", init).formData();
}

function asFile(entry: FormDataEntryValue | undefined): File | null {
  return typeof entry === "object" && entry !== null ? entry : null;
}

function inspectMedia(file: File, mediaType: MediaType): MediaIntakeResult {
  if (file.size === 0) {
    return { ok: false, status: 400, erreur: "Fichier vide" };
  }

  const max = mediaType === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (file.size > max) return TOO_LARGE;

  const bytes = new Uint8Array(file.arrayBuffer ? file.arrayBuffer() : file);
  const format = detectMediaFormat(bytes);

  if (!format) {
    return { ok: false, status: 415, erreur: "Format non pris en charge" };
  }

  if (mediaType === "image") {
    const imageFormat = format as ImageFormat;
    if (!isIntactImage(bytes, imageFormat) || !hasCompleteImageStructure(bytes, imageFormat)) {
      return { ok: false, status: 400, erreur: "Image illisible ou corrompue" };
    }
    return { ok: true, mediaType: "image", format: imageFormat, size: bytes.byteLength, bytes };
  }

  const videoFormat = format as VideoFormat;
  if (!isIntactVideo(bytes, videoFormat)) {
    return { ok: false, status: 400, erreur: "Vidéo illisible ou corrompue" };
  }

  return { ok: true, mediaType: "video", format: videoFormat, size: bytes.byteLength, bytes };
}

export async function acceptUploadedMedia(req: Request, fieldName: MediaType): Promise<MediaIntakeResult> {
  let form: FormData;
  try {
    form = await readForm(req);
  } catch {
    return INVALID_BODY;
  }

  const entries = form.getAll(fieldName);
  if (entries.length === 0) {
    return { ok: false, status: 400, erreur: `Champ ${fieldName} manquant` };
  }
  if (entries.length > 1) {
    return { ok: false, status: 400, erreur: `Un seul fichier ${fieldName} par requête` };
  }

  const file = asFile(entries[0]);
  if (!file) {
    return { ok: false, status: 400, erreur: `Le champ ${fieldName} doit être un fichier` };
  }

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const format = detectMediaFormat(bytes);

  if (fieldName === "image") {
    if (!format || format.startsWith("video/")) {
      return { ok: false, status: 415, erreur: "Format non pris en charge" };
    }
    const imageFormat = format as ImageFormat;
    if (!isIntactImage(bytes, imageFormat) || !hasCompleteImageStructure(bytes, imageFormat)) {
      return { ok: false, status: 400, erreur: "Image illisible ou corrompue" };
    }
    return { ok: true, mediaType: "image", format: imageFormat, size: bytes.byteLength, bytes };
  }

  if (!format || format.startsWith("image/")) {
    return { ok: false, status: 415, erreur: "Format vidéo non pris en charge" };
  }

  const videoFormat = format as VideoFormat;
  if (!isIntactVideo(bytes, videoFormat)) {
    return { ok: false, status: 400, erreur: "Vidéo illisible ou corrompue" };
  }

  return { ok: true, mediaType: "video", format: videoFormat, size: bytes.byteLength, bytes };
}

export async function acceptUploadedVideo(req: Request): Promise<MediaIntakeResult> {
  return acceptUploadedMedia(req, "video");
}

function extensionFor(format: VideoFormat): string {
  if (format === "video/webm") return ".webm";
  if (format === "video/quicktime") return ".mov";
  return ".mp4";
}

export function extractVideoFrames(bytes: Uint8Array, format: VideoFormat): Uint8Array[] {
  const tmpDir = mkdtempSync(join(tmpdir(), "checkeko-video-"));
  const inputPath = join(tmpDir, `source${extensionFor(format)}`);
  const outputPattern = join(tmpDir, "frame-%03d.png");

  try {
    writeFileSync(inputPath, Buffer.from(bytes));
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-v",
        "error",
        "-i",
        inputPath,
        "-vf",
        "fps=1,scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2",
        "-frames:v",
        "3",
        outputPattern,
      ],
      { stdio: "ignore" },
    );

    const files = readdirSync(tmpDir)
      .filter((name) => name.startsWith("frame-") && name.endsWith(".png"))
      .sort();

    return files.map((fileName) => {
      const path = join(tmpDir, fileName);
      return new Uint8Array(readFileSync(path));
    });
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}
