/**
 * Limite du Chat noir (décision de Guillaume du 05/11/2026) : le 1er jour de repos à partir de
 * l'étape 8, c'est-à-dire le départ de la 1re étape (n° >= 9) qui suit un jour sans course. Faute de
 * jour de repos repéré, le départ de l'étape 10. Les jours se comptent à l'heure de Paris.
 */
export const CHAT_NOIR_REST_AFTER_STAGE = 8;
export const CHAT_NOIR_FALLBACK_STAGE = 10;

const parisDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
const dayGap = (a: string, b: string) => Math.round((Date.parse(parisDay(b)) - Date.parse(parisDay(a))) / 86_400_000);

export function chatNoirDeadline(races: { locks_at: string; stage_number: number | null }[]): string | null {
  const sorted = races.filter((r) => r.stage_number != null).sort((a, b) => a.locks_at.localeCompare(b.locks_at));
  for (let i = 1; i < sorted.length; i++) {
    if ((sorted[i].stage_number ?? 0) <= CHAT_NOIR_REST_AFTER_STAGE) continue;
    if (dayGap(sorted[i - 1].locks_at, sorted[i].locks_at) >= 2) return sorted[i].locks_at;
  }
  return sorted.find((r) => (r.stage_number ?? 0) >= CHAT_NOIR_FALLBACK_STAGE)?.locks_at ?? null;
}
