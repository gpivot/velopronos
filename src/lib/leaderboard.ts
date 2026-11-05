import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "./admin/fetchAll";
import { areJokersApplied, loadSeasonJokers } from "./jokers";
import { retainedTotal, type LedgerLine } from "./velo/retainedResults";
import type { CourseKind } from "./velo/courses";

export interface LeaderboardRow {
  userId: string;
  pseudo: string;
  points: number;
}

/**
 * Classement général : agrégat du score_ledger, jamais recalculé à la main. En fin de saison, une
 * fois les jokers activés par l'admin (`seasons.jokers_applied`), les résultats qu'ils effacent sont
 * retirés du total (cf. src/lib/jokers.ts). Les courses des étapes « Autre (×0) », hors classement,
 * ne comptent pas (`score_ledger.counts_in_standings`, migration 0041).
 *
 * VéloPronos : seuls les résultats retenus comptent (tous les Grands Tours et événements bonus, les
 * 2 meilleures courses par étapes, les 8 meilleures classiques ; src/lib/velo/retainedResults.ts).
 */
export async function getLeaderboard(supabase: SupabaseClient, seasonId: string): Promise<LeaderboardRow[]> {
  let ledger: any[];
  let kindByCourseId: Map<string, CourseKind>;
  try {
    // Plus de 1000 lignes dès quelques courses avec beaucoup de joueurs : lecture par pages.
    ledger = await fetchAll<any>((from, to) =>
      supabase.from("score_ledger").select("id, user_id, points, stage_id, races(stage_id), profiles(pseudo)").eq("season_id", seasonId).eq("counts_in_standings", true).order("id").range(from, to)
    );
    const { data: courses, error: coursesError } = await supabase.from("stages").select("id, kind").eq("season_id", seasonId);
    if (coursesError) throw coursesError;
    kindByCourseId = new Map((courses ?? []).map((c: any) => [c.id as string, c.kind as CourseKind]));
  } catch (error) {
    console.error("getLeaderboard:", (error as Error).message);
    return [];
  }

  const totalsByUserId = new Map<string, LeaderboardRow>();
  const linesByUserId = new Map<string, LedgerLine[]>();
  for (const entry of ledger ?? []) {
    if (!totalsByUserId.has(entry.user_id)) {
      totalsByUserId.set(entry.user_id, { userId: entry.user_id, pseudo: (entry.profiles as any)?.pseudo ?? "?", points: 0 });
      linesByUserId.set(entry.user_id, []);
    }
    linesByUserId.get(entry.user_id)!.push({
      courseId: (entry.stage_id as string | null) ?? (entry.races as any)?.stage_id ?? null,
      points: Number(entry.points),
    });
  }
  for (const [userId, lines] of Array.from(linesByUserId)) {
    totalsByUserId.get(userId)!.points = retainedTotal(lines, kindByCourseId).points;
  }

  if (totalsByUserId.size > 0 && (await areJokersApplied(supabase, seasonId))) {
    const jokers = await loadSeasonJokers(supabase, seasonId, Array.from(totalsByUserId.keys()));
    for (const [userId, selection] of Array.from(jokers)) {
      const row = totalsByUserId.get(userId);
      if (row) row.points = Math.round((row.points + selection.delta) * 10) / 10;
    }
  }

  return Array.from(totalsByUserId.values()).sort((a, b) => b.points - a.points);
}
