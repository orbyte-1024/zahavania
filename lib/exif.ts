import exifr from "exifr";
import { EXIF_PARSE_OPTIONS, emptyMetadata, summarizeExifTags, type ImageMetadata } from "@/lib/exif-summary";
import type { ImageFormat } from "./image-intake";

export type { ImageMetadata } from "@/lib/exif-summary";

export type MetadataWarning = {
  code: "EXIF_UNAVAILABLE" | "EXIF_UNREADABLE";
  message: string;
};

export type MetadataReport = {
  metadata: ImageMetadata;
  warnings: MetadataWarning[];
};

export const EXIF_UNAVAILABLE_WARNING: MetadataWarning = {
  code: "EXIF_UNAVAILABLE",
  message:
    "Aucune métadonnée EXIF exploitable n'a été trouvée. Certaines plateformes, notamment WhatsApp et Facebook, peuvent supprimer les métadonnées lors du partage des images. Leur absence ne constitue pas un indice de falsification.",
};

export const EXIF_UNREADABLE_WARNING: MetadataWarning = {
  code: "EXIF_UNREADABLE",
  message:
    "Les métadonnées EXIF de cette image n'ont pas pu être lues. Cela ne constitue pas un indice de falsification.",
};

/** Only the fields shown to the journalist: no thumbnails, no maker notes, no serial numbers. */
/**
 * Reads the EXIF fields of an already validated image. Dates are kept exactly
 * as stored: an EXIF timestamp has no timezone, so converting it to UTC would
 * invent one.
 *
 * Never throws, and never returns GPS coordinates — only their presence. The
 * parsed object is local to this function and is not kept anywhere.
 */
export async function readImageMetadata(
  bytes: Uint8Array,
  format: ImageFormat,
): Promise<MetadataReport> {
  // exifr 7 cannot read WebP containers. Nothing is read, and a missing block
  // is not evidence of tampering, so this is the same as "unavailable".
  if (format === "image/webp") {
    return { metadata: emptyMetadata(), warnings: [EXIF_UNAVAILABLE_WARNING] };
  }

  let parsed: Record<string, unknown> | undefined;
  try {
    parsed = (await exifr.parse(bytes, { ...EXIF_PARSE_OPTIONS })) as Record<string, unknown> | undefined;
  } catch {
    // The thrown message quotes internal offsets, so it is not logged or
    // returned; a broken metadata block says nothing about the image itself.
    return { metadata: emptyMetadata(), warnings: [EXIF_UNREADABLE_WARNING] };
  }

  if (!parsed) {
    return { metadata: emptyMetadata(), warnings: [EXIF_UNAVAILABLE_WARNING] };
  }

  // exifr reports a block it could not fully parse through `errors` instead of
  // throwing; whatever fields survived are still worth showing.
  const unreadable = parsed.errors !== undefined;
  delete parsed.errors;

  const metadata = summarizeExifTags(parsed);

  if (!metadata.available) {
    return {
      metadata,
      warnings: [unreadable ? EXIF_UNREADABLE_WARNING : EXIF_UNAVAILABLE_WARNING],
    };
  }

  return {
    metadata,
    warnings: unreadable ? [EXIF_UNREADABLE_WARNING] : [],
  };
}
