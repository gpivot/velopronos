import type { SupabaseClient } from "@supabase/supabase-js";
import { getLeaderboard } from "./leaderboard";
import { shortAthleteName } from "./athleteName";
import { getBonusQuestionLedger } from "./bonusQuestions";

/** Classement des joueurs sur une course notée (page de la course). */
export interface RacePlayerRow {
  userId: string;
  pseudo: string;
  points: number;
  /** Place, ex æquo compris (deux joueurs à 120 pts sont tous deux 1ers, le suivant est 3e). */
  rank: number;
}

/** Partie pure (testée) : tri décroissant et places avec ex æquo. */
export function rankPlayers(rows: Omit<RacePlayerRow, "rank">[]): RacePlayerRow[] {
  const sorted = [...rows].sort((a, b) => b.points - a.points || a.pseudo.localeCompare(b.pseudo));
  return sorted.map((row) => ({
    ...row,
    rank: sorted.findIndex((r) => r.points === row.points) + 1,
  }));
}

export async function getRacePlayers(supabase: SupabaseClient, raceId: string): Promise<RacePlayerRow[]> {
  const [{ data, error }, bonusLedger] = await Promise.all([
    supabase.from("score_ledger").select("user_id, points, profiles!inner(pseudo, signup_pending)").eq("profiles.signup_pending", false).eq("race_id", raceId),
    getBonusQuestionLedger(supabase, [raceId]),
  ]);
  if (error) console.error("getRacePlayers:", error.message);
  // Pronostic + questions bonus de la course, additionnés par joueur.
  const byUser = new Map<string, Omit<RacePlayerRow, "rank">>();
  for (const row of [
    ...(data ?? []).map((row: any) => ({ userId: row.user_id as string, pseudo: row.profiles?.pseudo ?? "?", points: Number(row.points) })),
    ...bonusLedger,
  ]) {
    const existing = byUser.get(row.userId);
    if (existing) existing.points = Math.round((existing.points + row.points) * 10) / 10;
    else byUser.set(row.userId, { ...row });
  }
  return rankPlayers(Array.from(byUser.values()));
}

/** Course en cours : classement général de tous les joueurs, avec leur pronostic sur cette course. */
export interface OngoingBoardRow {
  userId: string;
  pseudo: string;
  /** Place au classement général (avant cette course). */
  rank: number;
  points: number;
  /** Biathlètes (ou nation) pronostiqués, null sans pronostic. */
  picks: string | null;
}

/**
 * Partie pure (testée) : le classement général, puis les joueurs qui ont pronostiqué cette course
 * sans avoir encore de points (0 pt, à la suite). Les pronostics des autres ne sont lisibles
 * qu'une fois la course partie (migration 0018).
 */
export function buildOngoingBoard(
  leaderboard: { userId: string; pseudo: string; points: number }[],
  predictions: { userId: string; pseudo: string; picks: string }[]
): OngoingBoardRow[] {
  const picksByUser = new Map(predictions.map((p) => [p.userId, p.picks]));
  const rows = [...leaderboard];
  for (const p of predictions) {
    if (!rows.some((r) => r.userId === p.userId)) rows.push({ userId: p.userId, pseudo: p.pseudo, points: 0 });
  }
  return rankPlayers(rows).map((r) => ({ ...r, picks: picksByUser.get(r.userId) ?? null }));
}

export async function getOngoingBoard(
  supabase: SupabaseClient,
  seasonId: string,
  raceId: string
): Promise<OngoingBoardRow[]> {
  const [leaderboard, { data: predictions }] = await Promise.all([
    getLeaderboard(supabase, seasonId),
    supabase.from("predictions").select("user_id, athlete_ids, nation_code, team_ids, profiles!inner(pseudo, signup_pending)").eq("profiles.signup_pending", false).eq("race_id", raceId),
  ]);
  const rows = ((predictions ?? []) as any[]).filter((p) => (p.athlete_ids?.length ?? 0) > 0 || p.nation_code || (p.team_ids?.length ?? 0) > 0);
  const teamIds = Array.from(new Set(rows.flatMap((p) => p.team_ids ?? []))) as string[];
  const athleteIds = Array.from(new Set(rows.flatMap((p) => p.athlete_ids ?? []))) as string[];
  const nationCodes = Array.from(new Set(rows.map((p) => p.nation_code).filter(Boolean))) as string[];
  const [{ data: athletes }, { data: nations }, { data: teams }] = await Promise.all([
    athleteIds.length ? supabase.from("athletes").select("id, first_name, last_name").in("id", athleteIds) : Promise.resolve({ data: [] as any[] }),
    nationCodes.length ? supabase.from("nations").select("code, name").in("code", nationCodes) : Promise.resolve({ data: [] as any[] }),
    teamIds.length ? supabase.from("teams").select("id, name").in("id", teamIds) : Promise.resolve({ data: [] as any[] }),
  ]);
  const athleteById = new Map((athletes ?? []).map((a: any) => [a.id as string, a]));
  const nationName = new Map((nations ?? []).map((n: any) => [n.code as string, n.name as string]));
  const teamName = new Map((teams ?? []).map((x: any) => [x.id as string, x.name as string]));
  return buildOngoingBoard(
    leaderboard,
    rows.map((p) => ({
      userId: p.user_id,
      pseudo: p.profiles?.pseudo ?? "?",
      picks: (p.team_ids?.length ?? 0) > 0
        ? (p.team_ids as string[]).map((id) => teamName.get(id) ?? "?").join(", ")
        : p.nation_code
        ? nationName.get(p.nation_code) ?? p.nation_code
        : (p.athlete_ids ?? []).map((id: string) => shortAthleteName(athleteById.get(id))).join(", "),
    }))
  );
}
