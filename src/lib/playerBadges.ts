import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Pictos d'un joueur à côté de son pseudo (Classement, pop-up joueur), repris de VéloPronos :
 * dossard jaune du leader du général, dossard rouge des étapes gagnées, ⚡ bonus ×2 utilisés,
 * 🍾 courses gagnées (meilleur pronostiqueur), ⭐ pronos parfaits, ❄️ Pépite révélée. Le leader
 * dépend du classement affiché : il est passé à part.
 */
export interface PlayerBadges {
  x2Used: number;
  raceWins: number;
  /** Étapes terminées gagnées (plus de points sur l'ensemble des courses de l'étape). */
  stageWins: number;
  /** Courses où le joueur a réussi le Prono parfait. */
  perfectPicks: number;
  /** VéloPronos : porteurs d'eau révélés, comptés seulement dans le classement de leur Grand Tour (badgesInCourse). */
  pepites: number;
  /** Grands Tours où le porteur d'eau du joueur a été révélé. */
  pepiteCourseIds?: string[];
  /** Sexe des Pépites révélées (F, H), pour les mini ♀/♂ à droite du ❄️. */
  pepiteSexes?: ("F" | "H")[];
}

export const X2_PER_SEASON = 3;

export const NO_BADGES: PlayerBadges = { x2Used: 0, raceWins: 0, stageWins: 0, perfectPicks: 0, pepites: 0 };

/**
 * Partie pure (testée) : victoires de course par joueur. Le vainqueur d'une course est le joueur
 * qui y marque le plus de points (ex æquo : tous vainqueurs), à condition d'en marquer.
 */
export function countRaceWins(ledger: { userId: string; raceId: string | null; points: number }[]): Map<string, number> {
  const totals = new Map<string, Map<string, number>>();
  for (const row of ledger) {
    if (!row.raceId) continue;
    const byUser = totals.get(row.raceId) ?? new Map<string, number>();
    byUser.set(row.userId, (byUser.get(row.userId) ?? 0) + Number(row.points));
    totals.set(row.raceId, byUser);
  }
  const wins = new Map<string, number>();
  for (const byUser of Array.from(totals.values())) {
    const best = Math.max(...Array.from(byUser.values()));
    if (!(best > 0)) continue;
    for (const [userId, points] of Array.from(byUser)) {
      if (points === best) wins.set(userId, (wins.get(userId) ?? 0) + 1);
    }
  }
  return wins;
}

/**
 * Partie pure (testée) : étapes gagnées par joueur. Seules les étapes terminées (toutes leurs
 * courses notées) comptent ; le vainqueur est le joueur qui marque le plus de points sur
 * l'ensemble de leurs courses (ex æquo : tous vainqueurs), à condition d'en marquer.
 */
export function countStageWins(
  ledger: { userId: string; raceId: string | null; points: number }[],
  races: { id: string; stageId: string; finished: boolean }[]
): Map<string, number> {
  const stageOfRace = new Map(races.map((r) => [r.id, r.stageId]));
  const finishedStages = new Set(races.map((r) => r.stageId));
  for (const r of races) if (!r.finished) finishedStages.delete(r.stageId);
  const byStage = ledger
    .filter((row) => row.raceId && finishedStages.has(stageOfRace.get(row.raceId) ?? ""))
    .map((row) => ({ userId: row.userId, raceId: stageOfRace.get(row.raceId!)!, points: row.points }));
  // Même calcul que les victoires de course, avec l'étape à la place de la course.
  return countRaceWins(byStage);
}

/**
 * Pictos de tous les joueurs de la saison. Les ×2 joués sur des courses pas encore parties
 * restent invisibles pour les autres joueurs (pronostics cachés, migration 0018) ; les Pépites
 * ne sont lisibles qu'une fois révélées, ce qui est justement ce qu'on affiche.
 */
export async function getPlayerBadges(supabase: SupabaseClient, seasonId: string): Promise<Map<string, PlayerBadges>> {
  const [{ data: ledger }, { data: x2 }, { data: pepites }, { data: races }] = await Promise.all([
    supabase
      .from("score_ledger")
      .select("user_id, race_id, points, perfect:breakdown->pronoParfaitBonus")
      .eq("season_id", seasonId)
      // Étapes hors classement (×0) : ni victoire, ni dossard rouge, ni prono parfait comptés.
      .eq("counts_in_standings", true)
      .not("race_id", "is", null),
    supabase
      .from("predictions")
      .select("user_id, races!inner(stages!inner(season_id))")
      .eq("bonus_x2_used", true)
      .eq("races.stages.season_id", seasonId),
    supabase.from("pepites").select("user_id, stage_id").eq("season_id", seasonId).eq("bonus_claimed", true),
    supabase.from("races").select("id, stage_id, status, stages!inner(season_id)").eq("stages.season_id", seasonId),
  ]);

  const badges = new Map<string, PlayerBadges>();
  const get = (userId: string) => {
    let entry = badges.get(userId);
    if (!entry) badges.set(userId, (entry = { ...NO_BADGES }));
    return entry;
  };
  const ledgerRows = ((ledger ?? []) as any[]).map((l) => ({ userId: l.user_id, raceId: l.race_id, points: Number(l.points) }));
  const wins = countRaceWins(ledgerRows);
  for (const [userId, count] of Array.from(wins)) get(userId).raceWins = count;
  const stageWins = countStageWins(
    ledgerRows,
    ((races ?? []) as any[]).map((r) => ({ id: r.id, stageId: r.stage_id, finished: r.status === "finished" }))
  );
  for (const [userId, count] of Array.from(stageWins)) get(userId).stageWins = count;
  for (const l of (ledger ?? []) as any[]) if (Number(l.perfect ?? 0) > 0) get(l.user_id).perfectPicks += 1;
  for (const p of (x2 ?? []) as any[]) get(p.user_id).x2Used += 1;
  for (const p of (pepites ?? []) as any[]) {
    // VéloPronos : porteurs d'eau révélés (un par Grand Tour) ; le picto ne s'affiche que dans le
    // classement de ce Grand Tour (badgesInCourse), pas dans celui de la saison.
    const entry = get(p.user_id);
    entry.pepiteCourseIds = [...(entry.pepiteCourseIds ?? []), p.stage_id];
  }
  return badges;
}

/** Pictos pour le classement d'une course : le porteur d'eau révélé de ce Grand Tour en plus. */
export function badgesInCourse(badges: Map<string, PlayerBadges>, courseId: string | null): Map<string, PlayerBadges> {
  if (!courseId) return badges;
  const out = new Map<string, PlayerBadges>();
  for (const [userId, b] of Array.from(badges)) {
    out.set(userId, { ...b, pepites: (b.pepiteCourseIds ?? []).filter((id) => id === courseId).length });
  }
  return out;
}
