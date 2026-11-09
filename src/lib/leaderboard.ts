import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "./admin/fetchAll";
import { retainedTotal, type LedgerLine } from "./velo/retainedResults";
import type { CourseKind } from "./velo/courses";

export interface LeaderboardRow {
  userId: string;
  pseudo: string;
  points: number;
}

/**
 * Classement général : agrégat du score_ledger, jamais recalculé à la main (VéloPronos : plus de
 * jokers de fin de saison, remplacés par les résultats retenus). Les courses des étapes « Autre (×0) », hors classement,
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

  return Array.from(totalsByUserId.values()).sort((a, b) => b.points - a.points);
}

export interface RetainedCourseLine {
  courseId: string;
  name: string;
  countryCode: string | null;
  kind: CourseKind;
  startsOn: string;
  points: number;
  /** Comptée dans le classement (false : hors des meilleures retenues). */
  retained: boolean;
}

/**
 * « Jokers de fin de saison » version vélo (Classement, encadré « Mon classement ») : les courses
 * jouées par le joueur, retenues ou écartées par la règle des résultats retenus, et les points
 * écartés. null tant que le joueur n'a aucun point sur une course.
 */
export async function getPlayerRetainedCourses(
  supabase: SupabaseClient,
  seasonId: string,
  userId: string
): Promise<{ courses: RetainedCourseLine[]; droppedPoints: number } | null> {
  const [ledger, { data: stages }] = await Promise.all([
    fetchAll<any>((from, to) =>
      supabase
        .from("score_ledger")
        .select("id, points, stage_id, races(stage_id)")
        .eq("season_id", seasonId)
        .eq("user_id", userId)
        .eq("counts_in_standings", true)
        .order("id")
        .range(from, to)
    ).catch(() => [] as any[]),
    supabase.from("stages").select("id, name, location, kind, country_code, starts_on").eq("season_id", seasonId),
  ]);
  const stageById = new Map(((stages ?? []) as any[]).map((s) => [s.id as string, s]));
  const lines: LedgerLine[] = ledger.map((entry) => ({
    courseId: (entry.stage_id as string | null) ?? (entry.races as any)?.stage_id ?? null,
    points: Number(entry.points),
  }));
  const pointsByCourse = new Map<string, number>();
  for (const line of lines) if (line.courseId) pointsByCourse.set(line.courseId, (pointsByCourse.get(line.courseId) ?? 0) + line.points);
  if (pointsByCourse.size === 0) return null;

  const kindByCourseId = new Map(Array.from(stageById.values()).map((s: any) => [s.id as string, s.kind as CourseKind]));
  const dropped = new Set(retainedTotal(lines, kindByCourseId).droppedCourseIds);
  const courses = Array.from(pointsByCourse)
    .filter(([id]) => stageById.has(id))
    .map(([id, points]) => {
      const s = stageById.get(id);
      return {
        courseId: id,
        name: (s.name ?? s.location) as string,
        countryCode: (s.country_code as string | null) ?? null,
        kind: s.kind as CourseKind,
        startsOn: s.starts_on as string,
        points: Math.round(points * 10) / 10,
        retained: !dropped.has(id),
      };
    })
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  const droppedPoints = courses.filter((c) => !c.retained).reduce((sum, c) => sum + c.points, 0);
  return { courses, droppedPoints: Math.round(droppedPoints * 10) / 10 };
}
