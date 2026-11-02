import { NextResponse, type NextRequest } from "next/server";
import { acceptUploadedImage } from "@/lib/image-intake";
import { clientIp, isRateLimited } from "@/lib/ratelimit";

export async function POST(req: NextRequest) {
  if (isRateLimited(clientIp(req))) {
    return NextResponse.json(
      { ok: false, erreur: "Trop de requêtes, réessayez dans une minute" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  try {
    const result = await acceptUploadedImage(req);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, erreur: result.erreur },
        { status: result.status },
      );
    }
    return NextResponse.json({
      ok: true,
      file: { format: result.format, size: result.size },
    });
  } catch (e) {
    console.error(
      "verify/image:",
      e instanceof Error ? e.message : "erreur inconnue",
    );
    return NextResponse.json(
      { ok: false, erreur: "Vérification impossible" },
      { status: 500 },
    );
  }
}
