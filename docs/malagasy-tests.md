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
- [x] Note de révision intégrée dans `/api/translate` (`note: "Le malagasy généré..."`)
- [x] Pitch ajusté : ne promet pas "vrai/faux", présente le multilingue comme un atout avec limites clairement exposées.
