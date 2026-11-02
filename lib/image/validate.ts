import sharp from "sharp";

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export type ImageFormat = "image/jpeg" | "image/png" | "image/webp";

export type ValidateResult =
  | { ok: true; format: ImageFormat; size: number; bytes: Uint8Array }
  | { ok: false; status: number; erreur: string };

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47];
const JPEG_SIG = [0xff, 0xd8, 0xff];

function detectFormat(bytes: Uint8Array): ImageFormat | null {
  if (bytes.length < 4) return null;
  if (
    bytes[0] === PNG_SIG[0] &&
    bytes[1] === PNG_SIG[1] &&
    bytes[2] === PNG_SIG[2] &&
    bytes[3] === PNG_SIG[3]
  )
    return "image/png";
  if (
    bytes.length >= 3 &&
    bytes[0] === JPEG_SIG[0] &&
    bytes[1] === JPEG_SIG[1] &&
    bytes[2] === JPEG_SIG[2]
  )
    return "image/jpeg";
  // WebP : RIFF....WEBP
  if (
    bytes.length > 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
    return "image/webp";
  return null;
}

export async function validateImage(
  bytes: Uint8Array,
): Promise<ValidateResult> {
  if (bytes.byteLength === 0)
    return { ok: false, status: 400, erreur: "Fichier vide" };
  if (bytes.byteLength > MAX_IMAGE_BYTES)
    return { ok: false, status: 413, erreur: "Fichier trop volumineux (max 8 Mo)" };

  const fmt = detectFormat(bytes);
  if (!fmt)
    return {
      ok: false,
      status: 415,
      erreur: "Format non pris en charge (attendu JPEG, PNG, WebP)",
    };

  // Ré-encodage test avec sharp pour vérifier intégrité
  try {
    await sharp(Buffer.from(bytes)).metadata();
  } catch {
    return {
      ok: false,
      status: 400,
      erreur: "Image illisible ou corrompue",
    };
  }

  return { ok: true, format: fmt, size: bytes.byteLength, bytes };
}
