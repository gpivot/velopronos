import type { SupabaseClient } from "@supabase/supabase-js";
import { rankPlayers } from "./racePlayers";
import { shortAthleteName } from "./athleteName";
import { getBonusQuestionLedger } from "./bonusQuestions";
import { getRaceDisplayStatus, type RaceDisplayStatus } from "./raceStatus";

/**
 * Classement filtré de l'onglet Classement : général ou d'une ligue, sur la saison, une étape
 * ou une course. Les pronostics des autres joueurs ne sont montrés que sur les courses
 * verrouillées (règle de la migration 0018, appliquée aussi côté base).
 */

export interface StandingsRace {
  id: string;
  format: string;
  stage_number?: number | null;
  sex: string;
  locks_at: string;
  status: string;
  displayStatus: RaceDisplayStatus;
}

export interface StandingsStage {
  id: string;
  location: string;
  country_code: string | null;
  starts_on: string;
  /** false : étape « Autre (×0) », hors classement : elle a son classement mais pas de dossard rouge. */
  countsInStandings?: boolean;
  races: StandingsRace[];
}

export interface StandingsPick {
  raceId: string;
  format: string;
  sex: string;
  names: string;
}

export interface StandingsRow {
  userId: string;
  pseudo: string;
  points: number;
  rank: number;
  /** Pronostics sur les courses verrouillées de l'étape (ou de la course) choisie, null sinon. */
  picks: StandingsPick[] | null;
}

/** Étape en cours : au moins une course partie et au moins une pas encore notée. */
export function isStageOngoing(stage: Pick<StandingsStage, "races">): boolean {
  return (
    stage.races.some((r) => r.displayStatus !== "upcoming") && stage.races.some((r) => r.displayStatus !== "finished")
  );
}

/** Étape choisie par défaut : la dernière dont une course est partie, sinon la première. */
export function pickDefaultStandingsStageId(stages: Pick<StandingsStage, "id" | "races">[]): string | null {
  const started = stages.filter((s) => s.races.some((r) => r.displayStatus !== "upcoming"));
  return started[started.length - 1]?.id ?? stages[0]?.id ?? null;
}

/**
 * Partie pure (testée) : somme des points par joueur, restreinte aux membres d'une ligue si
 * `members` est donné (les membres sans point y figurent à 0), plus les joueurs qui ont un
 * pronostic sans encore de point. Places avec ex æquo.
 */
export function buildStandings(
  entries: { userId: string; pseudo: string; points: number }[],
  members: { userId: string; pseudo: string }[] | null,
  picksByUser: Map<string, { pseudo: string; picks: StandingsPick[] }> | null
): StandingsRow[] {
  const memberIds = members ? new Set(members.map((m) => m.userId)) : null;
  const totals = new Map<string, { userId: string; pseudo: string; points: number }>();
  const add = (userId: string, pseudo: string, points: number) => {
    if (memberIds && !memberIds.has(userId)) return;
    const row = totals.get(userId);
    if (row) row.points += points;
    else totals.set(userId, { userId, pseudo, points });
  };
  for (const e of entries) add(e.userId, e.pseudo, Number(e.points));
  for (const m of members ?? []) add(m.userId, m.pseudo, 0);
  for (const [userId, p] of Array.from(picksByUser ?? [])) add(userId, p.pseudo, 0);
  return rankPlayers(Array.from(totals.values()).map((r) => ({ ...r, points: Math.round(r.points * 10) / 10 }))).map((r) => ({
    ...r,
    picks: picksByUser ? picksByUser.get(r.userId)?.picks ?? [] : null,
  }));
}

export async function getStandingsStages(supabase: SupabaseClient, seasonId: string, now: Date): Promise<StandingsStage[]> {
  const { data, error } = await supabase
    .from("stages")
    .select("id, location, country_code, starts_on, counts_in_standings, races(id, format, stage_number, sex, locks_at, status)")
    .eq("season_id", seasonId)
    .order("starts_on", { ascending: true });
  if (error) console.error("getStandingsStages:", error.message);
  return (data ?? []).map((stage: any) => ({
    id: stage.id,
    location: stage.location,
    country_code: stage.country_code,
    starts_on: stage.starts_on,
    countsInStandings: stage.counts_in_standings !== false,
    races: ((stage.races ?? []) as any[])
      .map((race) => ({ ...race, displayStatus: getRaceDisplayStatus(race, now) }))
      .sort((a, b) => new Date(a.locks_at).getTime() - new Date(b.locks_at).getTime()),
  }));
}

/** Membres d'une ligue (pseudo compris). */
export async function getLeagueMembers(
  supabase: SupabaseClient,
  leagueId: string
): Promise<{ userId: string; pseudo: string }[]> {
  const { data } = await supabase.from("league_memberships").select("user_id, profiles(pseudo)").eq("league_id", leagueId);
  return ((data ?? []) as any[]).map((m) => ({ userId: m.user_id, pseudo: m.profiles?.pseudo ?? "?" }));
}

/**
 * Classement sur un ensemble de courses (une étape ou une seule course). `withPicks` : joindre
 * les pronostics des joueurs sur celles de ces courses qui sont verrouillées.
 */
export async function getRacesStandings(
  supabase: SupabaseClient,
  races: StandingsRace[],
  members: { userId: string; pseudo: string }[] | null,
  withPicks: boolean,
  /** VéloPronos : course entière, ses points de maillots (score_ledger.jersey) comptent aussi. */
  courseId: string | null = null
): Promise<StandingsRow[]> {
  const raceIds = races.map((r) => r.id);
  if (raceIds.length === 0) {
    // WE des Champions (migration 0056) : pas d'étape, seul le score final de l'événement.
    if (!courseId) return buildStandings([], members, null);
    const { data: bonusRows } = await supabase
      .from("score_ledger")
      .select("user_id, points, profiles(pseudo)")
      .eq("stage_id", courseId)
      .not("bonus_kind", "is", null);
    return buildStandings(
      ((bonusRows ?? []) as any[]).map((r) => ({ userId: r.user_id, pseudo: r.profiles?.pseudo ?? "?", points: Number(r.points) })),
      members,
      null
    );
  }
  const lockedRaces = races.filter((r) => r.displayStatus !== "upcoming");

  const [{ data: ledger, error }, { data: predictions }, bonusLedger, { data: jerseyLedger }] = await Promise.all([
    supabase.from("score_ledger").select("user_id, points, profiles!inner(pseudo, signup_pending)").eq("profiles.signup_pending", false).in("race_id", raceIds),
    withPicks && lockedRaces.length
      ? supabase
          .from("predictions")
          .select("user_id, race_id, athlete_ids, nation_code, profiles!inner(pseudo, signup_pending)")
          .eq("profiles.signup_pending", false)
          .in(
            "race_id",
            lockedRaces.map((r) => r.id)
          )
      : Promise.resolve({ data: [] as any[] }),
    // Questions bonus des courses : leurs 20 pts comptent dans le classement de l'étape.
    getBonusQuestionLedger(supabase, raceIds),
    courseId
      ? supabase.from("score_ledger").select("user_id, points, profiles(pseudo)").eq("stage_id", courseId).not("jersey", "is", null)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  if (error) console.error("getRacesStandings:", error.message);

  let picksByUser: Map<string, { pseudo: string; picks: StandingsPick[] }> | null = null;
  if (withPicks) {
    const rows = ((predictions ?? []) as any[]).filter((p) => (p.athlete_ids?.length ?? 0) > 0 || p.nation_code);
    const athleteIds = Array.from(new Set(rows.flatMap((p) => p.athlete_ids ?? []))) as string[];
    const nationCodes = Array.from(new Set(rows.map((p) => p.nation_code).filter(Boolean))) as string[];
    const [{ data: athletes }, { data: nations }] = await Promise.all([
      athleteIds.length
        ? supabase.from("athletes").select("id, first_name, last_name").in("id", athleteIds)
        : Promise.resolve({ data: [] as any[] }),
      nationCodes.length ? supabase.from("nations").select("code, name").in("code", nationCodes) : Promise.resolve({ data: [] as any[] }),
    ]);
    const athleteById = new Map((athletes ?? []).map((a: any) => [a.id as string, a]));
    const nationName = new Map((nations ?? []).map((n: any) => [n.code as string, n.name as string]));
    const raceOrder = new Map(lockedRaces.map((r, i) => [r.id, i]));
    const raceById = new Map(lockedRaces.map((r) => [r.id, r]));

    picksByUser = new Map();
    for (const p of rows) {
      const race = raceById.get(p.race_id);
      if (!race) continue;
      const entry = picksByUser.get(p.user_id) ?? { pseudo: p.profiles?.pseudo ?? "?", picks: [] as StandingsPick[] };
      entry.picks.push({
        raceId: race.id,
        format: race.format,
        sex: race.sex,
        names: p.nation_code
          ? nationName.get(p.nation_code) ?? p.nation_code
          : (p.athlete_ids ?? []).map((id: string) => shortAthleteName(athleteById.get(id))).join(", "),
      });
      picksByUser.set(p.user_id, entry);
    }
    for (const entry of Array.from(picksByUser.values())) {
      entry.picks.sort((a, b) => (raceOrder.get(a.raceId) ?? 0) - (raceOrder.get(b.raceId) ?? 0));
    }
  }

  return buildStandings(
    [
      ...([...(ledger ?? []), ...(jerseyLedger ?? [])] as any[]).map((l) => ({ userId: l.user_id, pseudo: l.profiles?.pseudo ?? "?", points: Number(l.points) })),
      ...bonusLedger,
    ],
    members,
    picksByUser
  );
}
