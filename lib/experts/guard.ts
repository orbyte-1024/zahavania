export type RankedRefSuggestion = {
  ref: string;
  relevance: number;
};

export function applySuggestionGuard<T extends RankedRefSuggestion>(
  suggestions: readonly T[],
  allowedRefs: ReadonlySet<string>,
  limit: number,
): T[] {
  const bestByRef = new Map<string, T>();

  for (const suggestion of suggestions) {
    if (!allowedRefs.has(suggestion.ref)) continue;
    const current = bestByRef.get(suggestion.ref);
    if (!current || suggestion.relevance > current.relevance) {
      bestByRef.set(suggestion.ref, suggestion);
    }
  }

  return [...bestByRef.values()]
    .sort((a, b) => b.relevance - a.relevance || a.ref.localeCompare(b.ref))
    .slice(0, limit);
}
