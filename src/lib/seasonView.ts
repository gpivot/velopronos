import type { SupabaseClient } from "@supabase/supabase-js";
import { getRaceDisplayStatus } from "./raceStatus";
import type { CalendarStage } from "../app/[locale]/courses/CalendarAccordion";
import type { SeasonPick } from "../app/[locale]/courses/SeasonPredictionsAccordion";
import { shortAthleteName } from "./athleteName";
import { getUserBonusQuestionPointsByRace } from "./bonusQuestions";
import { getCurrentStreak } from "./streakCounter";
import { isPredictionOpen, predictionOpensOn } from "./predictionWindow";
import { getPlayerCards, type PlayerCards } from "./bonusCards";
import { areJokersApplied, loadSeasonJokers } from "./jokers";

/** Une course effacée par les jokers de fin de saison, telle qu'affichée dans « Mon classement » (page Classement). */
export interface JokerLine {
  raceId: string;
  format: string;
  stageNumber?: number | null;
  sex: string | null;
  location: string;
  countryCode: string | null;
  played: boolean;
  points: number;
}

export interface SeasonJokers {
  /** Appliqués au classement (fin de saison) ; sinon simple aperçu. */
  applied: boolean;
  /** Variation du total : moins la somme des points effacés. */
  delta: number;
  erased: JokerLine[];
}

/**
 * Contenu de « Ma saison » (`/courses`) pour un joueur : courses de chaque étape avec son
 * pronostic, son bonus ×2 et ses points, plus ses pronostics de saison (globes) et ses Pépites cachées.
 * Sert aussi au pop-up d'un joueur du Classement (`isOwner` false) : on n'y montre que ce qui
 * ne permet pas de copier, c'est-à-dire les pronostics des courses déjà parties, les globes
 * une fois la saison commencée et une Pépite une fois révélée (bonus obtenu). Les règles
 * d'accès Supabase (migration 0018) appliquent la même chose côté base.
 */

const SEASON_CATEGORIES = [
  "gros_globe_f",
  "gros_globe_h",
  "meilleur_jeune_f",
  "meilleur_jeune_h",
  "meilleure_nation_f",
  "meilleure_nation_h",
] as const;

const shortName = (a: { first_name?: string; last_name?: string } | null | undefined) => shortAthleteName(a);

/** Pépite cachée d'un sexe : name null tant qu'elle n'est pas choisie (ou pas visible chez un autre joueur). */
export interface HiddenPepite {
  sex: "F" | "H";
  name: string | null;
  nationCode: string | null;
  revealed: boolean;
  /** Course où elle a été révélée (lien « Voir la course » de Ma saison). */
  revealedRaceId: string | null;
}

export interface SeasonView {
  stages: CalendarStage[];
  /** Les 6 globes. null : visiteur non connecté. */
  seasonPicks: SeasonPick[] | null;
  /**
   * Pépites cachées (Femmes, Hommes), hors des pronostics de saison depuis le 04/11/2026.
   * Chez un autre joueur, seules les Pépites révélées ont un nom. null : visiteur.
   */
  pepites: HiddenPepite[] | null;
  /** Série en cours (10/10), null pour un visiteur. */
  streak: number | null;
  /** Cartes bonus (crédits à choisir et cartes prises), null pour un visiteur. */
  cards: PlayerCards | null;
}

export async function getSeasonView(
  supabase: SupabaseClient,
  season: { id: string; starts_on: string },
  userId: string | null,
  now: Date,
  isOwner = true
): Promise<SeasonView> {
  const seasonStarted = new Date(season.starts_on) <= now;
  const showSeasonPicks = isOwner || seasonStarted;

  const [{ data: predictionRows }, { data: ledger }, { data: seasonPredictions }, { data: pepiteRows }, streak, cards] = await Promise.all([
    userId
      ? supabase.from("predictions").select("race_id, athlete_ids, nation_code, team_ids, bonus_x2_used").eq("user_id", userId)
      : Promise.resolve({ data: [] as any[] }),
    userId
      ? supabase.from("score_ledger").select("race_id, points, breakdown").eq("user_id", userId).eq("season_id", season.id)
      : Promise.resolve({ data: [] as any[] }),
    userId && showSeasonPicks
      ? supabase
          .from("season_predictions")
          .select("category, athlete_id, nation_code")
          .eq("user_id", userId)
          .eq("season_id", season.id)
      : Promise.resolve({ data: [] as any[] }),
    userId
      ? supabase.from("pepites").select("sex, athlete_id, bonus_claimed, revealed_race_id").eq("user_id", userId).eq("season_id", season.id)
      : Promise.resolve({ data: [] as any[] }),
    userId ? getCurrentStreak(supabase, season.id, userId) : Promise.resolve(null),
    userId ? getPlayerCards(supabase, season.id, userId, now) : Promise.resolve(null),
  ]);

  const { data: stages, error } = await supabase
    .from("stages")
    .select("id, location, country_code, starts_on, ends_on, coefficient, counts_in_standings, jerseys, races(id, format, sex, locks_at, status, special_rule, stage_number, start_city, end_city, distance_km)")
    .eq("season_id", season.id)
    .order("starts_on", { ascending: true });
  if (error) console.error("getSeasonView:", error.message);

  // Pronostics maillots du joueur (VéloPronos), comptés par course.
  const { data: jerseyPicks } =
    userId && isOwner ? await supabase.from("course_predictions").select("stage_id").eq("user_id", userId) : { data: [] as any[] };
  const jerseyPicksByStage = new Map<string, number>();
  for (const p of (jerseyPicks ?? []) as any[]) jerseyPicksByStage.set(p.stage_id, (jerseyPicksByStage.get(p.stage_id) ?? 0) + 1);

  // Chez un autre joueur, rien sur une course pas encore partie.
  const lockedRaceIds = new Set(
    (stages ?? []).flatMap((s: any) => (s.races ?? []) as any[]).filter((r) => new Date(r.locks_at) <= now).map((r) => r.id as string)
  );
  const predictions = (predictionRows ?? []).filter((p: any) => isOwner || lockedRaceIds.has(p.race_id));
  const pepites = (pepiteRows ?? []).filter((p: any) => isOwner || p.bonus_claimed);

  const predictionByRaceId = new Map(predictions.map((p: any) => [p.race_id as string, p]));
  const pointsByRaceId = new Map((ledger ?? []).map((l: any) => [l.race_id as string, Number(l.points)]));
  // Questions bonus : leurs points s'ajoutent au total de leur course.
  if (userId) {
    const allRaceIds = (stages ?? []).flatMap((s: any) => ((s.races ?? []) as any[]).map((r) => r.id as string));
    const bonusByRace = await getUserBonusQuestionPointsByRace(supabase, userId, allRaceIds);
    for (const [raceId, bonus] of Array.from(bonusByRace)) {
      pointsByRaceId.set(raceId, Math.round(((pointsByRaceId.get(raceId) ?? 0) + bonus) * 10) / 10);
    }
  }

  const athleteIds = Array.from(
    new Set([
      ...predictions.flatMap((p: any) => p.athlete_ids ?? []),
      ...(seasonPredictions ?? []).map((p: any) => p.athlete_id).filter(Boolean),
      ...pepites.map((p: any) => p.athlete_id),
    ])
  );
  const nationCodes = Array.from(
    new Set(
      [...predictions.map((p: any) => p.nation_code), ...(seasonPredictions ?? []).map((p: any) => p.nation_code)].filter(Boolean)
    )
  );
  const [{ data: athletes }, { data: nations }] = await Promise.all([
    athleteIds.length
      ? supabase.from("athletes").select("id, first_name, last_name, nation_code").in("id", athleteIds)
      : Promise.resolve({ data: [] as any[] }),
    nationCodes.length ? supabase.from("nations").select("code, name").in("code", nationCodes) : Promise.resolve({ data: [] as any[] }),
  ]);
  const athleteById = new Map((athletes ?? []).map((a: any) => [a.id as string, a]));
  // CLM par équipes (VéloPronos) : noms des équipes pronostiquées.
  const teamIds = Array.from(new Set(predictions.flatMap((p: any) => p.team_ids ?? [])));
  const { data: teams } = teamIds.length ? await supabase.from("teams").select("id, name").in("id", teamIds) : { data: [] as any[] };
  const teamNameById = new Map((teams ?? []).map((x: any) => [x.id as string, x.name as string]));
  const nationNameByCode = new Map((nations ?? []).map((n: any) => [n.code as string, n.name as string]));
  const pickNames = (p: any): string =>
    (p.team_ids?.length ?? 0) > 0
      ? (p.team_ids as string[]).map((id) => teamNameById.get(id) ?? "?").join(", ")
      : p.nation_code
      ? nationNameByCode.get(p.nation_code) ?? p.nation_code
      : (p.athlete_ids ?? []).map((id: string) => shortName(athleteById.get(id))).join(", ");

  const seasonPickByCategory = new Map((seasonPredictions ?? []).map((p: any) => [p.category as string, p]));
  const seasonPicks: SeasonPick[] | null = userId
    ? SEASON_CATEGORIES.map((category) => {
          const pick = seasonPickByCategory.get(category);
          const athlete = pick?.athlete_id ? athleteById.get(pick.athlete_id) : null;
          return {
            key: category,
            labelKey: `category_${category}`,
            name: pick ? (athlete ? shortName(athlete) : nationNameByCode.get(pick.nation_code) ?? pick.nation_code) : null,
            nationCode: athlete?.nation_code ?? pick?.nation_code ?? null,
          };
        })
    : null;

  // Pépite révélée avant l'enregistrement de revealed_race_id (migration 0040) : la course est
  // retrouvée dans les points du joueur (ligne avec un bonus Pépite sur une course du même sexe).
  const raceSexById = new Map(
    (stages ?? []).flatMap((st: any) => ((st.races ?? []) as any[]).map((r) => [r.id as string, r.sex as string | null]))
  );
  const pepiteRaceFromLedger = (sex: "F" | "H", athleteId: string): string | null => {
    const rows = ((ledger ?? []) as any[]).filter((l) => l.race_id && Number(l.breakdown?.pepiteBonus ?? 0) > 0);
    const exact = rows.find((l) => l.breakdown?.pepiteAthleteId === athleteId);
    if (exact) return exact.race_id;
    return rows.find((l) => !l.breakdown?.pepiteAthleteId && raceSexById.get(l.race_id) === sex)?.race_id ?? null;
  };

  const hiddenPepites: HiddenPepite[] | null = userId
    ? (["F", "H"] as const).map((sex) => {
        const pepite = pepites.find((p: any) => p.sex === sex);
        const athlete = pepite ? athleteById.get(pepite.athlete_id) : null;
        return {
          sex,
          name: athlete ? shortName(athlete) : null,
          nationCode: athlete?.nation_code ?? null,
          revealed: !!pepite?.bonus_claimed,
          revealedRaceId: pepite?.bonus_claimed ? pepite?.revealed_race_id ?? pepiteRaceFromLedger(sex, pepite.athlete_id) : null,
        };
      })
    : null;

  const mapped: CalendarStage[] = (stages ?? []).map((stage: any) => ({
    id: stage.id,
    location: stage.location,
    country_code: stage.country_code,
    starts_on: stage.starts_on,
    ends_on: stage.ends_on,
    coefficient: stage.coefficient,
    counts_in_standings: stage.counts_in_standings !== false,
    jerseys: (stage.jerseys ?? []).length,
    jerseysPicked: jerseyPicksByStage.get(stage.id) ?? 0,
    opensOn: isPredictionOpen(stage.starts_on, now) ? null : predictionOpensOn(stage.starts_on),
    races: (stage.races ?? [])
      .map((race: any) => ({
        ...race,
        displayStatus: getRaceDisplayStatus(race, now),
        predicted: predictionByRaceId.has(race.id),
        names: predictionByRaceId.has(race.id) ? pickNames(predictionByRaceId.get(race.id)) : null,
        bonusX2: predictionByRaceId.get(race.id)?.bonus_x2_used ?? false,
        points: pointsByRaceId.get(race.id) ?? null,
      }))
      .sort((a: any, b: any) => new Date(a.locks_at).getTime() - new Date(b.locks_at).getTime()),
  }));

  return { stages: mapped, seasonPicks, pepites: hiddenPepites, streak, cards };
}

/**
 * Jokers de fin de saison d'un joueur (aperçu ou appliqués), affichés dans l'encadré
 * « Mon classement » de la page Classement. null tant qu'aucune course n'est notée.
 */
export async function getPlayerJokers(supabase: SupabaseClient, seasonId: string, userId: string): Promise<SeasonJokers | null> {
  const [applied, selections, { data: races }] = await Promise.all([
    areJokersApplied(supabase, seasonId),
    loadSeasonJokers(supabase, seasonId, [userId]),
    supabase
      .from("races")
      .select("id, format, stage_number, sex, status, stages!inner(season_id, location, country_code)")
      .eq("stages.season_id", seasonId),
  ]);
  const raceById = new Map(((races ?? []) as any[]).map((r) => [r.id as string, r]));
  const selection = selections.get(userId) ?? null;
  if (!selection || !Array.from(raceById.values()).some((r) => r.status === "finished")) return null;
  return {
    applied,
    delta: selection.delta,
    erased: selection.erased.map((c) => {
      const race = raceById.get(c.raceId);
      return {
        raceId: c.raceId,
        format: race?.format ?? "",
        stageNumber: race?.stage_number ?? null,
        sex: race?.sex ?? null,
        location: race?.stages?.location ?? "",
        countryCode: race?.stages?.country_code ?? null,
        played: c.played,
        points: c.points,
      };
    }),
  };
}

/** Étape ouverte par défaut : la première qui n'est pas entièrement terminée. */
export function pickDefaultOpenStageId(stages: CalendarStage[]): string | null {
  const current = stages.find((stage) => stage.races.some((r) => r.displayStatus !== "finished"));
  return current?.id ?? stages[0]?.id ?? null;
}
