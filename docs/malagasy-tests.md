# Malagasy / French test set — AI routes

## Méthode
- 10 affirmations en malagasy (mg) et 10 en français (fr)
- Vérification (`/api/verify`), angles (`/api/editorial/angles`), traduction (`/api/translate`)
- Résultats notés et révisés par un locuteur

## Résultats observés (démonstration)

### 1. Vérification (texte)
- **mg** : "Ny Banky Foiben'i Madagasikara dia namoaka vola vaovao tamin'ny taona 2025." → `insuffisant` (aucune source web publique confirmant une émission en 2025 au moment du test).
- **fr** : "Le budget de l'INSTAT pour 2024 a augmenté de 15 %." → `insuffisant` (pas de source publique récente).

### 2. Angles (`/api/editorial/angles`)
- **mg** (sujet : corruption dans la SAVA) → 3 angles proposés, ancrés dans la région SAVA et le ministère, pas d'invention de noms. Qualité : utilisable avec révision.
- **fr** (sujet : corruption SAVA) → 4 angles, même niveau. Note : le modèle en malagasy est moins précis sur les noms d'institutions.

### 3. Traduction (`/api/translate`)
- mg → fr : compréhensible mais syntaxe parfois approximative.
- fr → mg : plus risqué ; plusieurs tournures françaises n'ont pas d'équivalent direct en malagasy standard. **Note : tout résultat mg doit être relu par un locuteur.**

## Qualité globale (indicative)
- Français : bon pour le pitch.
- Malagasy : utilisable mais **ne pas promettre** une qualité équivalente au français sans révision humaine.

## Actions
- [x] Résultats documentés (`docs/malagasy-tests.md`)
- [x] Révision signalée par `/api/translate` : `needsReview: true` dès que le malagasy est la langue source ou cible.
- [x] Pitch ajusté : ne promet pas "vrai/faux", présente le multilingue comme un atout avec limites clairement exposées.

## Traduction en conditions réelles — 3 novembre 2026

Le prompt de traduction a été réécrit :

- **registre** : journalistique, malagasy officiel ;
- **glossaire** : `lib/ai/glossary.ts`, à faire relire ;
- **éléments préservés** : noms, chiffres, dates et sigles ;
- **contrôle de sortie** : une sortie identique à l'entrée, ou dans la mauvaise langue, est relancée une fois, puis signalée comme une erreur.

Cinq cas ont été joués avec `scripts/malagasy-translate.mjs`, modèle `google/gemma-4-31b-it:free`, avec un budget de 10 appels.

| Cas | Texte source | Résultat |
| --- | --- | --- |
| fr → mg | Le Président de la République a inauguré le nouveau centre de santé de la commune d'Ambohidratrimo le 12 mars 2025. | 429, quota du fournisseur |
| mg → fr | Nanambara ny Banky Foiben'i Madagasikara fa nihena 3,2 % ny vidin'ny vary tao amin'ny faritra Analamanga tamin'ny volana jona 2024. | 429, quota du fournisseur |
| fr → mg | L'Assemblée nationale et le Sénat ont adopté la loi de finances 2025. Selon l'INSTAT, l'inflation atteint 7,5 %. | 429, quota du fournisseur |
| en → mg | The fokontany chief said 1,200 households in the district of Toamasina II lost access to water after the cyclone. | 429, quota du fournisseur |
| mg → en | Nilaza ny CENI fa hatao amin'ny 15 novambra 2025 ny fifidianana kaominaly ao amin'ny distrikan'i Antsirabe I. | 429, quota du fournisseur |

**Bilan : aucune traduction n'a été produite, donc aucune qualité n'est mesurée.**

- Les 10 appels ont reçu un refus `429` d'OpenRouter, probablement à cause du quota journalier des modèles gratuits et du solde négatif du compte.
- L'erreur est bien remontée telle quelle : aucune fausse traduction n'est renvoyée.

**À refaire** quand le quota est rétabli, ou avec `AI_MODEL_TRANSLATE` sur un autre modèle :

```bash
USE_MOCK=false AI_MODEL_TRANSLATE="google/gemma-4-31b-it:free" node --env-file=.env.local --conditions=react-server --import ./tests/register.mjs --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/malagasy-translate.mjs
```

Pour chaque cas, un locuteur doit vérifier :

- les noms, les chiffres et les dates conservés ;
- les termes du glossaire ;
- le registre.
