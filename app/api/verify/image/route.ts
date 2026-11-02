import { NextResponse, type NextRequest } from "next/server";
import { readImageMetadata } from "@/lib/exif";
import { acceptUploadedImage } from "@/lib/image-intake";
import { clientIp, isRateLimited } from "@/lib/ratelimit";
import { reverseSearchLinks } from "@/lib/reverse-search";

export async function POST(req: NextRequest) {
  // Built once per request from server-side constants: no network call, so it
  // works even if Google Lens or TinEye is unreachable. It is also returned on
  // failures, because the journalist can still search the image by hand.
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

    const { metadata, warnings } = await readImageMetadata(
      result.bytes,
      result.format,
    );

    return NextResponse.json({
      ok: true,
      file: { format: result.format, size: result.size },
      metadata,
      warnings,
      reverseSearch,
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
