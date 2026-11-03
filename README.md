# Zahavan'Ia
 
**Assistant d'investigation journalistique pour Madagascar.** Zahavan'Ia aide un
journaliste à passer d'une information reçue à une information vérifiée : vérifier
un texte ou un lien, analyser une image ou une vidéo, retrouver des chiffres
sourcés, identifier des experts consentants et dégager des angles de reportage.
 
Interface en malagasy, français et anglais. Projet de hackathon, construit avec
Next.js 16.
 
## Fonctionnalités
 
- **Vérifier un texte ou un lien** : les affirmations sont isolées, confrontées à
  une recherche web, et chaque conclusion renvoie à des sources cliquables.
- **Analyser une image ou une vidéo** : métadonnées EXIF, indices visuels,
  anomalies et liens de recherche inversée. Une vidéo est réduite à 6 images
  clés extraites dans le navigateur.
- **Traduire** entre malagasy, français et anglais, avec un contrôle automatique
  de la sortie et un signalement « à relire » pour le malagasy.
- **Trouver un expert** dans un annuaire de profils consentants, filtré par
  domaine, région et langue.
- **Consulter des statistiques** de la Banque mondiale sur Madagascar, avec
  année, source et date de mise à jour.
- **Proposer des angles** de reportage à partir des seules affirmations confirmées.
- **Enregistrer un dossier** localement, dans le navigateur du journaliste.
 
La veille (`/app/monitor`) est prévue mais désactivée.
 
## Principes
 
- Aucun verdict « vrai / faux » : les statuts sont `confirmed`, `contradicted`,
  `insufficient` ou `needs_verification`.
- L'indice de confiance (0–100) est calculé par le code, avec un détail
  explicable. Il mesure la qualité des preuves trouvées, pas la vérité du fait.
- Une affirmation sans source exploitable est `insufficient`.
- L'IA n'invente ni source, ni citation, ni expert : les URL non renvoyées par
  la recherche web sont retirées, et les experts viennent uniquement de
  l'annuaire.
- Une image sans anomalie n'est pas « authentique » : l'analyse reste un indice.
- Le journaliste décide : chaque rapport peut être validé, complété ou rejeté.
 
## Stack
 
Next.js 16 (App Router), React 19, TypeScript strict, Tailwind CSS v4,
`next-intl`, Supabase (auth anonyme, annuaire, limiteurs partagés), SDK `openai`
pointé sur OpenRouter, `zod`, `sharp` / `exifr`, `three`, `gsap`, `motion`.
Tests avec Vitest et `node --test`.
 
## Démarrage
 
Prérequis : Node.js 24 et npm.
 
```bash
cp .env.example .env.local   # renseigner au minimum la clé OpenRouter et Supabase
npm install
npm run dev
```
 
L'application est disponible sur <http://localhost:3000>.
 
### Base de données locale (optionnel)
 
```bash
npx supabase start
npx supabase db reset        # applique les migrations et le seed de démonstration
```
 
Les 16 profils du seed sont **fictifs** et marqués comme tels.
 
### Sans clé d'IA
 
`USE_MOCK=true` renvoie des réponses déterministes marquées `mock: true`, à des
fins de développement uniquement. Le mode est ignoré en production.
 
## Configuration
 
Toutes les variables sont documentées dans `.env.example`. Les principales :
 
| Variable | Rôle |
| --- | --- |
| `LLM_BASE_URL`, `LLM_API_KEY`, `AI_MODEL` | Point d'accès OpenRouter, clé et modèle par défaut |
| `AI_MODEL_VERIFY`, `_TRANSLATE`, `_VISION`, `_EXPERTS`, `_ANGLES` | Modèle par tâche (facultatif, retombe sur `AI_MODEL`) |
| `AI_FALLBACK_MODEL` | Second modèle essayé une fois en cas d'échec |
| `AI_DAILY_LIMIT_PER_USER` | Quota quotidien par utilisateur et par route |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Projet Supabase (clé publique par conception) |
| `SUPABASE_SERVICE_ROLE_KEY` | Serveur uniquement : seed local, limiteurs partagés |
| `RATE_LIMIT_STORE=supabase` | Limites partagées entre instances au lieu de la mémoire |
| `DEMO_MODE` | Ignore l'authentification en développement uniquement |
| `USE_MOCK` | Données de démonstration en développement uniquement |
 
Aucune clé ne doit être préfixée `NEXT_PUBLIC_` en dehors de la clé anonyme
Supabase.
 
## Scripts
 
| Commande | Effet |
| --- | --- |
| `npm run dev` | Serveur de développement |
| `npm run build` / `npm start` | Build de production et serveur réel |
| `npm run lint` | ESLint |
| `npm test` | Tests Vitest puis `node --test` |
| `npm run stats:update` | Rafraîchit `data/stats.json` depuis la Banque mondiale |
| `npm run check:real` | Vérifie les routes IA sur un serveur réel (hors mock) |
 
## Architecture
 
```text
app/
  page.tsx                  landing
  app/                      écrans de l'application
  api/                      routes backend (verify, sources, editorial, translate)
components/landing/         scènes 3D et animations
components/workspace/       écrans de travail
lib/ai/                     client IA unique, prompts, schémas, modèles
lib/security/               auth, rate limit, safe-fetch
lib/score.ts                calcul de l'indice de confiance
i18n/, messages/            traductions mg / fr / en
data/                       statistiques, agenda, crédits photos
supabase/                   migrations et seed
tests/, docs/               tests et documentation
```
 
## API
 
Toutes les routes sont en `POST`, exigent une session Supabase (anonyme
acceptée) et appliquent limites de débit, quota quotidien et validation Zod.
Les erreurs sont génériques. Le contrat complet est décrit dans
[`docs/api.md`](docs/api.md).
 
| Route | Rôle |
| --- | --- |
| `/api/verify/text` | Vérifier un texte ou une URL |
| `/api/verify/image` | Analyser une image et ses métadonnées |
| `/api/verify/video` | Analyser les images clés d'une vidéo |
| `/api/sources/suggest` | Proposer des experts de l'annuaire |
| `/api/editorial/angles` | Proposer des angles à partir des faits confirmés |
| `/api/translate` | Traduire un texte (5 000 caractères max) |
 
## Sécurité et vie privée
 
- Clés strictement côté serveur ; aucune clé dans le client, les logs ou les
  messages d'erreur.
- Les URL fournies passent par `lib/security/safe-fetch.ts` (HTTP/HTTPS, IP
  publiques, ports standard, redirections revérifiées, taille et délai bornés).
- Aucun contenu soumis n'est journalisé. Les dossiers restent dans le
  `localStorage` du journaliste.
- Limites de débit par IP et par utilisateur, partagées via Supabase si
  `RATE_LIMIT_STORE=supabase`.
- Le contenu utilisateur est traité comme une donnée, jamais comme une
  instruction ; les sources inventées sont écartées par le code.
 
## Tests et CI
 
`npm test` exécute les tests d'API (Vitest) et les tests de logique
(`node --test`). La CI GitHub Actions vérifie le typecheck, le lint, les tests
et le build avec `USE_MOCK=true`.
 
## Déploiement
 
- **Vercel** : guide détaillé dans [`docs/deploy-vercel.md`](docs/deploy-vercel.md).
  Les routes IA ont un `maxDuration` allant jusqu'à 300 s.
- **Docker** : `docker compose up --build` construit l'image `standalone` et
  expose l'application sur le port 3000.
 
## Limites connues
 
- Le malagasy est moins bien maîtrisé par les modèles : toute traduction vers ou
  depuis cette langue est signalée « à relire ».
- La recherche web d'OpenRouter est facturée séparément ; sans crédits, les
  vérifications restent `insufficient`.
- Le cache de réponses et les limiteurs sont en mémoire sauf configuration
  Supabase.
- Le mode hors ligne se limite à une page `/offline` ; les données ne sont pas
  mises en cache.
 
## Documentation
 
| Fichier | Contenu |
| --- | --- |
| [`AGENTS.md`](AGENTS.md) | Règles produit, techniques et de sécurité |
| [`docs/api.md`](docs/api.md) | Contrat des routes API |
| [`README_AI.md`](README_AI.md) | Configuration IA, modèles, cache et démo |
| [`docs/demo.md`](docs/demo.md) | Script de démonstration (3 minutes) |
| [`docs/deploy-vercel.md`](docs/deploy-vercel.md) | Déploiement sur Vercel |
| [`docs/reverse-search.md`](docs/reverse-search.md) | Recherche inversée d'images |
