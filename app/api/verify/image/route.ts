import { NextResponse, type NextRequest } from "next/server";
import { readImageMetadata, type MetadataWarning } from "@/lib/exif";
import { acceptUploadedImage } from "@/lib/image-intake";
import { clientIp, isRateLimited } from "@/lib/ratelimit";
import { reverseSearchLinks } from "@/lib/reverse-search";
import { analyzeImage } from "@/lib/vision-analyzer";
import { buildVerification, type VisionWarning } from "@/lib/verification-summary";

type MetadataWarningOrVisionWarning = MetadataWarning | VisionWarning;

export async function POST(req: NextRequest) {
  const reverseSearch = reverseSearchLinks();

  if (isRateLimited(clientIp(req))) {
    return NextResponse.json(
      {
        ok: false,
        erreur: "Trop de requêtes, réessayez dans une minute",
        reverseSearch,
      },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  try {
    const result = await acceptUploadedImage(req);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, erreur: result.erreur, reverseSearch },
        { status: result.status },
      );
    }

    const { metadata, warnings: exifWarnings } = await readImageMetadata(
      result.bytes,
      result.format,
    );

    const vision = await analyzeImage(result.bytes, result.format);

    const verification = buildVerification(
      metadata,
      exifWarnings,
      vision.analysis,
      vision.warnings as VisionWarning[],
      reverseSearch,
    );

    return NextResponse.json({
      ok: true,
      file: { format: result.format, size: result.size },
      metadata,
      warnings: [...exifWarnings, ...vision.warnings] as MetadataWarningOrVisionWarning[],
      reverseSearch,
      analysis: vision.analysis,
      verification,
    });
  } catch (e) {
    console.error(
      "verify/image:",
      e instanceof Error ? e.message : "erreur inconnue",
    );
    return NextResponse.json(
      { ok: false, erreur: "Vérification impossible", reverseSearch },
      { status: 500 },
    );
  }
}
