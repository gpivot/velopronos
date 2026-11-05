import { nameVariants } from "./resultsCsv";

/**
 * Saisie d'un résultat d'étape place par place (VéloPronos) : une ligne par place (1 à 10, plus
 * les lignes ajoutées sur une étape Crevaison), un coureur ou une équipe par ligne, jamais deux fois.
 */
export const TOP_SLOTS = 10;

export type Slots = Array<string | null>;

/**
 * Lignes d'après des rangs (résultat déjà saisi, import CSV ou IA). Un rang déjà pris (ex aequo,
 * doublon) passe à la première ligne libre suivante. Toujours au moins `minLength` lignes.
 */
export function slotsFromRanks(entries: Array<{ id: string; rank: number }>, minLength = TOP_SLOTS): Slots {
  const sorted = entries.filter((e) => Number.isInteger(e.rank) && e.rank > 0).sort((a, b) => a.rank - b.rank);
  const slots: Slots = Array(minLength).fill(null);
  const placed = new Set<string>();
  for (const e of sorted) {
    if (placed.has(e.id)) continue;
    let index = e.rank - 1;
    while (slots[index] != null) index++;
    while (slots.length <= index) slots.push(null);
    slots[index] = e.id;
    placed.add(e.id);
  }
  return slots;
}

/** Résultats à enregistrer : rang = numéro de la ligne. */
export function rankedIds(slots: Slots): Array<{ id: string; rank: number }> {
  return slots.flatMap((id, index) => (id ? [{ id, rank: index + 1 }] : []));
}

/** Retire les lignes vides en fin de liste au-delà du Top 10. */
export function trimSlots(slots: Slots, minLength = TOP_SLOTS): Slots {
  let end = slots.length;
  while (end > minLength && slots[end - 1] == null) end--;
  return slots.slice(0, end);
}

export interface SearchableCandidate {
  id: string;
  name: string;
  /** Autres libellés cherchables (code équipe, nation…). */
  extra?: string[];
}

/**
 * Candidats dont un mot du nom commence par la saisie (« pog », « van der p »…), sans accents ni
 * casse, en excluant ceux déjà placés sur une autre ligne. Ordre d'origine conservé (favoris d'abord).
 */
export function searchCandidates<T extends SearchableCandidate>(query: string, candidates: T[], excludeIds: Set<string>, limit = 8): T[] {
  const wanted = nameVariants(query);
  if (wanted.every((w) => w === "")) return candidates.filter((c) => !excludeIds.has(c.id)).slice(0, limit);
  const matches = (label: string) =>
    nameVariants(label).some((variant) => {
      const words = variant.split(" ");
      return wanted.some((w) => w !== "" && words.some((_, i) => words.slice(i).join(" ").startsWith(w)));
    });
  return candidates.filter((c) => !excludeIds.has(c.id) && [c.name, ...(c.extra ?? [])].some(matches)).slice(0, limit);
}
