import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { validateImage } from "@/lib/image/validate";
import { readExif } from "@/lib/image/exif";
import { isRateLimited, clientIp } from "@/lib/ratelimit";

const ImageResultSchema = z.object({
  ok: z.boolean(),
  format: z.string().optional(),
  size: z.number().optional(),
  exif: z.record(z.unknown()).optional(),
});

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { ok: false, erreur: "Trop de requêtes, réessayez dans une minute" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  try {
    const formData = await req.formData();
    const file = formData.get("image");
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { ok: false, erreur: "Champ image manquant" },
        { status: 400 },
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const validation = await validateImage(bytes);

    if (!validation.ok) {
      return NextResponse.json(
        { ok: false, erreur: validation.erreur },
        { status: validation.status },
      );
    }

    const exifData = await readExif(bytes);

    // Analyse ELA (optionnelle : échoue silencieusement si non JPEG)
    let elaResult: { applicable: boolean; reason?: string; metric?: number; mapBase64?: string } | undefined = undefined;
    try {
      const { analyzeELA } = await import("@/lib/image/ela");
      elaResult = await analyzeELA(bytes, validation.format);
    } catch {
      elaResult = { applicable: false, reason: "Analyse ELA non applicable" };
    }

    // C2PA (optionnelle : neutre si absent)
    let c2paResult: { manifestPresent: boolean; reason?: string } = { manifestPresent: false };
    try {
      const { checkC2pa } = await import("@/lib/image/c2pa");
      c2paResult = await checkC2pa(bytes);
    } catch {
      c2paResult = { manifestPresent: false, reason: "Module C2PA indisponible" };
    }

    // Liens de recherche inversée
    let linksResult: { googleLens: { name: string; url: string }; tineye: { name: string; url: string } } | undefined = undefined;
    try {
      const { getImageSearchLinks } = await import("@/lib/image/links");
      const links = getImageSearchLinks();
      linksResult = {
        googleLens: { name: links[0].name, url: links[0].url },
        tineye: { name: links[1].name, url: links[1].url },
      };
    } catch {
      linksResult = undefined;
    }

    // Vision IA (optionnelle : désactivée par défaut, consentement explicite)
    let visionResult: { analysis: unknown | null; warnings: { code: string; message: string }[] } = { analysis: null, warnings: [] };
    try {
      const { analyzeImage } = await import("@/lib/image/vision-analyzer");
      visionResult = await analyzeImage(bytes, validation.format);
    } catch {
      visionResult = {
        analysis: null,
        warnings: [{ code: "ANALYSE_IA_NON_DISPONIBLE", message: "L'analyse visuelle automatique est actuellement indisponible." }],
      };
    }

    // Résumé (agrégation honnête)
    const { summarizeSignals } = await import("@/lib/image/summarize");
    const signals = [
      { id: "exif", label: "Métadonnées EXIF", level: (exifData.available ? (exifData.hasGPS ? "low" : "info") : "info") as "info" | "low" | "medium" | "high", detail: exifData.available ? (exifData.make ? `Appareil : ${exifData.make}` : "Aucune métadonnée EXIF exploitable.") : "Aucune métadonnée EXIF exploitable.", limit: exifData.available ? "EXIF présent" : "EXIF absent — WhatsApp/Facebook le retirent souvent." },
      { id: "c2pa", label: "Provenance C2PA", level: (c2paResult.manifestPresent ? "low" : "info") as "info" | "low" | "medium" | "high", detail: c2paResult.manifestPresent ? "Manifeste de provenance détecté." : (c2paResult.reason ? c2paResult.reason : "Aucun manifeste C2PA détecté."), limit: "C2PA présent" },
      { id: "ela", label: "Analyse ELA", level: ((elaResult && elaResult.applicable && (elaResult.metric || 0) > 5) ? "low" : "info") as "info" | "low" | "medium" | "high", detail: (elaResult && elaResult.applicable) ? `Différence : ${(elaResult.metric || 0).toFixed(1)}%` : (elaResult?.reason || "Analyse ELA non applicable."), limit: "JPEG uniquement" },
    ];
    const status = summarizeSignals(signals);

    return NextResponse.json({
      ok: true,
      file: { format: validation.format, size: validation.size },
      exif: exifData,
      ela: elaResult,
      c2pa: c2paResult,
      vision: visionResult,
      links: linksResult,
      summary: {
        status,
        signals,
        banner: "L'absence d'anomalie ne prouve pas l'authenticité de l'image. Ce rapport présente uniquement des indices techniques.",
      },
    });
  } catch {
    return NextResponse.json(
      { ok: false, erreur: "Vérification impossible" },
      { status: 500 },
    );
  }
}
