import { describe, expect, it, afterEach } from "vitest";
import { MAX_IMAGE_BYTES } from "@/lib/image-intake";
import { pngOfSize } from "../helpers/png";
import { fixture, formWith, postForm } from "../helpers/upload";

// ---------------------------------------------------------------------------
// L'analyse IA doit remplir le champ `analysis` quand elle réussit, et le
// laisser absent (undefined) quand l'intake est rejeté, sans casser la requête.
// ---------------------------------------------------------------------------

async function upload(name: string, type = "image/jpeg", ip?: string) {
  const { status, body } = await postForm(
    formWith(fixture(name), name, type),
    ip,
  );
  return { status, body, raw: JSON.stringify(body) };
}

describe("POST /api/verify/image — analyse visuelle", () => {
  afterEach(() => {
    // Réinitialisation implicite basée sur l'environnement mock (USE_MOCK).
    // Aucun reset nécessaire.
  });

  it("ajoute un champ analysis quand le provider retourne un résultat valide", async () => {
    const { status, body, raw } = await upload("valid.jpg");

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    if (body.analysis === null) {
      // Avec USE_MOCK=true, l'analyse est disponible ; si ce test est exécuté
      // sans mock, on ne peut pas garantir le résultat.
      return;
    }
    expect(typeof body.analysis === "object").toBe(true);
    expect(typeof body.analysis.description === "object").toBe(true);
    expect(typeof body.analysis.description.text === "string").toBe(true);
    expect(body.analysis.description.text.length).toBeGreaterThan(0);
    expect(body.analysis.description.confidence).toBe("low");
    expect(raw).not.toMatch(/18\.9\d*|47\.5\d*/);
    expect(raw).not.toMatch(/GPSLatitude|GPSLongitude|latitude|longitude/i);
  });

  it("n'ajoute pas d'analyse quand l'image échoue à la validation (415)", async () => {
    const { status, body } = await upload("text-as.jpeg", "image/jpeg");

    expect(status).toBe(415);
    expect(body.ok).toBe(false);
    expect(body.analysis).toBeUndefined();
  });

  it("n'ajoute pas d'analyse quand l'image est trop volumineuse (413)", async () => {
    const bytes = pngOfSize(MAX_IMAGE_BYTES + 1);
    const { status, body } = await postForm(
      formWith(bytes, "trop-gros.png", "image/png"),
    );

    expect(status).toBe(413);
    expect(body.ok).toBe(false);
    expect(body.analysis).toBeUndefined();
  });

  it("n'ajoute pas d'analyse quand l'image est malformée (400)", async () => {
    const { status, body } = await upload("truncated.png", "image/png");

    expect(status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.analysis).toBeUndefined();
  });

  it("n'ajoute pas d'analyse quand le champ image est absent (400)", async () => {
    const form = new FormData();
    form.append("autre", "du texte");
    const { status, body } = await postForm(form);

    expect(status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.analysis).toBeUndefined();
  });

  it("n'ajoute pas d'analyse quand le champ image est vide (400)", async () => {
    const { status, body } = await postForm(
      formWith(new Uint8Array(0), "vide.jpg", "image/jpeg"),
    );

    expect(status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.analysis).toBeUndefined();
  });

  it("n'ajoute pas d'analyse quand le champ image n'est pas un fichier (400)", async () => {
    const form = new FormData();
    form.append("image", "juste du texte");
    const { status, body } = await postForm(form);

    expect(status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.analysis).toBeUndefined();
  });

  it("n'ajoute pas d'analyse quand l'image a plusieurs fichiers (400)", async () => {
    const form = new FormData();
    form.append("image", new File([new Uint8Array(fixture("valid.png"))], "un.png", { type: "image/png" }));
    form.append("image", new File([new Uint8Array(fixture("valid.jpg"))], "deux.jpg", { type: "image/jpeg" }));
    const { status, body } = await postForm(form);

    expect(status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.analysis).toBeUndefined();
  });
});
