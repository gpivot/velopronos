import type { SupabaseClient } from "@supabase/supabase-js";
import { courseLook, type CourseLook } from "./velo/courseLook";
import { toParisWallTime } from "./displayTimeZone";
import { getRaceDisplayStatus, type RaceDisplayStatus } from "./raceStatus";
import { shortAthleteName } from "./athleteName";

/**
 * Encart « L'étape de la semaine » de l'accueil : l'étape en cours (ou, à
 * défaut, celle qui commence dans les 7 prochains jours) et toutes ses courses,
 * chacune dépliable sur le pronostic du joueur ou son résultat. La course mise en
 * avant (en cours, résultat du jour jusqu'à minuit, sinon la prochaine) est
 * dépliée d'office.
 */

export interface WeekStagePick {
  key: string;
  name: string;
  nationCode: string;
}

export interface WeekStageRace {
  id: string;
  format: string;
  stageNumber?: number | null;
  sex: string | null;
  locksAt: string;
  displayStatus: RaceDisplayStatus;
  /** null : pas de pronostic enregistré. */
  picks: WeekStagePick[] | null;
  /** Course spéciale (malus, ou bonus Fête nationale), comme dans Ma saison. */
  specialRule: string | null;
  /** Bonus ×2 perso joué sur cette course. */
  bonusX2: boolean;
}

export interface WeekStage {
  id: string;
  location: string;
  /** VéloPronos : présentation de la course (Grand Tour, Monument, Mondiaux…). */
  look: CourseLook;
  countryCode: string;
  coefficient: number;
  /** false : étape « Autre (×0) », hors classement de la saison. */
  countsInStandings: boolean;
  startsOn: string;
  endsOn: string;
  /** Toutes les courses de l'étape, dans l'ordre chronologique. */
  races: WeekStageRace[];
  /** Course dépliée d'office (voir pickWeekFeature). */
  openRaceId: string | null;
}

/** Jour de Paris ("2026-11-29") d'un instant. */
export function parisDay(date: Date): string {
  return toParisWallTime(date).slice(0, 10);
}

/** Jour de Paris décalé de `days` jours ("2026-11-29" + 7 → "2026-12-06"). */
export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

interface RaceRow {
  id: string;
  format: string;
  stage_number?: number | null;
  sex: string | null;
  locks_at: string;
  status: string;
  special_rule?: string | null;
}

/**
 * Partie pure (testée) : ce que l'encadré met en avant. Par ordre de priorité, les courses en
 * cours ; sinon le dernier résultat noté aujourd'hui (jusqu'à 23h59, chassé par le départ d'une
 * 2e course le même jour) ; sinon la prochaine course de l'étape.
 */
export function pickWeekFeature(
  races: RaceRow[],
  now: Date
): { badge: "now" | "next" | null; ongoingIds: string[]; resultRaceId: string | null; nextRaceId: string | null } {
  const today = parisDay(now);
  const sorted = [...races].sort((a, b) => a.locks_at.localeCompare(b.locks_at));
  const status = (r: RaceRow) => getRaceDisplayStatus(r as any, now);
  const ongoingIds = sorted.filter((r) => status(r) === "ongoing").map((r) => r.id);
  if (ongoingIds.length > 0) return { badge: "now", ongoingIds, resultRaceId: null, nextRaceId: null };
  const todayResults = sorted.filter((r) => status(r) === "finished" && parisDay(new Date(r.locks_at)) === today);
  if (todayResults.length > 0) {
    return { badge: "now", ongoingIds, resultRaceId: todayResults[todayResults.length - 1].id, nextRaceId: null };
  }
  const next = sorted.find((r) => status(r) === "upcoming");
  return { badge: next ? "next" : null, ongoingIds, resultRaceId: null, nextRaceId: next?.id ?? null };
}

export async function getWeekStage(
  supabase: SupabaseClient,
  seasonId: string,
  userId: string,
  now: Date
): Promise<WeekStage | null> {
  const today = parisDay(now);
  const select = "id, name, kind, category, location, country_code, coefficient, counts_in_standings, starts_on, ends_on";
  const { data: current } = await supabase
    .from("stages")
    .select(select)
    .eq("season_id", seasonId)
    .lte("starts_on", today)
    .gte("ends_on", today)
    .order("starts_on", { ascending: true })
    .limit(1)
    .maybeSingle();
  const { data: stage } = current
    ? { data: current }
    : await supabase
        .from("stages")
        .select(select)
        .eq("season_id", seasonId)
        .gt("starts_on", today)
        .lte("starts_on", addDays(today, 7))
        .order("starts_on", { ascending: true })
        .limit(1)
        .maybeSingle();
  if (!stage) return null;

  const { data: raceRows } = await supabase
    .from("races")
    .select("id, format, stage_number, sex, locks_at, status, special_rule")
    .eq("stage_id", stage.id)
    .order("locks_at", { ascending: true });
  // Course par étapes (VéloPronos) : seulement la veille et les 6 jours à venir, pas les 21 étapes d'un Grand Tour.
  const races = ((raceRows ?? []) as RaceRow[]).filter((r) => {
    const day = parisDay(new Date(r.locks_at));
    return (raceRows ?? []).length <= 3 || (day >= addDays(today, -1) && day <= addDays(today, 6));
  });

  const { data: predictionRows } = races.length
    ? await supabase
        .from("predictions")
        .select("race_id, athlete_ids, nation_code, team_ids, bonus_x2_used")
        .eq("user_id", userId)
        .in(
          "race_id",
          races.map((r) => r.id)
        )
    : { data: [] as any[] };
  type PredictionRow = { race_id: string; athlete_ids: string[] | null; nation_code: string | null; team_ids?: string[] | null; bonus_x2_used?: boolean | null };
  const predictions = new Map<string, PredictionRow>(
    ((predictionRows ?? []) as PredictionRow[])
      .filter((p) => (p.athlete_ids?.length ?? 0) > 0 || p.nation_code || (p.team_ids?.length ?? 0) > 0)
      .map((p) => [p.race_id, p])
  );

  const { ongoingIds, resultRaceId, nextRaceId } = pickWeekFeature(races, now);

  // Noms des athlètes et nations pronostiqués sur les courses de l'étape.
  const allPredictions = Array.from(predictions.values());
  const athleteIds = allPredictions.flatMap((p) => p.athlete_ids ?? []);
  const nationCodes = allPredictions.map((p) => p.nation_code).filter(Boolean) as string[];
  const teamIds = allPredictions.flatMap((p) => p.team_ids ?? []);
  const [{ data: athletes }, { data: nations }, { data: teams }] = await Promise.all([
    athleteIds.length
      ? supabase.from("athletes").select("id, first_name, last_name, nation_code").in("id", athleteIds)
      : Promise.resolve({ data: [] as any[] }),
    nationCodes.length
      ? supabase.from("nations").select("code, name").in("code", nationCodes)
      : Promise.resolve({ data: [] as any[] }),
    teamIds.length ? supabase.from("teams").select("id, name, nation_code").in("id", teamIds) : Promise.resolve({ data: [] as any[] }),
  ]);

  const toRace = (r: RaceRow): WeekStageRace => {
    const p = predictions.get(r.id);
    let picks: WeekStagePick[] | null = null;
    if (p) {
      picks = (p.team_ids?.length ?? 0) > 0
        ? (p.team_ids ?? []).map((id) => {
            const team = (teams ?? []).find((x: any) => x.id === id);
            return { key: id, name: team?.name ?? id, nationCode: team?.nation_code ?? "" };
          })
        : p.nation_code
        ? [
            {
              key: p.nation_code,
              name: (nations ?? []).find((n: any) => n.code === p.nation_code)?.name ?? p.nation_code,
              nationCode: p.nation_code,
            },
          ]
        : (p.athlete_ids ?? []).map((id) => {
            const a = (athletes ?? []).find((x: any) => x.id === id);
            return {
              key: id,
              name: shortAthleteName(a),
              nationCode: a?.nation_code ?? "",
            };
          });
    }
    return { id: r.id, format: r.format, stageNumber: r.stage_number ?? null, sex: r.sex, locksAt: r.locks_at, displayStatus: getRaceDisplayStatus(r as any, now),
      picks,
      specialRule: r.special_rule ?? null,
      bonusX2: p?.bonus_x2_used ?? false,
    };
  };

  return {
    id: stage.id,
    location: (stage as any).name ?? stage.location,
    look: courseLook(stage as any),
    countryCode: stage.country_code,
    coefficient: stage.coefficient,
    countsInStandings: stage.counts_in_standings !== false,
    startsOn: stage.starts_on,
    endsOn: stage.ends_on,
    races: races.map(toRace),
    openRaceId: ongoingIds[0] ?? resultRaceId ?? nextRaceId,
  };
}
