# AGENTS.md — Zahavan'ia (hackathon)

> Lis ce fichier en entier avant d'écrire du code. Il prime sur tes habitudes.
> Pour Claude Code : créer un fichier `CLAUDE.md` contenant uniquement `@AGENTS.md`.

## 1. Mission

Zahavan'ia est un **assistant d'investigation journalistique**
pour Madagascar. Question centrale : *comment aider un journaliste à passer d'une
information reçue à une information vérifiée, documentée et exploitable ?*

Ce n'est PAS un chatbot. C'est une chaîne :
**Veille → Vérifier (texte/lien, image) → Contextualiser (chiffres) → Contacter un expert → Trouver un angle.**
Le multilingue (mg/fr/en) est une qualité de l'ensemble. Le hors-ligne est hors périmètre pour l'instant.

Contexte : hackathon de 2 jours, jury qui note pertinence, utilité, résilience
informationnelle, **qualité technique (ça doit fonctionner)**, potentiel, pitch de 3 minutes.
Un parcours qui marche de bout en bout vaut mieux que 8 écrans simulés.

## 2. Règles produit NON NÉGOCIABLES

1. **Jamais de verdict "vrai/faux".** Statuts autorisés : `confirmed`, `contradicted`, `insufficient`, `needs_verification`.
   Un **indice de confiance 0–100 explicable**, présenté comme indicatif, jamais comme une probabilité.
2. **Traçabilité.** Toute conclusion renvoie à des sources cliquables (titre, domaine, date, URL).
   Pas de source exploitable = statut `insuffisant`. Jamais l'inverse.
3. **Transparence.** Toujours afficher : limites, contradictions, éléments manquants, vérifications à mener.
4. **L'IA n'invente rien** : ni source, ni URL, ni citation, ni chiffre, ni nom de personne.
   Elle ne juge qu'à partir des résultats de la recherche web de la requête : toute source
   qu'elle cite sans que la recherche l'ait renvoyée est retirée par le code.
5. **Le journaliste décide.** Chaque rapport propose Valider / Compléter / Rejeter.
6. **Images : indices, jamais preuve.** Une image "sans anomalie" n'est pas "authentique".
   La conclusion par défaut est "non concluant".
7. **Protection.** Aucune clé côté client. Pas de logs de contenus soumis. Annuaire : seulement des
   personnes consentantes ; en démo, données fictives (marquées comme telles).
8. **Données datées et sourcées partout** (source, période de référence, date de mise à jour).
9. **Contexte malgache** : langues mg/fr/en, régions, institutions locales.

## 3. Stack (ne pas la changer sans accord de l'équipe)

- Next.js 16 (App Router, `cacheComponents`) + TypeScript strict + Tailwind CSS v4. **Un seul repo**, les routes `app/api/*` sont le backend.
- i18n : `next-intl`, langue par cookie `NEXT_LOCALE` (`mg` | `fr` | `en`, défaut `mg`), messages **imbriqués** (jamais de clé contenant un point).
- IA : SDK `openai` pointé sur OpenRouter. Recherche web : plugin `web` d'OpenRouter (`webSearch` dans `askJson`). Validation : `zod`.
- Données : Supabase (auth anonyme + annuaire `experts` avec RLS), `data/stats.json` (Banque mondiale), `localStorage` pour "Mes dossiers".
- Détection d'image générée par IA : API Sightengine (modèle `genai`, `lib/sightengine.ts`), appelée par `fetch` sans SDK ; l'image envoyée est réduite et sans métadonnées. Indice 0–100 indicatif (`lib/ai-detection.ts`), jamais une preuve.
- Images : `sharp` (orientation, réduction, sans métadonnées), `exifr` (EXIF, aussi lu dans le navigateur), `image-size`. Vidéo : 6 images clés extraites **dans le navigateur** (pas de ffmpeg côté serveur).
- Animations : `three` + `@react-three/fiber` (scène 3D de la landing), `gsap` + `lenis` (scènes scrubées), `motion` (transitions de l'application).
- Tests : `vitest` (`tests/api/*.test.ts`) et `node --test` (`tests/*.test.mjs`). CI : `.github/workflows/ci.yml`.

## 4. Commandes

```bash
npm run dev            # développement (USE_MOCK=true possible ici seulement)
npm run build
npm start              # tester en conditions réelles (le mode mock est ignoré en production)
npm run lint
npm test               # vitest puis node --test
npm run stats:update   # rafraîchit data/stats.json depuis l'API de la Banque mondiale
```

## 5. Structure

```
app/
  page.tsx                      # landing immersive
  credits/page.tsx              # crédits photos
  app/{verify,image,monitor,translate,experts,stats,angles,files}/page.tsx
  api/verify/{text,image,video}/route.ts
  api/sources/suggest/route.ts  # experts
  api/editorial/angles/route.ts
  api/translate/route.ts
components/landing/             # scènes scrubées, DispatchCloud (3D)
components/workspace/           # écrans de l'application
lib/ai/client.ts                # SEUL point d'appel au modèle (askJson, askText, isMockMode, AiError)
lib/ai/models.ts                # tâche → modèle (AI_MODEL_<TASK>, sinon AI_MODEL ; AI_FALLBACK_MODEL partagé)
lib/ai/prompts/                 # tous les prompts
lib/ai/{verify,angles,translate,schemas,glossary}.ts
lib/translation-checks.ts       # contrôle des traductions (langue, sortie inchangée, découpage)
lib/vision-analyzer.ts          # image → modèle de vision (tâche vision)
lib/image-intake.ts             # réception des images et des images clés vidéo
lib/video-frames.ts             # instants des images clés, regroupement par instant
lib/browser/                    # préparation côté navigateur (compression, images clés)
lib/score.ts                    # indice de confiance calculé par le code
lib/security/                   # auth, ratelimit, safe-fetch (SSRF), request (headers, body, erreurs)
lib/cache.ts, lib/demo/replay.ts
lib/api/{contract,fetcher}.ts   # types partagés avec le frontend
lib/experts/, lib/db/experts.ts # annuaire
lib/dossiers.ts, lib/stats.ts
data/stats.json, data/image-credits.json
supabase/{migrations,seed.sql}
messages/{mg,fr,en}.json
```

## 6. Règles de code

- TypeScript strict, pas de `any`.
- Tout appel externe (IA, Supabase, page web) : **timeout + try/catch + message utilisateur clair**.
- Toute entrée API est validée avec `zod` ; toute sortie d'IA aussi.
- Une fonction = une responsabilité. Les composants UI ne contiennent pas de logique métier.
- Pas de nouvelle dépendance sans l'ajouter à `LICENSES.md` (nom, version, licence) : l'article 6 du règlement l'exige.
- Pas de commentaires dans le code : le *pourquoi* va dans le message de commit ou la PR.
- Petits changements, faciles à relire. Ne réécris pas un fichier entier pour modifier 3 lignes.

## 7. Règles IA (cruciales)

- **Tous** les appels au modèle passent par `lib/ai/client.ts` : `askJson` (sortie JSON validée par zod) ou
  `askText` (texte brut), avec une `task` (`verify`, `translate`, `vision`, `experts`, `angles`) qui choisit le
  modèle via `lib/ai/models.ts`. Le champ `user` accepte du texte ou des parties `text` + `image_url`.
  Jamais d'appel direct ailleurs.
- **Tous** les prompts sont dans `lib/ai/prompts/`. Aucun prompt inline dans une route.
- Le contenu utilisateur est une **donnée** : toujours entre balises (`<content_to_verify>…</content_to_verify>`),
  balises neutralisées dans le contenu, consigne d'ignorer tout ordre qu'il contient.
- Sortie = JSON uniquement, validé par zod, une relance en cas d'échec, puis `AI_FALLBACK_MODEL` si défini.
  En cas d'échec final : **erreur claire**, jamais de fausse réponse. `USE_MOCK=true` n'existe que pour le
  développement : il est ignoré quand `NODE_ENV=production`, ses sorties portent `mock: true` et l'interface
  affiche un badge "Démonstration".
- Le **score est calculé par le code** (`lib/score.ts`), jamais "décidé" par le modèle : type de source,
  sens, domaines distincts, date, contradictions. Le nombre de sources seul ne suffit pas.
- Quota limité : cache par utilisateur (`lib/cache.ts`), limites IP + utilisateur + jour (`lib/security/ratelimit.ts`,
  partagées via Supabase si `RATE_LIMIT_STORE=supabase`, en mémoire sinon).
- L'assistant éditorial ne part que des affirmations `confirmed`. Il propose des **profils**, jamais des noms.
- Le malagasy est moins bien géré par les modèles : ne pas promettre plus que ce qui a été testé.

## 8. Sécurité

- Secrets uniquement dans `.env.local` (ignoré par git). `.env.example` sans valeurs réelles.
- Jamais de clé dans le code, les logs, les messages d'erreur ou le client (`NEXT_PUBLIC_` interdit pour une clé ;
  la clé anon Supabase est publique par conception, la clé service role ne l'est pas).
- Chaque route IA : session Supabase (anonyme acceptée), limites IP + utilisateur + jour, taille du corps,
  zod strict en entrée et en sortie, erreurs génériques côté client, journaux sans contenu soumis.
- URL fournie par l'utilisateur : **uniquement via `lib/security/safe-fetch.ts`** (http/https, IP publiques,
  ports standard, 3 redirections revérifiées, 2 Mo, délai `URL_FETCH_TIMEOUT_MS`). Jamais de `fetch` direct.
- Les erreurs renvoyées au client ne contiennent aucun détail technique.

## 9. i18n

- Aucune chaîne en dur dans les composants : `useTranslations()` / `getTranslations()`.
- Toute nouvelle clé est ajoutée **dans les 3 fichiers** `messages/*.json`.
- Les traductions malagasy sont à faire relire par un locuteur de l'équipe avant la démo.
- Dates et nombres formatés avec la locale courante (`Intl`).

## 10. Design

Direction "Site Immersif" (voir le skill du même nom) : sombre "latérite", typographique, animé.
- Tokens dans `app/globals.css` : `--bone`, `--surface`, `--ink`, `--ash`, `--accent` (cuivre, seul accent),
  `--accent-deep` (petits boutons), statuts `--st-*`. Polices : Bricolage Grotesque + DM Mono.
- Thème sombre d'origine (`--bone: #15130f`, surfaces `#221e19` et `#2b2620`), thème clair crème avec encre marron. Chaque couleur
  est un token redéfini sous `:root[data-theme="light"]` ; `tests/theme.test.mjs` vérifie le niveau AA des deux.
- Logo source : `assets/zahavania.png`. Les icônes (favicon, PWA, Apple) en sont dérivées par
  `node scripts/generate-icons.mjs` ; ne pas les retoucher à la main.
- Filets fins plutôt que cartes ombrées. Pas de dégradé décoratif, pas de glassmorphism, pas d'emoji.
- Aucune image générée par IA. Les visuels viennent de la 3D, de la typographie, des pictogrammes SVG et de
  photos réelles de Madagascar sous licence libre (Wikimedia Commons), réduites, sans métadonnées, stockées dans
  `public/images/landing/` et créditées dans `data/image-credits.json` et sur la page `/credits`.
- Mobile first. Cibles tactiles ≥ 44 px. `prefers-reduced-motion` respecté partout.
- Le statut n'est jamais indiqué par la couleur seule : toujours un libellé + un symbole.

## 11. Hors ligne

Le hors-ligne complet reste hors périmètre (décision d'équipe). L'application est une PWA installable
(`app/manifest.ts`, icônes dans `public/icons/`, régénérées par `scripts/generate-icons.mjs`).
`public/sw.js` ne fait qu'une chose : afficher `/offline` quand une navigation échoue faute de réseau.
Il ne met en cache ni les appels `/api`, ni les pages, et il n'y a aucune file d'attente.
Les données de "Mes dossiers" restent sur l'appareil (`localStorage`).

## 12. Priorités

- **P0** : vérification IA avec sources + indice explicable ; analyse d'image simple.
- **P1** : annuaire ; angles de reportage ; multilingue ; PWA.
- **P2** : veille avec regroupement et alertes ; statistiques ; hors-ligne avancé.
- Si le temps manque, on **retire** une fonctionnalité P2 plutôt que de la livrer simulée.
- Mardi midi : gel des fonctionnalités. Ensuite : tests, correctifs, pitch.

## 13. Définition de "terminé"

- Le parcours fonctionne de bout en bout en conditions réelles (pas seulement en mock).
- États gérés : chargement, erreur, vide, hors ligne.
- Textes dans les 3 langues. Pas d'erreur de lint ni de build.
- Aucun secret dans le dépôt. `LICENSES.md` à jour.
- Testé sur téléphone.

## 14. Interdits

- Afficher "vrai", "faux", "100 % fiable" ou toute certitude non étayée.
- Inventer des données, des sources, des contacts ou des statistiques sans le marquer "fictif / démonstration".
- Scraper des sites sans autorisation ou republier des articles entiers (veille : titre, lien, extrait court).
- Stocker ou journaliser des documents confidentiels soumis par un journaliste.
- Ajouter une dépendance lourde ou une techno non listée sans l'accord de l'équipe.

## 15. Si tu es bloqué

Dis ce qui bloque et propose la version la plus simple qui respecte les règles de la section 2.
Ne contourne jamais une règle produit pour "faire marcher la démo".

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
