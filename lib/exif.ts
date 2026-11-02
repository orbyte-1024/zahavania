import exifr from "exifr";
import type { ImageFormat } from "./image-intake";

export type ImageMetadata = {
  available: boolean;
  dateTaken: string | null;
  creationDate: string | null;
  camera: string | null;
  software: string | null;
  hasGPS: boolean;
};

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
const PICKED_TAGS = [
  "DateTimeOriginal",
  "CreateDate",
  "Make",
  "Model",
  "Software",
  "GPSLatitude",
  "GPSLongitude",
];

/**
 * exifr derives decimal `latitude`/`longitude` as soon as GPS tags are picked,
 * so those keys are dropped along with the tags themselves.
 */
const GPS_KEYS = [
  "GPSLatitude",
  "GPSLongitude",
  "latitude",
  "longitude",
] as const;

function emptyMetadata(): ImageMetadata {
  return {
    available: false,
    dateTaken: null,
    creationDate: null,
    camera: null,
    software: null,
    hasGPS: false,
  };
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** "Canon" + "Canon EOS 90D" reads better as "Canon EOS 90D". */
function cameraName(make: string | null, model: string | null): string | null {
  if (!make) return model;
  if (!model) return make;
  return model.toLowerCase().startsWith(make.toLowerCase())
    ? model
    : `${make} ${model}`;
}

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
    parsed = (await exifr.parse(bytes, {
      pick: PICKED_TAGS,
      reviveValues: false,
      translateValues: false,
    })) as Record<string, unknown> | undefined;
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

  const hasGPS =
    parsed.GPSLatitude !== undefined || parsed.GPSLongitude !== undefined;
  for (const key of GPS_KEYS) delete parsed[key];

  const metadata: ImageMetadata = {
    available: false,
    dateTaken: text(parsed.DateTimeOriginal),
    creationDate: text(parsed.CreateDate),
    camera: cameraName(text(parsed.Make), text(parsed.Model)),
    software: text(parsed.Software),
    hasGPS,
  };
  metadata.available =
    metadata.dateTaken !== null ||
    metadata.creationDate !== null ||
    metadata.camera !== null ||
    metadata.software !== null ||
    metadata.hasGPS;

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
