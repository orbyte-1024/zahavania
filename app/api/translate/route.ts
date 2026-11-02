import { NextResponse } from "next/server";
import { z } from "zod";
import { askJson } from "@/lib/ai/client";

const TranslateSchema = z.object({
  sourceLang: z.enum(["mg", "fr", "en"]),
  targetLang: z.enum(["mg", "fr", "en"]),
  text: z.string().min(1).max(5000),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = TranslateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, erreur: "Entrée invalide", détails: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { sourceLang, targetLang, text } = parsed.data;

    const system = `Tu es un traducteur professionnel. Traduis le texte donné de ${sourceLang} vers ${targetLang}. Réponds UNIQUEMENT par un objet JSON de la forme {"translatedText":"..."}.`;
    const user = `<text_to_translate>\n${text}\n</text_to_translate>\nLangue source: ${sourceLang}\nLangue cible: ${targetLang}`;

    const result = await askJson({
      system,
      user,
      schema: z.object({ translatedText: z.string() }),
    });

    return NextResponse.json({
      ok: true,
      translatedText: result.data.translatedText,
      sourceLang,
      targetLang,
      note: targetLang === "mg" ? "Le malagasy généré par IA doit être relu par un locuteur." : undefined,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, erreur: e instanceof Error ? e.message : "Erreur inconnue" },
      { status: 503 },
    );
  }
}
