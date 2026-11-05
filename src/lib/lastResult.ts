import type { SupabaseClient } from "@supabase/supabase-js";
import {
  COMBINATION_BONUS,
  RANK_MULTIPLIERS,
  RELAY_RANK_MULTIPLIERS,
  TOUR_DE_PENA_MALUS_PER_LAP,
} from "./scoring/constants";
import { totalMisses } from "./shootings";
import { RELAY_FORMATS } from "./raceFormats";
import { applyFuseeGachetteRules, skiRankOf } from "./scoring/fuseeGachette";
import { shortAthleteName } from "./athleteName";
import { getUserBonusQuestionPointsByRace } from "./bonusQuestions";
import { getRacePlayers } from "./racePlayers";

/**
 * Encart « Dernier résultat » de l'accueil (inspiré de VéloPronos) : la
 * dernière course notée de la saison, ses points pour le joueur et le détail
 * par athlète/nation pronostiqué.
 */

export interface LastResultPick {
  key: string;
  name: string;
  nationCode: string;
  /** Place obtenue, null si hors du classement saisi. */
  rank: number | null;
  /** Points rapportés par ce choix, null s'il n'a pas compté (Balle de pioche). */
  points: number | null;
  /** Choix visé par la carte « Ça farte » (×3). */
  caFarte: boolean;
  /** Course Fête nationale : biathlète de l'équipe favorite dans le Top 10, points doublés (déjà inclus). */
  nationalDay?: boolean;
  /** Rang au temps de ski (🚀 pour le top 3) et sans-faute au tir (🎯). */
  skiRank: number | null;
  gachette: boolean;
  /** Points des cartes Fusée / Gâchette du joueur sur ce choix (fixes, déjà inclus dans `points`). */
  cardBonus: { fusee: number; gachette: number } | null;
  /** Fautes au tir, une valeur par tir (null : non saisies). */
  shootings: number[] | null;
  /** Détail du calcul (page de la course) : cote en vigueur et multiplicateur de la place (null hors barème). */
  odds: number | null;
  rankMultiplier: number | null;
  /** Course « Tour de péna » : tours de pénalité et malus (déjà inclus dans `points`), affichés à part. */
  penalty: { laps: number; points: number } | null;
}

/** Une ligne du classement de la course, avec les points du barème (cote × rang). */
export interface RaceResultRow {
  rank: number;
  name: string;
  nationCode: string;
  /** null : aucun point au barème (hors Top 10, ou Top 5 pour un relais). */
  points: number | null;
  skiRank: number | null;
  gachette: boolean;
  /** Fautes au tir, une valeur par tir (null : non saisies). */
  shootings: number[] | null;
  /** Ligne pronostiquée par le joueur. */
  mine: boolean;
  /** L'un des 3 meilleurs scores du barème : le trio du Prono parfait (courses individuelles). */
  perfect: boolean;
  /** Détail du calcul : cote en vigueur et multiplicateur de la place (null hors barème). */
  odds: number | null;
  rankMultiplier: number | null;
}

export interface LastResultExtra {
  /** Clé de traduction (Home.lastResultExtra_<kind>). */
  kind: "top3" | "top5" | "top10" | "pronoParfait" | "specialMalus" | "missingPicks" | "aspiration" | "pepite" | "equipe";
  points: number;
}

export interface LastResult {
  raceId: string;
  format: string;
  /** VéloPronos : numéro d'étape (0 = prologue, null = classique). */
  stageNumber?: number | null;
  sex: string | null;
  locksAt: string;
  location: string;
  countryCode: string;
  coefficient: number;
  /** false : étape « Autre (×0) », hors classement de la saison. */
  countsInStandings?: boolean;
  podium: { rank: number; name: string; nationCode: string }[];
  /** Classement complet saisi par l'admin. */
  results: RaceResultRow[];
  /**
   * Révélation de la Pépite cachée du joueur sur cette course (son premier Top 10) : place, nom
   * et points ajoutés au score de la course. null sinon. Indépendant du pronostic.
   */
  pepite: { rank: number; name: string; nationCode: string; points: number } | null;
  /** null : le joueur n'avait pas pronostiqué cette course. */
  prediction: {
    /** Total de la course : pronostic + questions bonus. */
    points: number;
    /** Points des questions bonus de la course, déjà compris dans `points`. */
    bonusQuestionPoints: number;
    /** Points de chaque choix, sans le bonus ×2 ni le coefficient Mondiaux/JO (affichés à part, cf. multiplier). */
    picks: LastResultPick[];
    /** Bonus ×2 perso ou coefficient ×2 de l'étape, et ce qu'il a rapporté en plus. */
    multiplier: { kind: "bonusX2" | "coefficient"; gain: number } | null;
    extras: LastResultExtra[];
    bonusX2: boolean;
    card: string | null;
    /** Place du joueur parmi tous les pronostiqueurs de la course. */
    playerRank: number | null;
    playerCount: number;
  } | null;
}

interface ResultRow {
  rank: number;
  athlete_id: string | null;
  nation_code: string | null;
  is_fusee: boolean;
  is_gachette: boolean;
  ski_rank?: number | null;
}

interface IndividualBreakdown {
  base?: Record<string, number>;
  combinationBonus?: number;
  pronoParfaitBonus?: number;
  specialMalus?: number;
  /** Tour de péna : biathlètes non pronostiqués (5 tours d'office chacun, déjà dans specialMalus). */
  missingPicks?: number;
  /** Cartes Fusée / Gâchette : points fixes par biathlète compté. */
  fuseeByAthlete?: Record<string, number>;
  gachetteByAthlete?: Record<string, number>;
  droppedByBalleDePioche?: string[];
  teamNationBoostedAthleteIds?: string[];
  nationalDayBoostedAthleteIds?: string[];
  aspirationBonus?: number;
  pepiteBonus?: number;
  /** Pépite révélée sur cette course (enregistrée depuis le 04/11/2026). */
  pepiteAthleteId?: string;
  /** Carte Équipe : cotes des biathlètes de l'équipe favorite dans le Top 10. */
  equipeBonus?: number;
}

/**
 * Reconstitue les points de chaque athlète pronostiqué à partir du détail
 * enregistré dans score_ledger.breakdown, en rejouant les multiplicateurs du
 * moteur (cf. computeIndividualRaceScore) : Balle de pioche, cartes Fusée/Gâchette (fixes, doublées par le bonus ×2 seulement),
 * Ça farte ×3, coefficient Mondiaux/JO ou bonus ×2 perso, Team Nation ×2, Fête nationale ×2 (jamais
 * cumulée avec un autre ×2 : elle reste dans les points du choix, hors du gain du bonus ×2 affiché à part).
 */
export function computeIndividualPickPoints(params: {
  athleteIds: string[];
  breakdown: IndividualBreakdown;
  stageCoefficient: number;
  bonusX2: boolean;
  caFarteTargetId: string | null;
}): Record<string, number | null> {
  const { athleteIds, breakdown, stageCoefficient, bonusX2, caFarteTargetId } = params;
  const dropped = new Set(breakdown.droppedByBalleDePioche ?? []);
  const teamNation = new Set(breakdown.teamNationBoostedAthleteIds ?? []);
  const nationalDay = new Set(breakdown.nationalDayBoostedAthleteIds ?? []);
  const globalMultiplier = stageCoefficient === 2 ? 2 : bonusX2 ? 2 : 1;

  const points: Record<string, number | null> = {};
  for (const id of athleteIds) {
    if (dropped.has(id)) {
      points[id] = null;
      continue;
    }
    const raw = breakdown.base?.[id] ?? 0;
    const cards = (breakdown.fuseeByAthlete?.[id] ?? 0) + (breakdown.gachetteByAthlete?.[id] ?? 0);
    // Cartes Fusée / Gâchette : points bruts dans le breakdown, doublés par le bonus ×2 perso.
    points[id] =
      cards * (bonusX2 ? 2 : 1) +
      (id === caFarteTargetId
        ? raw * 3
        : nationalDay.has(id)
          ? raw * 2
          : raw * globalMultiplier * (teamNation.has(id) ? 2 : 1));
  }
  return points;
}

/** Palier du bonus de combinaison, retrouvé à partir de son montant (Top 3 = 100, Top 5 = 50, Top 10 = 20). */
function combinationTierKind(points: number): "top3" | "top5" | "top10" {
  if (points >= COMBINATION_BONUS.podium) return "top3";
  if (points >= COMBINATION_BONUS.top5) return "top5";
  return "top10";
}

/** Bonus et malus de course qui ne sont rattachés à aucun athlète en particulier. */
export function computeIndividualExtras(breakdown: IndividualBreakdown): LastResultExtra[] {
  const combination = breakdown.combinationBonus ?? 0;
  const extras: LastResultExtra[] = [
    { kind: combinationTierKind(combination), points: combination },
    { kind: "pronoParfait", points: breakdown.pronoParfaitBonus ?? 0 },
    // Tour de péna : biathlètes non pronostiqués, 5 tours d'office chacun.
    { kind: breakdown.missingPicks ? "missingPicks" : "specialMalus", points: breakdown.specialMalus ?? 0 },
    { kind: "aspiration", points: breakdown.aspirationBonus ?? 0 },
    { kind: "equipe", points: breakdown.equipeBonus ?? 0 },
  ];
  return extras.filter((e) => e.points !== 0);
}

/**
 * Les 3 lignes au plus fort score du barème (Top 10, cote × rang) : le trio du
 * Prono parfait, comme computeBestPossibleTrio du moteur (même tri, ordre d'arrivée en cas d'égalité).
 */
export function markPronoParfait<T extends { rank: number; points: number | null }>(rows: T[]): (T & { perfect: boolean })[] {
  const best = new Set(
    rows
      .filter((r) => r.rank <= 10 && r.points != null)
      .sort((a, b) => b.points! - a.points! || a.rank - b.rank)
      .slice(0, 3)
  );
  return rows.map((r) => ({ ...r, perfect: best.size === 3 && best.has(r) }));
}

/**
 * Points du barème pour une ligne de résultat, sans les multiplicateurs ni les cartes propres à
 * chaque joueur (Fusée et Gâchette sont des cartes depuis le 04/11/2026).
 */
export function computeResultRowPoints(params: { rank: number; odds: number | undefined; relay: boolean }): number | null {
  const { rank, odds, relay } = params;
  const multiplier = (relay ? RELAY_RANK_MULTIPLIERS : RANK_MULTIPLIERS)[rank];
  const base = multiplier && odds != null ? multiplier * odds : 0;
  return base > 0 ? base : null;
}

const RACE_SELECT = "id, stage_id, format, stage_number, sex, locks_at, special_rule, stages!inner(location, country_code, coefficient, counts_in_standings, season_id)";

/** Durée pendant laquelle le dernier résultat de chaque catégorie reste affiché sur l'accueil. */
export const LAST_RESULTS_WINDOW_MS = 48 * 3600 * 1000;

/**
 * Partie pure (testée) de « Derniers résultats » : la dernière course notée de
 * chaque catégorie (Hommes, Femmes, mixte) partie dans les 48 dernières heures,
 * un nouveau résultat d'une catégorie remplaçant le précédent. Sans résultat
 * dans les 48 h, la dernière course notée reste affichée seule.
 */
export function pickLastResultRaces<T extends { sex: string | null; locks_at: string }>(racesNewestFirst: T[], now: Date): T[] {
  const since = now.getTime() - LAST_RESULTS_WINDOW_MS;
  const byCategory = new Map<string, T>();
  for (const race of racesNewestFirst) {
    if (new Date(race.locks_at).getTime() < since) break;
    const category = race.sex ?? "mixte";
    if (!byCategory.has(category)) byCategory.set(category, race);
  }
  const picked = byCategory.size > 0 ? Array.from(byCategory.values()) : racesNewestFirst.slice(0, 1);
  // Le plus récent en haut (demande de Guillaume).
  return picked.sort((x, y) => y.locks_at.localeCompare(x.locks_at));
}

/** « Derniers résultats » de l'accueil (voir pickLastResultRaces). */
export async function getLastResults(
  supabase: SupabaseClient,
  seasonId: string,
  userId: string,
  now: Date,
  /** Résultat du jour déjà affiché dans « L'étape de la semaine » : il ne bascule ici qu'à minuit. */
  excludeRaceId: string | null = null
): Promise<LastResult[]> {
  // Quelques courses suffisent : au plus une par catégorie dans les 48 h.
  const { data: races } = await supabase
    .from("races")
    .select(RACE_SELECT)
    .eq("stages.season_id", seasonId)
    .eq("status", "finished")
    .lte("locks_at", now.toISOString())
    .order("locks_at", { ascending: false })
    .limit(12);
  const picked = pickLastResultRaces(((races ?? []) as any[]).filter((r) => r.id !== excludeRaceId), now);
  return Promise.all(picked.map((race) => buildRaceResult(supabase, race, userId)));
}

/** Même détail pour une course donnée (page d'une course terminée). */
export async function getRaceResult(supabase: SupabaseClient, raceId: string, userId: string | null): Promise<LastResult | null> {
  const { data: race } = await supabase.from("races").select(RACE_SELECT).eq("id", raceId).maybeSingle();
  return race ? buildRaceResult(supabase, race, userId) : null;
}

async function buildRaceResult(supabase: SupabaseClient, race: any, userId: string | null): Promise<LastResult> {
  const stage = race.stages as any as {
    location: string;
    country_code: string;
    coefficient: number;
    counts_in_standings?: boolean;
    season_id: string;
  };
  const relay = RELAY_FORMATS.includes(race.format);

  const [{ data: results }, { data: prediction }, { data: ledger }, { data: odds }, bonusByRace] = await Promise.all([
    supabase
      .from("race_results")
      .select("rank, athlete_id, nation_code, is_fusee, is_gachette, ski_rank, shootings, penalty_laps, athletes(first_name, last_name, nation_code), nations(name)")
      .eq("race_id", race.id)
      .order("rank", { ascending: true }),
    userId
      ? supabase
          .from("predictions")
          .select("athlete_ids, nation_code, bonus_x2_used, bonus_card_used, bonus_card_target_athlete_id")
          .eq("user_id", userId)
          .eq("race_id", race.id)
          .maybeSingle()
      : Promise.resolve({ data: null as any }),
    userId
      ? supabase.from("score_ledger").select("points, breakdown").eq("user_id", userId).eq("race_id", race.id).maybeSingle()
      : Promise.resolve({ data: null as any }),
    // Cotes en vigueur, celles qu'utilise le calcul des points (cf. scoreRace).
    supabase
      .from("odds")
      .select(relay ? "nation_code, value" : "athlete_id, value")
      .eq("season_id", stage.season_id)
      .eq("stage_id", race.stage_id) // cotes propres à la course (VéloPronos, 0045)
      .eq("format", race.format)
      .is("valid_until", null),
    // Questions bonus de la course : leurs points s'ajoutent au total de la course.
    userId ? getUserBonusQuestionPointsByRace(supabase, userId, [race.id]) : Promise.resolve(new Map<string, number>()),
  ]);

  const resultRows = ((results ?? []) as any[]).map((r) => applyFuseeGachetteRules(race.format, r));
  const shortName = (a: { first_name?: string; last_name?: string } | null | undefined) =>
    shortAthleteName(a, "");
  const rowName = (r: any) => (r.athlete_id ? shortName(r.athletes) : r.nations?.name ?? r.nation_code);
  const rowNation = (r: any) => (r.athlete_id ? r.athletes?.nation_code ?? "" : r.nation_code);

  const podium = resultRows
    .filter((r) => r.rank <= 3)
    .map((r) => ({ rank: r.rank as number, name: rowName(r), nationCode: rowNation(r) }));

  const oddsByKey = new Map(((odds ?? []) as any[]).map((o) => [(relay ? o.nation_code : o.athlete_id) as string, o.value as number]));
  const rankMultipliers = relay ? RELAY_RANK_MULTIPLIERS : RANK_MULTIPLIERS;
  const predictedKeys = new Set<string>(prediction?.nation_code ? [prediction.nation_code] : prediction?.athlete_ids ?? []);
  const scoredRows = resultRows.map((r) => ({
    rank: r.rank,
    name: rowName(r),
    nationCode: rowNation(r),
    points: computeResultRowPoints({
      rank: r.rank,
      odds: oddsByKey.get(r.athlete_id ?? r.nation_code),
      relay,
    }),
    skiRank: relay ? null : skiRankOf(r),
    gachette: r.is_gachette,
    shootings: r.shootings ?? null,
    mine: predictedKeys.has(r.athlete_id ?? r.nation_code),
    odds: oddsByKey.get(r.athlete_id ?? r.nation_code) ?? null,
    rankMultiplier: rankMultipliers[r.rank] ?? null,
  }));
  const fullResults: RaceResultRow[] = relay ? scoredRows.map((r) => ({ ...r, perfect: false })) : markPronoParfait(scoredRows);

  // Pépite cachée révélée sur cette course : mise en avant à part (place, nom, points).
  const breakdownAll = (ledger?.breakdown ?? {}) as IndividualBreakdown;
  let pepite: LastResult["pepite"] = null;
  const pepiteBonus = Number(breakdownAll.pepiteBonus ?? 0);
  if (userId && !relay && pepiteBonus > 0) {
    let pepiteId = breakdownAll.pepiteAthleteId ?? null;
    if (!pepiteId) {
      // Courses notées avant l'enregistrement de pepiteAthleteId : la Pépite révélée classée dans le Top 10.
      const { data: claimed } = await supabase
        .from("pepites")
        .select("athlete_id")
        .eq("user_id", userId)
        .eq("season_id", stage.season_id)
        .eq("bonus_claimed", true);
      const ids = new Set(((claimed ?? []) as any[]).map((p) => p.athlete_id as string));
      pepiteId = resultRows.find((r) => r.athlete_id && r.rank <= 10 && ids.has(r.athlete_id))?.athlete_id ?? null;
    }
    const row = pepiteId ? resultRows.find((r) => r.athlete_id === pepiteId) : null;
    if (row) pepite = { rank: row.rank, name: rowName(row), nationCode: rowNation(row), points: pepiteBonus };
  }

  const base: Omit<LastResult, "prediction"> = {
    raceId: race.id,
    format: race.format,
    stageNumber: race.stage_number ?? null,
    sex: race.sex,
    locksAt: race.locks_at,
    location: stage.location,
    countryCode: stage.country_code,
    coefficient: stage.coefficient,
    countsInStandings: stage.counts_in_standings !== false,
    podium,
    results: fullResults,
    pepite,
  };

  const hasPrediction = prediction && ((prediction.athlete_ids?.length ?? 0) > 0 || prediction.nation_code);
  if (!hasPrediction) return { ...base, prediction: null };

  // Points du pronostic seul (le détail par choix et le gain du ×2 en dépendent).
  const points = Number(ledger?.points ?? 0);
  const bonusQuestionPoints = bonusByRace.get(race.id) ?? 0;
  const breakdown = (ledger?.breakdown ?? {}) as IndividualBreakdown;

  // Place du joueur au classement de la course, questions bonus comprises (comme getRacePlayers).
  const players = await getRacePlayers(supabase, race.id);
  const myRow = players.find((p) => p.userId === userId);

  let picks: LastResultPick[];
  let extras: LastResultExtra[] = [];
  // Bonus ×2 perso ou coefficient Mondiaux/JO (non cumulables) : sorti du détail par choix.
  const multiplierKind: "bonusX2" | "coefficient" | null =
    stage.coefficient === 2 ? "coefficient" : prediction.bonus_x2_used ? "bonusX2" : null;
  let multiplierGain = 0;

  if (prediction.nation_code) {
    const row = resultRows.find((r) => r.nation_code === prediction.nation_code);
    let name = row ? rowName(row) : prediction.nation_code;
    if (!row) {
      const { data: nation } = await supabase.from("nations").select("name").eq("code", prediction.nation_code).maybeSingle();
      name = nation?.name ?? prediction.nation_code;
    }
    multiplierGain = multiplierKind ? points / 2 : 0;
    picks = [
      {
        key: prediction.nation_code,
        name,
        nationCode: prediction.nation_code,
        rank: row?.rank ?? null,
        points: multiplierKind ? points / 2 : points,
        caFarte: false,
        skiRank: null,
        gachette: false,
        cardBonus: null,
        shootings: row?.shootings ?? null,
        odds: oddsByKey.get(prediction.nation_code) ?? null,
        rankMultiplier: row ? rankMultipliers[row.rank] ?? null : null,
        penalty: null,
      },
    ];
  } else {
    const athleteIds: string[] = prediction.athlete_ids ?? [];
    const caFarteTargetId =
      prediction.bonus_card_used === "ca_farte" ? prediction.bonus_card_target_athlete_id ?? null : null;
    const pickPointsParams = { athleteIds, breakdown, caFarteTargetId };
    const pickPoints = computeIndividualPickPoints({ ...pickPointsParams, stageCoefficient: 1, bonusX2: false });
    const multipliedPoints = computeIndividualPickPoints({
      ...pickPointsParams,
      stageCoefficient: stage.coefficient,
      bonusX2: prediction.bonus_x2_used,
    });
    const sum = (byId: Record<string, number | null>) => Object.values(byId).reduce<number>((total, v) => total + (v ?? 0), 0);
    multiplierGain = sum(multipliedPoints) - sum(pickPoints);

    // Athlètes pronostiqués absents du classement saisi : nom chargé à part.
    const missingIds = athleteIds.filter((id) => !resultRows.some((r) => r.athlete_id === id));
    const { data: missingAthletes } = missingIds.length
      ? await supabase.from("athletes").select("id, first_name, last_name, nation_code").in("id", missingIds)
      : { data: [] as any[] };

    picks = athleteIds.map((id) => {
      const row = resultRows.find((r) => r.athlete_id === id);
      const athlete = row?.athletes ?? (missingAthletes ?? []).find((a: any) => a.id === id);
      // Tour de péna : même nombre de tours que le moteur (saisi, sinon fautes au tir), ×3 avec Ça farte.
      const laps = race.special_rule === "tour_de_pena" ? row?.penalty_laps || totalMisses(row?.shootings) || 0 : 0;
      const penaltyPoints = laps * TOUR_DE_PENA_MALUS_PER_LAP * (id === caFarteTargetId ? 3 : 1);
      const counted = pickPoints[id] != null;
      return {
        key: id,
        name: shortName(athlete),
        nationCode: athlete?.nation_code ?? "",
        rank: row?.rank ?? null,
        points: counted && laps > 0 ? pickPoints[id]! - penaltyPoints : pickPoints[id],
        caFarte: id === caFarteTargetId,
        nationalDay: (breakdown.nationalDayBoostedAthleteIds ?? []).includes(id),
        skiRank: row ? skiRankOf(row) : null,
        gachette: row?.is_gachette ?? false,
        cardBonus:
          breakdown.fuseeByAthlete?.[id] || breakdown.gachetteByAthlete?.[id]
            ? { fusee: breakdown.fuseeByAthlete?.[id] ?? 0, gachette: breakdown.gachetteByAthlete?.[id] ?? 0 }
            : null,
        shootings: row?.shootings ?? null,
        odds: oddsByKey.get(id) ?? null,
        rankMultiplier: row ? rankMultipliers[row.rank] ?? null : null,
        penalty: counted && laps > 0 ? { laps, points: penaltyPoints } : null,
      };
    });
    // Ordre d'arrivée, les non classés à la fin (comme VéloPronos).
    picks.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
    extras = computeIndividualExtras(breakdown);
  }

  return {
    ...base,
    prediction: {
      points: Math.round((points + bonusQuestionPoints) * 10) / 10,
      bonusQuestionPoints,
      picks,
      multiplier: multiplierKind && multiplierGain !== 0 ? { kind: multiplierKind, gain: multiplierGain } : null,
      extras,
      bonusX2: prediction.bonus_x2_used,
      card: prediction.bonus_card_used ?? null,
      playerRank: ledger && myRow ? myRow.rank : null,
      playerCount: players.length,
    },
  };
}
