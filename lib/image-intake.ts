import { imageSize } from "image-size";

/** Hard cap for one upload: 8 MiB (8 × 1024 × 1024). */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * Multipart boundaries and part headers wrap the file in a few hundred bytes.
 * Capping the body slightly above the file limit keeps the file check
 * authoritative while still refusing oversized requests early.
 */
const MAX_BODY_BYTES = MAX_IMAGE_BYTES + 64 * 1024;

export type ImageFormat = "image/jpeg" | "image/png" | "image/webp";

export type IntakeResult =
  | { ok: true; format: ImageFormat; size: number; bytes: Uint8Array }
  | { ok: false; status: 400 | 413 | 415; erreur: string };

const TOO_LARGE: IntakeResult = {
  ok: false,
  status: 413,
  erreur: "Fichier trop volumineux",
};
const INVALID_BODY: IntakeResult = {
  ok: false,
  status: 400,
  erreur: "Requête invalide",
};

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46];
const WEBP_TAG = [0x57, 0x45, 0x42, 0x50];

/** Thrown by the body guard so an oversized upload can be told apart from a broken request. */
class BodyTooLargeError extends Error {}

function startsWith(bytes: Uint8Array, expected: number[]): boolean {
  if (bytes.byteLength < expected.length) return false;
  return expected.every((value, index) => bytes[index] === value);
}

/** Detects the format from the bytes themselves; extension and client MIME type are ignored. */
export function detectFormat(bytes: Uint8Array): ImageFormat | null {
  if (startsWith(bytes, PNG_SIGNATURE)) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (startsWith(bytes, RIFF_SIGNATURE) && startsWith(bytes.subarray(8), WEBP_TAG)) {
    return "image/webp";
  }
  return null;
}

const IMAGE_SIZE_TYPES: Record<string, ImageFormat> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const PNG_IEND = [0x49, 0x45, 0x4e, 0x44];

/**
 * Header parsing alone accepts a file cut after its header, so the end of the
 * container is checked too: each format states where it ends.
 */
function hasCompleteStructure(bytes: Uint8Array, format: ImageFormat): boolean {
  if (format === "image/png") {
    // An intact PNG always finishes with the empty IEND chunk.
    const tail = bytes.subarray(bytes.byteLength - 12);
    return tail.byteLength === 12 && startsWith(tail.subarray(4), PNG_IEND);
  }
  if (format === "image/jpeg") {
    // Every intact JPEG finishes with the EOI marker.
    return (
      bytes[bytes.byteLength - 2] === 0xff && bytes[bytes.byteLength - 1] === 0xd9
    );
  }
  // The RIFF header declares the payload length, so a truncated WebP disagrees.
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint32(4, true) + 8 === bytes.byteLength;
}

/**
 * A signature only proves the first bytes look right. image-size walks the
 * container structure and reads the dimensions, so truncated or incoherent
 * files are refused; both detectors must also agree on the format.
 */
function isIntactImage(bytes: Uint8Array, format: ImageFormat): boolean {
  try {
    const { width, height, type } = imageSize(bytes);
    if (!width || !height) return false;
    return type !== undefined && IMAGE_SIZE_TYPES[type] === format;
  } catch {
    return false;
  }
}

/**
 * Counts bytes as they arrive and aborts one byte past the cap, so an oversized
 * body is never buffered in full. A missing or lying Content-Length cannot
 * bypass this.
 */
function bodyWithinLimit(
  source: ReadableStream<Uint8Array>,
  limit: number,
): ReadableStream<Uint8Array> {
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
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new BodyTooLargeError();
  }
  if (!req.body) throw new Error("body_missing");

  // formData() buffers everything it reads, so it is only ever handed a stream
  // that self-destructs past MAX_BODY_BYTES.
  const init: RequestInit & { duplex: "half" } = {
    method: "POST",
    headers: { "content-type": contentType },
    body: bodyWithinLimit(req.body, MAX_BODY_BYTES),
    duplex: "half",
  };

  return new Request("http://localhost/", init).formData();
}

function asFile(entry: FormDataEntryValue | undefined): File | null {
  return typeof entry === "object" && entry !== null ? entry : null;
}

async function inspect(file: File): Promise<IntakeResult> {
  if (file.size === 0) {
    return { ok: false, status: 400, erreur: "Fichier vide" };
  }
  if (file.size > MAX_IMAGE_BYTES) return TOO_LARGE;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const format = detectFormat(bytes);
  if (!format) {
    return { ok: false, status: 415, erreur: "Format non pris en charge" };
  }
  if (!isIntactImage(bytes, format) || !hasCompleteStructure(bytes, format)) {
    return { ok: false, status: 400, erreur: "Image illisible ou corrompue" };
  }

  // Handed back so later steps can read the file from memory: it is never
  // written to disk, cached or serialised.
  return { ok: true, format, size: bytes.byteLength, bytes };
}

/**
 * Reads one image from the `image` field of a multipart request and validates
 * it. The file is kept in memory only: nothing is written to disk or to the
 * database, and nothing from the upload is logged.
 */
export async function acceptUploadedImage(req: Request): Promise<IntakeResult> {
  let form: FormData;
  try {
    form = await readForm(req);
  } catch (error) {
    return error instanceof BodyTooLargeError ? TOO_LARGE : INVALID_BODY;
  }

  const entries = form.getAll("image");
  if (entries.length === 0) {
    return { ok: false, status: 400, erreur: "Champ image manquant" };
  }
  if (entries.length > 1) {
    return { ok: false, status: 400, erreur: "Une seule image par requête" };
  }

  const file = asFile(entries[0]);
  if (!file) {
    return { ok: false, status: 400, erreur: "Le champ image doit être un fichier" };
  }

  return inspect(file);
}
