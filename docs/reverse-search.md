# Recherche inversée d'images — Checkeko

## Principe (AGENTS.md §14)

Checkeko ne fait **aucun scraping** sur TinEye, Google Lens ou Yandex. La route `/api/verify/image` expose des liens cliquables (`reverseSearchLinks` dans `lib/reverse-search.ts`) que le journaliste ouvre manuellement. L'image n'est jamais envoyée automatiquement à ces services.

## Liens disponibles

- `https://lens.google.com/` — Google Lens
- `https://tineye.com/` — TinEye

## Pourquoi pas un appel API automatique ?

1. **Sécurité** : pas de clé côté client (`NEXT_PUBLIC_` interdit, AGENTS.md §8).
2. **Respect des conditions** : TinEye et Google Lens n'exposent pas d'API publique gratuite simple sans authentification complexe.
3. **Transparence** : le journaliste voit le site source et décide lui-même de la recherche (`AGENTS.md §2` : le journaliste décide).

## Code

Les liens viennent de `reverseSearchLinks()` (`lib/reverse-search.ts`), qui renvoie une liste fermée d'adresses fixes et ne fait aucun `fetch` ni `curl`.
