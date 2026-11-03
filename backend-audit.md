# Backend audit — Zahavan'ia

Remarque : je n'ai pas fait de correction et je n'ai pas ajouté de commit sans ton autorisation. Ce document est l'état des lieux avant toute action.

## 1. Scope inspecté

- Contexte : `feat/image-verification`
- Endpoint principal : `POST /api/verify/image`
- Fichiers backend lus :
  - `app/api/verify/image/route.ts`
  - `lib/image-intake.ts`
  - `lib/exif.ts`
  - `lib/vision-analyzer.ts`
  - `lib/verification-summary.ts`
  - `lib/reverse-search.ts`
  - `lib/ratelimit.ts`
  - `lib/llm.ts`
  - `lib/prompts.ts`
- Tests lus :
  - `tests/api/verify-image.test.ts`
  - `tests/api/verify-image-metadata.test.ts`
  - `tests/api/verify-image-verification.test.ts`
  - `tests/api/verify-image-reverse-search.test.ts`
  - `tests/api/verify-image-vision.test.ts`
  - `tests/helpers/upload.ts`
  - `tests/helpers/png.ts`
- Configuration lue :
  - `Dockerfile`
  - `docker-compose.yml`
  - `.env.example`
  - `package.json`
  - `next.config.ts`
  - `tsconfig.json`
  - `eslint.config.mjs`
  - `vitest.config.mts`
  - `.gitignore`
  - `AGENTS.md`
- Aucune route `/api/health` n'a été trouvée dans les chemins lisibles à ce stade.

## 2. Ce qui est effectivement implémenté

### 2.1 Upload et validation
- Champ unique `image` attendu, en `multipart/form-data`.
- Rejet des requêtes non multipart.
- Limitation applicative de 5 Mo pour l'image, avec un seuil de corps légèrement au-dessus pour couvrir les en-têtes multipart.
- Les corps trop lourds sont coupés en flux avant d'être entièrement bufferisés.
- Le format est détecté à partir des octets réels, pas d'-trust au MIME ni au nom.
- L'intégrité de la structure est vérifiée pour JPEG, PNG et WebP.
- Contrôle explicite du nombre de fichiers et du type de la valeur dans le formulaire.
- Réponses typées pour les cas d'erreur d'intake (`400`, `413`, `415`).

### 2.2 EXIF
- Lecture sélective depuis `exifr`.
- Exposition volontaire limitée aux métadonnées retenues.
- Présence GPS signalée sans exposition des coordonnées.
- Comportement défini pour WebP, métadonnées absentes, et métadonnées illisibles.
- Le message d'erreur interne de parsing EXIF n'est pas renvoyé au client.

### 2.3 Recherche inversée
- Deux liens statiques : Google Lens et TinEye.
- Réponse stable et non influencée par le corps ou les en-têtes du client.

### 2.4 Analyse visuelle
- L'image est réencodée avant envoi au provider, ce qui retire les métadonnées EXIF du payload envoyé.
- Timeout configuré dans le client LLM.
- Limite fonctionnelle supplémentaire sur la taille de l'image envoyée.
- Réponse validée avec un schéma Zod.
- Mode mock activé par `USE_MOCK=true`.
- Prompt conçu pour ne pas traiter le texte contenu dans l'image comme une instruction.

### 2.5 Synthèse
- Moteur déterministe derrière `buildVerification`.
- Les règles actuelles conservent `non concluant` comme statut par défaut dans les cas couverts par les tests existants.
- Les preuves sont associées à une provenance explicite (`metadata`, `visualAnalysis`, `externalSource`).
- Aucun verdict `indices concordants` n'est produit par le code actuel dans les cas couverts.

### 2.6 Limites de débit
- Rate limiter en mémoire par adresse IP.
- Réponse `429` avec en-tête `Retry-After`.

## 3. Ce qui a été vérifié techniquement

### 3.1 Tests unitaires / d'intégration
- `npm test` exécuté.
- 4 fichiers de tests passent :
  - `tests/api/verify-image-verification.test.ts`
  - `tests/api/verify-image-vision.test.ts`
  - `tests/api/verify-image-reverse-search.test.ts`
  - `tests/api/verify-image.test.ts`
- Un fichier de tests ne s'exécute pas :
  - `tests/api/verify-image-metadata.test.ts`
  - Erreur during run : `Transform failed with 1 error: [PARSE_ERROR] Expected '}' but found 'EOF'`
  - Cette erreur bloque le file, donc les tests EXIF ne sont pas réellement exécutés dans ce run.

### 3.2 Lint
- `npm run lint` exécuté.
- 1 erreur de parsing sur `tests/api/verify-image-metadata.test.ts`.
- Autres problèmes :
  - Warning : variable non utilisée dans `lib/verification-summary.ts`.
  - Warning : variable non utilisée dans `tests/api/verify-image-verification.test.ts`.

### 3.3 Typecheck
- `npx tsc --noEmit` exécuté.
- 1 erreur sur `tests/api/verify-image-metadata.test.ts` (`'}' expected`).
- Aucune autre erreur n'a été rapportée dans la sortie récupérée.

### 3.4 Build
- `npm run build` a été lancé.
- La sortie récupérée ne contient pas encore le verdict final explicite : elle s'arrête à la première ligne d'info Next.js.
- Je ne conclus pas pour l'instant que la build a réussi ou échoué à 100 % ; je relancerai ou relirai le log complet avant de valider le build.

## 4. Architecture identifiée

- App Router, Next.js 16.4.3, TypeScript strict.
- Backend uniquement dans `app/api/*`.
- Aucune base de données au MVP.
- Dépendances notables :
  - `exifr`
  - `image-size`
  - `openai`
  - `zod`
  - `sharp` est utilisé dans l'analyse visuelle, mais il ne figure pas dans `dependencies` au sens de la lecture actuelle de `package.json`.
- Fichier d'exemple : `.env.example` avec `LLM_BASE_URL`, `LLM_API_KEY`, `AI_MODEL`, `USE_MOCK`.
- Secret côté serveur uniquement, via `.env.local` ignoré par git.

## 5. Points forts constatés

- Limitation de taille appliquée avant buffering complet.
- Format détecté depuis les octets, pas depuis le client.
- Structure d'image vérifiée en plus de la signature.
- GPS absente des réponses, même quand elle existe dans l'image.
- Clé IA non exposée au client.
- Réponse d'erreur sans détails techniques internes.
- Prompt défensif face au texte contenu dans l'image.
- Synthèse déterministe, pas de décision automatique du modèle sur le statut final.
- Liens de recherche inversée non modifiables par le client.

## 6. Problèmes identifiés lors de l'audit

### 6.1 Blocage de test EXIF
- `tests/api/verify-image-metadata.test.ts` ne passe pas à la transformation.
- Conséquence : la couverture EXIF n'est pas réellement exécutée ici.
- Action nécessaire avant de pouvoir valider les tests EXIF : corriger ce blocage.

### 6.2 Dépendance de nettoyage d'image
- `lib/vision-analyzer.ts` utilise `sharp` pour réencoder l'image.
- `package.json` ne déclare pas `sharp` dans `dependencies` selon la lecture actuelle.
- Si l'application doit envoyer une image sans EXIF au provider, la dépendance doit être explicite et installée.
- Libellé court : vérifier et déclarer la dépendance si elle n'est pas déjà déclarée ailleurs.

### 6.3 Couverture des erreurs provider
- Les tests existants couvrent bien l'upload et la validation.
- Les scénarios provider autres que le mock (timeout, 401, quota, indisponibilité) ne sont pas encore couverts par des tests automatisés explicites dans les fichiers lus.
- Quelques cas sont partiellement documentés dans les tests de synthèse, mais sans garantie d'exécution locale.

### 6.4 Contrat API documenté
- Aucune doc OpenAPI/Swagger n'a été détectée dans les chemins lus.
- Donc pas de comparaison externe possible pour l'instant entre le contrat attendu et le contrat réel.

### 6.5 Limites du rate limiter
- Map en mémoire.
- Acceptable pour du local/dev, mais à signaler si le produit évolue vers un environnement scale-out ou redémarrage fréquent.
- Pas un bug du code, juste une limite d'architecture.

### 6.6 Build non encore confirmé
- Le build a été lancé, mais le verdict final n'est pas encore arrivé dans la sortie lue.
- Je ne peux pas encore dire `build OK` de façon sûre.

## 7. Sécurité — jugement préliminaire

### Points solides
- Contrôle de la taille en flux.
- Aucune confiance au client pour le format.
- Aucune exposition GPS.
- Aucun log de contenu uploadé visible dans la route principale.
- Clé fournisseur non exposée au client.

### Points à surveiller
- La suppression des EXIF avant envoi dépend de `sharp` ; si elle n'est pas déclarée/dépendante proprement, cette garantie serait fragile.
- Le parseur JSON du fournisseur est un peu tolérant ; la validation Zod doit rester la porte finale.
- Le prompt ne traite pas le texte image comme instruction ; c'est une bonne posture, mais pas une garantie absolue.
- Le rate limiter local ne couvre pas tous les cas proxy/proxy-chain sans normalisation d'en-tête externe.

## 8. Contrat de réponse observé

### Succès
Au moins :
- `ok`
- `file`
- `metadata`
- `warnings`
- `reverseSearch`
- `analysis`
- `verification`

### Erreur d'intake
Au moins :
- `ok`
- `erreur`
- `reverseSearch`

C'est cohérent avec les tests existants.

## 9. Conclusion préliminaire

### État global
Le backend est bien organisé et respecte la plupart des contraintes de sécurité demandées.

### Problème bloquant
Le fichier de tests EXIF ne peut pas être exécuté à cause d'une erreur de parsing/ts dans sa version actuelle.

### Ce qu'il faut vérifier avant de conclure définitivement
- Corriger le blocage de test EXIF.
- Relancer `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build` et confirmer les résultats.
- Déclarer explicitement la dépendance de nettoyage d'image si elle n'est pas déjà déclarée.
- Ajouter les tests d'erreur provider si on veut les couvrir ici.

### Verdict provisoire
**NON PRÊT**, mais pour une raison précise et reproductible : un fichier de tests ne passe pas à la transformation, et la build finale n'a pas encore été confirmée.

Je m'arrête ici pour l'audit. Si tu veux que je passe aux corrections, dis-le moi explicitement. Je commence alors par le blocage de test, puis je re-vérifie lint/typecheck/tests/build.
