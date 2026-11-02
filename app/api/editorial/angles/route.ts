import { NextResponse, type NextRequest } from "next/server";
import { generateAngles } from "@/lib/ai/angles";
import { AiError } from "@/lib/ai/client";
import { anglesInputSchema } from "@/lib/ai/schemas";
import { clientIp, isRateLimited } from "@/lib/ratelimit";
import { readJsonBody } from "@/lib/security/request";

// Worst case: 50 claims of ~1 KB each plus subject and id.
const MAX_BODY_BYTES = 131_072;

function aiErrorReply(error: AiError) {
  switch (error.code) {
    case "timeout":
      return { status: 504, message: "Le service IA a mis trop de temps à répondre" };
    case "rate_limited":
      return { status: 503, message: "Service IA momentanément saturé, réessayez dans une minute" };
    case "config_missing":
      return { status: 503, message: "Service IA non configuré" };
    case "invalid_output":
      return { status: 503, message: "Analyse partielle : le service n'a pas produit de réponse exploitable" };
    default:
      return { status: 503, message: "Appel IA échoué" };
  }
}

export async function POST(req: NextRequest) {
  if (isRateLimited(clientIp(req))) {
    return NextResponse.json(
      { ok: false, erreur: "Trop de requêtes, réessayez dans une minute" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const body = await readJsonBody(req, MAX_BODY_BYTES);
  if (!body.ok) {
    const message =
      body.status === 415
        ? "Contenu attendu au format JSON"
        : body.status === 413
          ? "Requête trop volumineuse"
          : "Corps de requête invalide";
    return NextResponse.json({ ok: false, erreur: message }, { status: body.status });
  }

  const parsed = anglesInputSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, erreur: "Requête invalide : sujet, affirmations ou langue manquants" },
      { status: 400 },
    );
  }

  try {
    const { output, mock, usage, attempts } = await generateAngles(parsed.data);
    return NextResponse.json({
      ok: true,
      mock,
      verificationId: parsed.data.verificationId ?? null,
      ...output,
      usage,
      attempts,
    });
  } catch (e) {
    if (e instanceof AiError) {
      // Log the error code only: never the submitted content.
      console.error("editorial/angles:", e.code);
      const { status, message } = aiErrorReply(e);
      return NextResponse.json({ ok: false, erreur: message }, { status });
    }
    console.error(
      "editorial/angles:",
      e instanceof Error ? e.message : "unknown error",
    );
    return NextResponse.json(
      { ok: false, erreur: "Génération impossible" },
      { status: 500 },
    );
  }
}
