// VéloPronos — points des pronostics maillots d'une course (règle base44, saveJerseyResults).
import type { SupabaseClient } from "@supabase/supabase-js";
import { JERSEY_ODDS_FORMAT, type JerseyType } from "./courses";

/** Podium final d'un maillot : cote × 5 / × 2 / × 1. */
export const JERSEY_PODIUM_MULTIPLIERS: Record<number, number> = { 1: 5, 2: 2, 3: 1 };
/** Super combatif : +200 au vainqueur seulement, sans cote. */
export const SUPER_COMBATIF_BONUS = 200;

/**
 * Points d'un pronostic maillot. `podium` : identifiants (coureur ou équipe) aux places 1, 2, 3.
 * Une cote absente compte 1, comme dans l'ancienne app.
 */
export function computeJerseyPoints(jersey: JerseyType, pickId: string | null, podium: Array<string | null>, odds: number | null): number {
  if (!pickId) return 0;
  const rank = podium.findIndex((id) => id === pickId) + 1;
  if (rank === 0) return 0;
  if (jersey === "combatif") return rank === 1 ? SUPER_COMBATIF_BONUS : 0;
  return Math.round((odds && odds > 0 ? odds : 1) * JERSEY_PODIUM_MULTIPLIERS[rank]);
}

/**
 * Enregistre le podium final d'un maillot (remplace la saisie précédente) puis recalcule les points
 * de tous les joueurs sur ce maillot. Podium vide = résultats et points effacés.
 */
export async function saveJerseyResults(
  admin: SupabaseClient,
  stageId: string,
  jersey: JerseyType,
  podium: Array<string | null>
): Promise<{ scored: number }> {
  const isTeam = jersey === "equipe";
  const { error: deleteError } = await admin.from("course_jersey_results").delete().eq("stage_id", stageId).eq("jersey", jersey);
  if (deleteError) throw new Error(deleteError.message);
  const rows = podium
    .map((id, i) => (id ? { stage_id: stageId, jersey, rank: i + 1, athlete_id: isTeam ? null : id, team_id: isTeam ? id : null } : null))
    .filter((r): r is NonNullable<typeof r> => r != null);
  if (rows.length > 0) {
    const { error } = await admin.from("course_jersey_results").insert(rows);
    if (error) throw new Error(error.message);
  }
  return scoreCourseJersey(admin, stageId, jersey);
}

/** Recalcule les lignes du grand livre (score_ledger) d'un maillot de la course. */
export async function scoreCourseJersey(admin: SupabaseClient, stageId: string, jersey: JerseyType): Promise<{ scored: number }> {
  const isTeam = jersey === "equipe";
  const { error: clearError } = await admin.from("score_ledger").delete().eq("stage_id", stageId).eq("jersey", jersey);
  if (clearError) throw new Error(clearError.message);

  const [{ data: stage }, { data: results }, { data: predictions }] = await Promise.all([
    admin.from("stages").select("season_id, races(locks_at)").eq("id", stageId).single(),
    admin.from("course_jersey_results").select("rank, athlete_id, team_id").eq("stage_id", stageId).eq("jersey", jersey),
    admin.from("course_predictions").select("user_id, athlete_id, team_id").eq("stage_id", stageId).eq("jersey", jersey),
  ]);
  if (!stage || !results || results.length === 0 || !predictions || predictions.length === 0) return { scored: 0 };

  const podium: Array<string | null> = [null, null, null];
  for (const r of results) podium[(r.rank as number) - 1] = (isTeam ? r.team_id : r.athlete_id) as string | null;

  // Cote du maillot au départ de la course (celle que voyaient les joueurs), sinon la cote actuelle.
  const start = ((stage.races ?? []) as Array<{ locks_at: string }>).map((r) => r.locks_at).sort()[0] ?? new Date().toISOString();
  const target = isTeam ? "team_id" : "athlete_id";
  const { data: odds } = await admin
    .from("odds")
    .select(`${target}, value, valid_from, valid_until`)
    .eq("stage_id", stageId)
    .eq("format", JERSEY_ODDS_FORMAT[jersey])
    .in(target, podium.filter(Boolean) as string[]);
  const oddsAtStart = new Map<string, number>();
  const currentOdds = new Map<string, number>();
  for (const o of (odds ?? []) as unknown as Array<Record<string, any>>) {
    const id = o[target] as string;
    if (o.valid_until == null) currentOdds.set(id, o.value);
    const t = Date.parse(start);
    if (Date.parse(o.valid_from) <= t && (o.valid_until == null || Date.parse(o.valid_until) > t)) oddsAtStart.set(id, o.value);
  }

  const rows = predictions.map((p) => {
    const pickId = (isTeam ? p.team_id : p.athlete_id) as string | null;
    const odds = pickId ? oddsAtStart.get(pickId) ?? currentOdds.get(pickId) ?? null : null;
    const points = computeJerseyPoints(jersey, pickId, podium, odds);
    return {
      user_id: p.user_id,
      season_id: stage.season_id,
      stage_id: stageId,
      jersey,
      points,
      breakdown: { jersey, pickId, rank: pickId ? podium.indexOf(pickId) + 1 || null : null, odds },
    };
  });
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin.from("score_ledger").insert(rows.slice(i, i + 500));
    if (error) throw new Error(error.message);
  }
  return { scored: rows.length };
}
