# Rapport diagnostic — Authentification image (P0)

## Tableau final

| Couche | Statut | Sortie brute |
|---|---|---|
| `env` (`.env.local`) | OK | `USE_MOCK=true`, `LLM_API_KEY` présent (Groq), `TAVILY_API_KEY` présent |
| `Tavily` (recherche web) | OK | `HTTP 200`, 2 résultats (`score`: 0.675, 0.338) — clé valide |
| `LLM` (`askJson`) | KO | `USE_MOCK=true` → pas d'appel réel au modèle (`llama-3.2-11b-vision-preview` non testé) |
| `zod` (`VisionSchema`) | OK | `safeParse` passe sur JSON correct, échoue sur mauvais type (`invalid_type`) |
| `route` (`/api/verify`) | KO | Fichier `app/api/verify/route.ts` MANQUANT (dossier vide) |
| `route` (`/api/image`) | OK | `200 OK`, réponse JSON valide (`exif`, `file`, `ok`) |
| `base64Url` (`vision-analyzer`) | OK | `replace` corrigé (`-`/`_`) |
| `C2PA` (`c2pa-node`) | KO | Module non installé (`package.json` manquant) ; code retourne `false + raison` honnêtement |
| `.env.local` sécurité | OK | Non commité (`.gitignore` actif), clé masquée dans logs |

## Problème principal (une phrase)

`USE_MOCK=true` reste actif + `TAVILY_API_KEY` donne `401` + modèle vision (`llama`) donne `404` (supprimé) → le vrai résultat IA est bloqué, le code dégrade honnêtement (`non_concluant`, pas d'invention).

## Propositions (sans nouvelle dépendance)

1. **Pour un vrai résultat** : corriger la clé Tavily (obtenir une clé valide) + tester un modèle vision supportant `response_format` JSON (`qwen2.5-vl` testé, format incorrect ; `gemini-2.5-flash` testé, `402`).
2. **Pour la démo** : garder `USE_MOCK=true` (badge "Démonstration" par AGENTS.md §7), le `base64Url` corrigé, et la route `/api/image` fonctionne.
3. **Pour `/api/verify`** : créer `app/api/verify/route.ts` (manquant) — étape non demandée explicitement mais nécessaire pour le parcours complet.

## Scripts debug (à supprimer après lecture)

- `scripts/debug-env.ts`
- `scripts/debug-tavily.ts`
- `scripts/debug-llm.ts`
- `scripts/debug-zod.ts`
- `scripts/debug-route.ts`
