import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyFuseeGachetteRules,
  computeIndividualRaceScore,
  computePepiteBonus,
  computePursuitOdds,
  computeRelayScore,
  computeSeasonStreaks,
  fuseeGachetteEligibility,
  type AthleteRaceResult,
  type NationRaceResult,
} from "@/lib/scoring";
import { TOUR_DE_PENA_EMPTY_PICK_LAPS, TOUR_DE_PENA_MALUS_PER_LAP } from "@/lib/scoring/constants";
import { clearCurrentOdds, setCurrentOdds } from "./odds";
import { totalMisses } from "@/lib/shootings";
import { fetchAll } from "./fetchAll";
import {
  cardsOnRace,
  computeEquipeBonus,
  getSeasonCardRaces,
  resolvePredictionCard,
  type CardRace,
  type CardRow,
} from "@/lib/bonusCards";

const RELAY_FORMATS = ["relais_h", "relais_f", "relais_mixte", "relais_mixte_simple"];

export interface ResultEntryInput {
  /** Course individuelle. */
  athleteId?: string;
  /** Relais — la nation prend la place de l'athlète. */
  nationCode?: string;
  /** CLM par équipes (VéloPronos) — l'équipe prend la place du coureur. */
  teamId?: string;
  rank: number;
  timeGapSeconds?: number;
  penaltyLaps?: number;
  /** Fautes au tir, une valeur par tir. */
  shootings?: number[];
  /** Rang au temps de ski (1, 2, 3…), pour la carte Fusée. */
  skiRank?: number | null;
  isFusee?: boolean;
  isGachette?: boolean;
}

/**
 * Enregistre les résultats d'une course (remplace toute saisie précédente)
 * et, si c'est un sprint, fige la cote poursuite de chaque athlète pour la
 * course suivante de l'étape (§4 du règlement) à partir des écarts saisis.
 */
export async function saveRaceResults(
  admin: SupabaseClient,
  raceId: string,
  entries: ResultEntryInput[]
): Promise<void> {
  const { data: race, error: raceError } = await admin
    .from("races")
    .select("id, stage_id, sex, format, stages(season_id)")
    .eq("id", raceId)
    .single();
  if (raceError || !race) throw new Error(raceError?.message ?? "Course introuvable.");

  // Correction d'un sprint (disqualification…) : les cotes poursuite repartent de leur valeur
  // d'avant la saisie précédente, puis sont recalculées avec les nouveaux écarts.
  if (race.format === "sprint") await restorePursuitOdds(admin, race, (race.stages as any).season_id);

  await admin.from("race_results").delete().eq("race_id", raceId);

  if (entries.length > 0) {
    const { error } = await admin.from("race_results").insert(
      entries.map((e) => ({
        race_id: raceId,
        // Fusée (temps de ski) et Gâchette (sans-faute) : courses individuelles seulement (§15).
        is_fusee: fuseeGachetteEligibility(race.format).fusee && ((e.isFusee ?? false) || e.skiRank === 1),
        is_gachette: fuseeGachetteEligibility(race.format).gachette && (e.isGachette ?? false),
        ski_rank: fuseeGachetteEligibility(race.format).fusee && e.skiRank != null && e.skiRank > 0 ? e.skiRank : null,
        athlete_id: e.athleteId ?? null,
        nation_code: e.nationCode ?? null,
        team_id: e.teamId ?? null,
        rank: e.rank,
        time_gap_seconds: e.timeGapSeconds ?? null,
        // Tours de péna = nombre de fautes au tir, repris des tirs s'ils n'ont pas été saisis à part.
        penalty_laps: e.penaltyLaps ?? totalMisses(e.shootings) ?? 0,
        shootings: e.shootings && e.shootings.length > 0 ? e.shootings : null,
      }))
    );
    if (error) throw new Error(error.message);
  }

  if (race.format === "sprint") {
    await cascadePursuitOdds(admin, race.stage_id, race.sex, (race.stages as any).season_id, entries);
  }
}

/**
 * Annule le recalcul des cotes poursuite fait à partir des résultats actuels d'un sprint : pour
 * chaque athlète classé avec un écart, la cote poursuite reprend la dernière valeur antérieure à
 * la saisie de ces résultats (cote importée, ou restaurée lors d'une correction précédente).
 */
async function restorePursuitOdds(
  admin: SupabaseClient,
  sprint: { id: string; stage_id: string; sex: string | null },
  seasonId: string
): Promise<void> {
  const { data: previous } = await admin
    .from("race_results")
    .select("athlete_id, time_gap_seconds, created_at")
    .eq("race_id", sprint.id);
  const cascaded = (previous ?? []).filter((r) => r.athlete_id && r.time_gap_seconds != null);
  if (cascaded.length === 0) return;

  const { data: pursuitRace } = await admin
    .from("races")
    .select("id")
    .eq("stage_id", sprint.stage_id)
    .eq("format", "poursuite")
    .eq("sex", sprint.sex)
    .maybeSingle();
  if (!pursuitRace) return;

  const savedAt = cascaded.map((r) => r.created_at as string).sort()[0];
  const athleteIds = cascaded.map((r) => r.athlete_id as string);
  const history = await fetchAll((from, to) =>
    admin
      .from("odds")
      .select("athlete_id, value, valid_from")
      .eq("season_id", seasonId)
      .eq("format", "poursuite")
      .in("athlete_id", athleteIds)
      .lt("valid_from", savedAt)
      .order("valid_from", { ascending: false })
      .range(from, to)
  );
  const baseByAthleteId = new Map<string, number>();
  for (const row of history) {
    if (!baseByAthleteId.has(row.athlete_id)) baseByAthleteId.set(row.athlete_id, row.value);
  }

  for (const athleteId of athleteIds) {
    const base = baseByAthleteId.get(athleteId);
    if (base != null) await setCurrentOdds(admin, { seasonId, format: "poursuite", athleteId, value: base });
    else await clearCurrentOdds(admin, { seasonId, format: "poursuite", athleteId });
  }
}

async function cascadePursuitOdds(
  admin: SupabaseClient,
  stageId: string,
  sex: string | null,
  seasonId: string,
  sprintEntries: ResultEntryInput[]
): Promise<void> {
  const { data: pursuitRace } = await admin
    .from("races")
    .select("id")
    .eq("stage_id", stageId)
    .eq("format", "poursuite")
    .eq("sex", sex)
    .maybeSingle();
  if (!pursuitRace) return;

  const athleteIds = sprintEntries.map((e) => e.athleteId!).filter(Boolean);
  const { data: sprintOdds } = await admin
    .from("odds")
    .select("athlete_id, value")
    .eq("season_id", seasonId)
    .eq("format", "sprint")
    .is("valid_until", null)
    .in("athlete_id", athleteIds);

  const baseOddsByAthleteId = new Map((sprintOdds ?? []).map((o) => [o.athlete_id as string, o.value as number]));

  const toUpdate = sprintEntries.filter(
    (e) => e.athleteId && e.timeGapSeconds != null && baseOddsByAthleteId.has(e.athleteId)
  );
  for (const entry of toUpdate) {
    await setCurrentOdds(admin, {
      seasonId,
      format: "poursuite",
      athleteId: entry.athleteId!,
      value: computePursuitOdds(baseOddsByAthleteId.get(entry.athleteId!)!, entry.timeGapSeconds!),
    });
  }
}

export interface ScoreRaceSummary {
  scoredPredictions: number;
}

/**
 * Calcule et écrit le score de chaque pronostic déposé sur la course, met à
 * jour les séries 10/10 (§12 : "hommes et femmes confondus ainsi que
 * relais"), puis marque la course comme terminée. Ré-exécutable sans
 * dupliquer (score_ledger_user_race_unique, cf. migration 0006).
 */
export async function scoreRace(admin: SupabaseClient, raceId: string): Promise<ScoreRaceSummary> {
  const { data: race, error: raceError } = await admin
    .from("races")
    .select("id, sex, format, special_rule, locks_at, stages(id, season_id, country_code, coefficient, counts_in_standings)")
    .eq("id", raceId)
    .single();
  if (raceError || !race) throw new Error(raceError?.message ?? "Course introuvable.");

  const stage = race.stages as any;

  // Notation rejouable : les points déjà attribués sur cette course sont effacés d'abord.
  const frozenPepites = await clearRaceScores(admin, raceId, stage.season_id, race.sex);

  const [{ data: results }, { data: predictions }] = await Promise.all([
    admin.from("race_results").select("*").eq("race_id", raceId),
    admin.from("predictions").select("*").eq("race_id", raceId),
  ]);

  let scoredPredictions = 0;
  if (predictions && predictions.length > 0) {
    const pointsByUserId =
      race.format === "clm_equipes"
        ? await scoreTeamPredictions(admin, race, stage, results ?? [], predictions)
        : RELAY_FORMATS.includes(race.format)
          ? await scoreRelayPredictions(admin, race, stage, results ?? [], predictions)
          : await scoreIndividualPredictions(admin, race, stage, results ?? [], predictions);
    scoredPredictions = pointsByUserId.size;
  }

  // Tour de péna : un joueur absent prend 5 tours d'office par biathlète, soit -300 (04/11/2026).
  if (race.special_rule === "tour_de_pena" && !RELAY_FORMATS.includes(race.format)) {
    await applyTourDePenaAbsences(admin, race, stage.season_id, predictions ?? []);
  }

  // Pépites révélées sur cette course puis remplacées ou réactivées par une carte Talent : leurs points restent acquis.
  await restoreFrozenPepiteBonuses(admin, stage.season_id, raceId, frozenPepites);

  // §14 — la Pépite est indépendante du pronostic du joueur sur cette course précise : à vérifier
  // même si personne n'a pronostiqué dessus. Après les pronostics, pour s'ajouter à leurs points.
  // Étape hors classement (×0) : la Pépite n'y est pas révélée, elle reste en jeu pour la suite.
  if (stage.counts_in_standings !== false) await applyPepiteBonuses(admin, stage.season_id, stage.id, race, results ?? []);

  await admin.from("races").update({ status: "finished" }).eq("id", raceId);
  await recomputeSeasonStreaks(admin, stage.season_id);

  return { scoredPredictions };
}

interface FrozenPepiteBonus {
  userId: string;
  points: number;
  athleteId: string | null;
}

/**
 * Efface les points d'une course (score_ledger) et rend le bonus Pépite à ceux qui l'avaient
 * gagné dessus, pour pouvoir la renoter ou la réinitialiser. Exception : une Pépite révélée sur
 * cette course puis réactivée ou remplacée par une carte Talent n'est plus la Pépite en jeu ; ses
 * points restent acquis et sont renvoyés pour être remis après la notation.
 */
async function clearRaceScores(
  admin: SupabaseClient,
  raceId: string,
  seasonId: string,
  sex: string | null
): Promise<FrozenPepiteBonus[]> {
  const { data: ledger } = await admin.from("score_ledger").select("user_id, breakdown").eq("race_id", raceId);
  const withPepite = (ledger ?? []).filter((row) => (row.breakdown as any)?.pepiteBonus);
  const frozen: FrozenPepiteBonus[] = [];
  if (withPepite.length > 0 && sex) {
    const { data: current } = await admin
      .from("pepites")
      .select("user_id, athlete_id, bonus_claimed, revealed_race_id")
      .eq("season_id", seasonId)
      .eq("sex", sex)
      .in("user_id", withPepite.map((row) => row.user_id as string));
    const currentByUser = new Map((current ?? []).map((p) => [p.user_id as string, p]));
    const toReset: string[] = [];
    for (const row of withPepite) {
      const breakdown = row.breakdown as any;
      const pepite = currentByUser.get(row.user_id as string);
      const revealedHere =
        !!pepite &&
        (pepite.revealed_race_id === raceId ||
          // Révélées avant la migration 0039 (sans revealed_race_id).
          (pepite.revealed_race_id == null && pepite.bonus_claimed && (!breakdown.pepiteAthleteId || breakdown.pepiteAthleteId === pepite.athlete_id)));
      if (revealedHere) toReset.push(row.user_id as string);
      else frozen.push({ userId: row.user_id as string, points: Number(breakdown.pepiteBonus), athleteId: breakdown.pepiteAthleteId ?? null });
    }
    if (toReset.length > 0) {
      await admin
        .from("pepites")
        .update({ bonus_claimed: false, revealed_race_id: null })
        .eq("season_id", seasonId)
        .eq("sex", sex)
        .in("user_id", toReset);
    }
  }

  const { error } = await admin.from("score_ledger").delete().eq("race_id", raceId);
  if (error) throw new Error(error.message);
  return frozen;
}

/** Remet sur la course les points des Pépites révélées dessus puis remplacées par une carte Talent. */
async function restoreFrozenPepiteBonuses(
  admin: SupabaseClient,
  seasonId: string,
  raceId: string,
  frozen: FrozenPepiteBonus[]
): Promise<void> {
  for (const item of frozen) {
    const { data: existing } = await admin
      .from("score_ledger")
      .select("points, breakdown")
      .eq("user_id", item.userId)
      .eq("race_id", raceId)
      .maybeSingle();
    await admin.from("score_ledger").upsert(
      {
        user_id: item.userId,
        season_id: seasonId,
        race_id: raceId,
        points: Number(existing?.points ?? 0) + item.points,
        breakdown: {
          ...((existing?.breakdown as object) ?? {}),
          pepiteBonus: item.points,
          ...(item.athleteId ? { pepiteAthleteId: item.athleteId } : {}),
        },
      },
      { onConflict: "user_id,race_id" }
    );
  }
}

/**
 * Tour de péna (Guillaume, 04/11/2026) : un joueur qui n'a pas pronostiqué la course prend 5 tours
 * d'office pour chacun de ses 3 biathlètes, soit -300. Seuls les joueurs qui ont déjà pronostiqué au
 * moins une course de la saison avant celle-ci sont concernés (pas les comptes dormants, à confirmer).
 */
async function applyTourDePenaAbsences(
  admin: SupabaseClient,
  race: { id: string; locks_at: string },
  seasonId: string,
  predictions: any[]
): Promise<void> {
  const { data: earlierRaces } = await admin
    .from("races")
    .select("id, stages!inner(season_id)")
    .eq("stages.season_id", seasonId)
    .lt("locks_at", race.locks_at);
  const earlierIds = (earlierRaces ?? []).map((r) => r.id as string);
  if (earlierIds.length === 0) return;

  const earlierPredictions = await fetchAll((from, to) =>
    admin.from("predictions").select("user_id").in("race_id", earlierIds).order("id").range(from, to)
  );
  const present = new Set(predictions.map((p) => p.user_id as string));
  const absent = [...new Set(earlierPredictions.map((p) => p.user_id as string))].filter((id) => !present.has(id));
  if (absent.length === 0) return;

  const malus = 3 * TOUR_DE_PENA_EMPTY_PICK_LAPS * TOUR_DE_PENA_MALUS_PER_LAP;
  const { error } = await admin.from("score_ledger").upsert(
    absent.map((userId) => ({
      user_id: userId,
      season_id: seasonId,
      race_id: race.id,
      points: malus,
      breakdown: { specialMalus: malus, missingPicks: 3, absent: true },
    })),
    { onConflict: "user_id,race_id" }
  );
  if (error) throw new Error(error.message);
}

/**
 * §12 — recalcule les séries 10/10 de toute la saison en rejouant les courses notées dans l'ordre
 * (points des pronostics seuls, hors bonus Pépite). Appelé après chaque notation, correction ou
 * réinitialisation, pour qu'un résultat modifié (disqualification…) se répercute sur la suite.
 * Une carte déjà choisie par un joueur reste acquise même si le recalcul lui en retire le crédit.
 */
export async function recomputeSeasonStreaks(admin: SupabaseClient, seasonId: string): Promise<void> {
  const { data: races } = await admin
    .from("races")
    .select("id, locks_at, stages!inner(season_id, counts_in_standings)")
    .eq("stages.season_id", seasonId)
    .eq("status", "finished")
    .order("locks_at");
  // Étapes hors classement (×0) : leurs courses ne font ni avancer ni casser la série.
  const raceIds = (races ?? []).filter((r: any) => r.stages?.counts_in_standings !== false).map((r) => r.id as string);

  const [predictions, ledger, { data: counters }] = await Promise.all([
    raceIds.length === 0
      ? Promise.resolve([] as Array<{ user_id: string; race_id: string }>)
      : fetchAll((from, to) =>
          admin.from("predictions").select("user_id, race_id").in("race_id", raceIds).order("id").range(from, to)
        ),
    fetchAll((from, to) =>
      admin
        .from("score_ledger")
        .select("user_id, race_id, points, breakdown")
        .eq("season_id", seasonId)
        .not("race_id", "is", null)
        .order("id")
        .range(from, to)
    ),
    admin.from("streak_counters").select("user_id").eq("season_id", seasonId),
  ]);

  const ledgerByKey = new Map(
    ledger.map((row) => [
      `${row.user_id}|${row.race_id}`,
      Number(row.points) - Number((row.breakdown as any)?.pepiteBonus ?? 0),
    ])
  );
  const pointsByRace = new Map<string, Map<string, number>>();
  for (const p of predictions) {
    const points = ledgerByKey.get(`${p.user_id}|${p.race_id}`) ?? 0;
    if (!pointsByRace.has(p.race_id)) pointsByRace.set(p.race_id, new Map());
    pointsByRace.get(p.race_id)!.set(p.user_id, points);
  }

  const streaks = computeSeasonStreaks(raceIds, pointsByRace);
  // Un joueur qui n'a plus aucune course notée repart de zéro.
  for (const c of counters ?? []) {
    if (!streaks.has(c.user_id)) streaks.set(c.user_id, { currentStreak: 0, cardsEarned: 0 });
  }
  if (streaks.size === 0) return;

  const { error } = await admin.from("streak_counters").upsert(
    [...streaks.entries()].map(([userId, s]) => ({
      user_id: userId,
      season_id: seasonId,
      current_streak: s.currentStreak,
      cards_earned: s.cardsEarned,
    })),
    { onConflict: "user_id,season_id" }
  );
  if (error) throw new Error(error.message);
}

/**
 * §14 — la Pépite est un pronostic caché : sur chaque course individuelle
 * où elle termine dans le Top 10 pour la 1re fois de la saison, son score
 * (cote de la course × multiplicateur de rang, §1) s'ajoute en bonus. Elle
 * n'est ensuite plus réévaluée (bonus_claimed = true), sauf carte Talent : une Pépite réactivée
 * ou choisie avec Talent ne compte qu'à partir des courses parties après (active_from).
 */
async function applyPepiteBonuses(
  admin: SupabaseClient,
  seasonId: string,
  stageId: string,
  race: { id: string; format: string; locks_at: string },
  results: any[]
): Promise<void> {
  const raceId = race.id;
  const raceFormat = race.format;
  const top10Results = results.filter((r) => r.athlete_id && r.rank <= 10);
  if (top10Results.length === 0) return;

  const athleteIds = top10Results.map((r) => r.athlete_id as string);

  const { data: pepites } = await admin
    .from("pepites")
    .select("user_id, sex, athlete_id, active_from")
    .eq("season_id", seasonId)
    .eq("bonus_claimed", false)
    .in("athlete_id", athleteIds);
  const inPlay = (pepites ?? []).filter((p) => !p.active_from || new Date(p.active_from) <= new Date(race.locks_at));
  if (inPlay.length === 0) return;

  const { data: odds } = await admin
    .from("odds")
    .select("athlete_id, value")
    .eq("season_id", seasonId)
    .eq("stage_id", stageId)
    .eq("format", raceFormat)
    .is("valid_until", null)
    .in("athlete_id", athleteIds);
  const oddsByAthleteId = new Map((odds ?? []).map((o) => [o.athlete_id as string, o.value as number]));
  const rankByAthleteId = new Map(top10Results.map((r) => [r.athlete_id as string, r.rank as number]));

  for (const pepite of inPlay) {
    const rank = rankByAthleteId.get(pepite.athlete_id);
    const oddsAtRace = oddsByAthleteId.get(pepite.athlete_id);
    if (rank == null || oddsAtRace == null) continue;

    const bonus = computePepiteBonus(oddsAtRace, rank);
    if (bonus <= 0) continue;

    const { data: existing } = await admin
      .from("score_ledger")
      .select("points, breakdown")
      .eq("user_id", pepite.user_id)
      .eq("race_id", raceId)
      .maybeSingle();

    await admin.from("score_ledger").upsert(
      {
        user_id: pepite.user_id,
        season_id: seasonId,
        race_id: raceId,
        points: (existing?.points ?? 0) + bonus,
        breakdown: { ...((existing?.breakdown as object) ?? {}), pepiteBonus: bonus, pepiteAthleteId: pepite.athlete_id },
      },
      { onConflict: "user_id,race_id" }
    );

    await admin
      .from("pepites")
      .update({ bonus_claimed: true, revealed_race_id: raceId })
      .eq("user_id", pepite.user_id)
      .eq("season_id", seasonId)
      .eq("sex", pepite.sex);
  }
}

/**
 * Cartes jouées de la saison (elles font foi, pas le seul champ du pronostic), courses de la
 * saison (fenêtres du 4e choix et de la carte Équipe) et équipes favorites (carte Équipe).
 */
async function loadPlayedCards(
  admin: SupabaseClient,
  seasonId: string
): Promise<{
  cardsByUserId: Map<string, CardRow[]>;
  seasonRaces: CardRace[];
  favoriteTeamByUserId: Map<string, { nationCode: string; sex: string }>;
}> {
  const [{ data: playedCards }, seasonRaces, { data: favoriteTeams }] = await Promise.all([
    admin
      .from("bonus_cards")
      .select("id, user_id, card_type, status, used_on_race_id, used_on_stage_id")
      .eq("season_id", seasonId)
      .eq("status", "used")
      .in("card_type", ["ca_farte", "balle_de_pioche", "aspiration", "equipe", "fusee", "gachette"]),
    getSeasonCardRaces(admin, seasonId),
    admin.from("favorite_teams").select("user_id, nation_code, sex").eq("season_id", seasonId),
  ]);
  const cardsByUserId = new Map<string, CardRow[]>();
  for (const c of (playedCards ?? []) as (CardRow & { user_id: string })[]) {
    cardsByUserId.set(c.user_id, [...(cardsByUserId.get(c.user_id) ?? []), c]);
  }
  const favoriteTeamByUserId = new Map(
    (favoriteTeams ?? []).map((f) => [f.user_id as string, { nationCode: f.nation_code as string, sex: f.sex as string }])
  );
  return { cardsByUserId, seasonRaces, favoriteTeamByUserId };
}

async function scoreIndividualPredictions(
  admin: SupabaseClient,
  race: any,
  stage: any,
  results: any[],
  predictions: any[]
): Promise<Map<string, number>> {
  const athleteIds = new Set<string>();
  for (const r of results) if (r.athlete_id) athleteIds.add(r.athlete_id);
  for (const p of predictions) for (const id of p.athlete_ids ?? []) athleteIds.add(id);

  const [{ data: athletes }, { data: odds }, { cardsByUserId, seasonRaces, favoriteTeamByUserId }] = await Promise.all([
    admin.from("athletes").select("id, nation_code, sex").in("id", Array.from(athleteIds)),
    admin
      .from("odds")
      .select("athlete_id, value")
      .eq("season_id", stage.season_id)
      .eq("stage_id", stage.id) // cotes propres à la course (VéloPronos, 0045)
      .eq("format", race.format)
      .is("valid_until", null)
      .in("athlete_id", Array.from(athleteIds)),
    loadPlayedCards(admin, stage.season_id),
  ]);

  const athleteTeamByAthleteId: Record<string, { nationCode: string; sex: "H" | "F" }> = {};
  for (const a of athletes ?? []) athleteTeamByAthleteId[a.id] = { nationCode: a.nation_code, sex: a.sex };

  const oddsByAthleteId: Record<string, number> = {};
  for (const o of odds ?? []) oddsByAthleteId[o.athlete_id as string] = o.value;

  const scoringResults: AthleteRaceResult[] = results
    .filter((r) => r.athlete_id)
    .map((r) => applyFuseeGachetteRules(race.format, r))
    .map((r) => ({
      athleteId: r.athlete_id as string,
      rank: r.rank,
      // Résultats où seuls les tirs ont été saisis : leurs fautes comptent comme tours de péna.
      penaltyLaps: r.penalty_laps || totalMisses(r.shootings) || 0,
      skiRank: r.ski_rank ?? null,
      isFusee: r.is_fusee,
      isGachette: r.is_gachette,
    }));

  const scoreLedgerRows = [];
  const pointsByUserId = new Map<string, number>();
  const offStandings = stage.counts_in_standings === false;
  const noCards = stage.coefficient === 2 || offStandings;

  for (const prediction of predictions) {
    // Mondiaux / JO : aucune carte bonus, seul le ×2 de l'événement compte (Guillaume, 04/11/2026).
    // Étape hors classement (×0) : aucune carte non plus.
    const userCards = noCards ? [] : cardsByUserId.get(prediction.user_id) ?? [];
    const { athleteIds: predictedAthleteIds, card } = resolvePredictionCard(race.id, prediction, userCards, seasonRaces);
    const onRace = cardsOnRace(race.id, userCards, seasonRaces);

    const result = computeIndividualRaceScore({
      predictedAthleteIds,
      results: scoringResults,
      oddsByAthleteId,
      athleteTeamByAthleteId,
      specialRule: race.special_rule,
      stageCoefficient: stage.coefficient,
      // Pas de ×2 perso sur une étape hors classement (il n'y est pas proposé).
      bonusX2Active: prediction.bonus_x2_used && !offStandings,
      card,
      // Team Nation et Aspiration retirées du règlement (Guillaume, 30/10/2026) : l'équipe favorite
      // ne rapporte plus de points, elle reste une info ludique sur l'accueil.
      favoriteTeam: null,
      raceCountryCode: stage.country_code,
      // Fête nationale (01/11/2026) : les biathlètes de l'équipe favorite du joueur dans le Top 10 comptent double.
      nationalDayTeam:
        race.special_rule === "fete_nationale"
          ? (favoriteTeamByUserId.get(prediction.user_id) as { nationCode: string; sex: "H" | "F" } | undefined) ?? null
          : null,
      // Cartes Fusée / Gâchette posées sur l'étape (04/11/2026).
      raceFormat: race.format,
      stageCards: { fusee: !!onRace.fusee, gachette: !!onRace.gachette },
    });

    // Carte Équipe : la cote de chaque biathlète de l'équipe favorite dans le Top 10, en plus.
    const equipeBonus = onRace.equipe
      ? computeEquipeBonus(
          favoriteTeamByUserId.get(prediction.user_id) ?? null,
          race,
          scoringResults.map((r) => ({
            rank: r.rank,
            nationCode: athleteTeamByAthleteId[r.athleteId]?.nationCode ?? "",
            sex: athleteTeamByAthleteId[r.athleteId]?.sex ?? "",
            odds: oddsByAthleteId[r.athleteId] ?? 0,
          })),
          []
        )
      : 0;
    const totalPoints = result.total + equipeBonus;

    scoreLedgerRows.push({
      user_id: prediction.user_id,
      season_id: stage.season_id,
      race_id: race.id,
      points: totalPoints,
      breakdown: { ...result.breakdown, ...(equipeBonus ? { equipeBonus } : {}) },
    });
    pointsByUserId.set(prediction.user_id, totalPoints);
  }

  const { error } = await admin.from("score_ledger").upsert(scoreLedgerRows, { onConflict: "user_id,race_id" });
  if (error) throw new Error(error.message);

  return pointsByUserId;
}

/**
 * CLM par équipes (VéloPronos) : 3 équipes pronostiquées (predictions.team_ids), notées comme
 * 3 coureurs d'une étape normale : rang × cote « CLM par équipes », bonus Musette (Top 10/5/3),
 * Prono parfait, puis ×2 (perso ou course ×2) sur le tout, Musette comprise. Ni carte ni étape
 * spéciale (règle base44).
 */
async function scoreTeamPredictions(
  admin: SupabaseClient,
  race: any,
  stage: any,
  results: any[],
  predictions: any[]
): Promise<Map<string, number>> {
  const { data: odds } = await admin
    .from("odds")
    .select("team_id, value")
    .eq("stage_id", stage.id)
    .eq("format", race.format)
    .is("valid_until", null)
    .not("team_id", "is", null);
  const oddsByTeamId: Record<string, number> = {};
  for (const o of odds ?? []) oddsByTeamId[o.team_id as string] = o.value;

  const teamResults: AthleteRaceResult[] = results
    .filter((r) => r.team_id)
    .map((r) => ({ athleteId: r.team_id as string, rank: r.rank, penaltyLaps: 0, skiRank: null, isFusee: false, isGachette: false }));

  const offStandings = stage.counts_in_standings === false;
  const scoreLedgerRows = [];
  const pointsByUserId = new Map<string, number>();
  for (const prediction of predictions) {
    const teamIds: string[] = prediction.team_ids ?? [];
    if (teamIds.length === 0) continue;
    const result = computeIndividualRaceScore({
      predictedAthleteIds: teamIds,
      results: teamResults,
      oddsByAthleteId: oddsByTeamId,
      athleteTeamByAthleteId: {},
      specialRule: null,
      stageCoefficient: 1,
      bonusX2Active: false,
      card: { type: "none" },
      favoriteTeam: null,
      raceCountryCode: stage.country_code,
      nationalDayTeam: null,
      raceFormat: race.format,
      stageCards: { fusee: false, gachette: false },
    });
    // VéloPronos (base44) : le ×2 (perso ou course ×2) double tout, bonus Musette compris.
    const multiplier = stage.coefficient === 2 || (prediction.bonus_x2_used && !offStandings) ? 2 : 1;
    const total = result.total * multiplier;
    scoreLedgerRows.push({
      user_id: prediction.user_id,
      season_id: stage.season_id,
      race_id: race.id,
      points: total,
      breakdown: { ...result.breakdown, ...(multiplier === 2 ? { veloMultiplier: 2 } : {}) },
    });
    pointsByUserId.set(prediction.user_id, total);
  }
  if (scoreLedgerRows.length > 0) {
    const { error } = await admin.from("score_ledger").upsert(scoreLedgerRows, { onConflict: "user_id,race_id" });
    if (error) throw new Error(error.message);
  }
  return pointsByUserId;
}

/**
 * §5 — scoring des relais : cote × rang uniquement (pas de bonus de
 * combinaison ni de malus de course spéciale, non mentionnés pour les
 * relais dans le règlement — à confirmer par Guillaume si besoin).
 */
async function scoreRelayPredictions(
  admin: SupabaseClient,
  race: any,
  stage: any,
  results: any[],
  predictions: any[]
): Promise<Map<string, number>> {
  const nationCodes = new Set<string>();
  for (const r of results) if (r.nation_code) nationCodes.add(r.nation_code);
  for (const p of predictions) if (p.nation_code) nationCodes.add(p.nation_code);

  const [{ data: odds }, { cardsByUserId, seasonRaces, favoriteTeamByUserId }] = await Promise.all([
    admin
      .from("odds")
      .select("nation_code, value")
      .eq("season_id", stage.season_id)
      .eq("stage_id", stage.id) // cotes propres à la course (VéloPronos, 0045)
      .eq("format", race.format)
      .is("valid_until", null)
      .in("nation_code", Array.from(nationCodes)),
    loadPlayedCards(admin, stage.season_id),
  ]);

  const oddsByNationCode: Record<string, number> = {};
  for (const o of odds ?? []) if (o.nation_code) oddsByNationCode[o.nation_code] = o.value;

  const relayResults: NationRaceResult[] = results
    .filter((r) => r.nation_code)
    .map((r) => ({ nationCode: r.nation_code as string, rank: r.rank }));

  const scoreLedgerRows = [];
  const pointsByUserId = new Map<string, number>();

  for (const prediction of predictions) {
    if (!prediction.nation_code) continue;

    const result = computeRelayScore({
      predictedNationCode: prediction.nation_code,
      results: relayResults,
      oddsByNationCode,
      stageCoefficient: stage.coefficient,
      bonusX2Active: prediction.bonus_x2_used && stage.counts_in_standings !== false,
    });

    // Carte Équipe : la cote du relais si la nation favorite finit dans le Top 10 (relais de son sexe).
    // Jamais aux Mondiaux / JO ni sur une étape hors classement.
    const equipeBonus = stage.coefficient !== 2 && stage.counts_in_standings !== false && cardsOnRace(race.id, cardsByUserId.get(prediction.user_id) ?? [], seasonRaces).equipe
      ? computeEquipeBonus(
          favoriteTeamByUserId.get(prediction.user_id) ?? null,
          race,
          [],
          relayResults.map((r) => ({ rank: r.rank, nationCode: r.nationCode, odds: oddsByNationCode[r.nationCode] ?? 0 }))
        )
      : 0;
    const totalPoints = result.total + equipeBonus;

    scoreLedgerRows.push({
      user_id: prediction.user_id,
      season_id: stage.season_id,
      race_id: race.id,
      points: totalPoints,
      breakdown: { ...result.breakdown, ...(equipeBonus ? { equipeBonus } : {}) },
    });
    pointsByUserId.set(prediction.user_id, totalPoints);
  }

  if (scoreLedgerRows.length > 0) {
    const { error } = await admin.from("score_ledger").upsert(scoreLedgerRows, { onConflict: "user_id,race_id" });
    if (error) throw new Error(error.message);
  }

  return pointsByUserId;
}

/**
 * Annule la saisie des résultats d'une course : cotes poursuite d'un sprint restaurées, points
 * (score_ledger) effacés, bonus Pépite rendu s'il avait été gagné dessus, résultats effacés, course
 * repassée « à venir » (affichée « en cours » si l'heure de départ est passée), séries 10/10 de la
 * saison recalculées.
 */
export async function resetRaceResults(admin: SupabaseClient, raceId: string): Promise<void> {
  const { data: race, error: raceError } = await admin
    .from("races")
    .select("id, stage_id, sex, format, stages(season_id)")
    .eq("id", raceId)
    .single();
  if (raceError || !race) throw new Error(raceError?.message ?? "Course introuvable.");
  const seasonId = (race.stages as any).season_id as string;

  if (race.format === "sprint") await restorePursuitOdds(admin, race, seasonId);
  const frozenPepites = await clearRaceScores(admin, raceId, seasonId, race.sex);
  await restoreFrozenPepiteBonuses(admin, seasonId, raceId, frozenPepites);

  const { error: resultsError } = await admin.from("race_results").delete().eq("race_id", raceId);
  if (resultsError) throw new Error(resultsError.message);
  const { error: statusError } = await admin.from("races").update({ status: "upcoming" }).eq("id", raceId);
  if (statusError) throw new Error(statusError.message);

  await recomputeSeasonStreaks(admin, seasonId);
}

/**
 * Supprime une course : ses résultats et points d'abord (cf. resetRaceResults), puis la course
 * elle-même (les pronostics suivent par cascade). Une carte bonus jouée dessus reste consommée.
 */
export async function deleteRace(admin: SupabaseClient, raceId: string): Promise<void> {
  await resetRaceResults(admin, raceId);
  await admin.from("bonus_cards").update({ used_on_race_id: null }).eq("used_on_race_id", raceId);
  const { error } = await admin.from("races").delete().eq("id", raceId);
  if (error) throw new Error(error.message);
}

/**
 * Après une correction des résultats d'un sprint, la poursuite de l'étape déjà notée est renotée
 * avec ses cotes recalculées. Renvoie true si une poursuite a été renotée.
 */
export async function rescorePursuitAfterSprint(admin: SupabaseClient, sprintRaceId: string): Promise<boolean> {
  const { data: sprint } = await admin.from("races").select("stage_id, sex, format").eq("id", sprintRaceId).single();
  if (!sprint || sprint.format !== "sprint") return false;

  const { data: pursuit } = await admin
    .from("races")
    .select("id, status")
    .eq("stage_id", sprint.stage_id)
    .eq("format", "poursuite")
    .eq("sex", sprint.sex)
    .maybeSingle();
  if (!pursuit || pursuit.status !== "finished") return false;

  await scoreRace(admin, pursuit.id);
  return true;
}

/** Supprime une étape et toutes ses courses (chacune via deleteRace, pour ses points et cartes). */
export async function deleteStage(admin: SupabaseClient, stageId: string): Promise<void> {
  const { data: races } = await admin.from("races").select("id").eq("stage_id", stageId);
  for (const race of races ?? []) await deleteRace(admin, race.id);
  const { error } = await admin.from("stages").delete().eq("id", stageId);
  if (error) throw new Error(error.message);
}
