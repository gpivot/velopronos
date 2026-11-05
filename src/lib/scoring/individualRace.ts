import {
  ASPIRATION_BONUS_BY_COUNT,
  COMBINATION_BONUS,
  RANK_MULTIPLIERS,
  TES_COLLE_MALUS,
  TOUR_DE_PENA_EMPTY_PICK_LAPS,
  TOUR_DE_PENA_MALUS_PER_LAP,
} from "./constants";
import { fuseeCardPoints, gachetteCardPoints } from "./fuseeGachette";
import type {
  AthleteRaceResult,
  FavoriteTeam,
  IndividualRaceScoringInput,
  IndividualRaceScoringResult,
  Sex,
} from "./types";

/**
 * Moteur de scoring d'une course individuelle (sprint/poursuite/individuel/
 * mass start) pour le pronostic d'un joueur. Suit la séquence documentée
 * dans docs/architecture-technique.md (§ Moteur de scoring). Le règlement
 * (docs/reglement.md) laisse plusieurs points d'interprétation ouverts ;
 * les choix retenus ici sont documentés dans architecture-technique.md
 * (§ Décisions d'implémentation du moteur de scoring, confirmées par
 * Guillaume).
 */
export function computeIndividualRaceScore(
  input: IndividualRaceScoringInput
): IndividualRaceScoringResult {
  // Carte Aspiration : chaque athlète pronostiqué remonte d'une place (le 1er reste 1er, un 11e
  // devient 10e et marque). Les bonus de combinaison et le Prono parfait suivent ces places.
  const results =
    input.card.type === "aspiration"
      ? input.results.map((r) =>
          input.predictedAthleteIds.includes(r.athleteId) ? { ...r, rank: Math.max(1, r.rank - 1) } : r
        )
      : input.results;
  const resultsByAthleteId = new Map(results.map((r) => [r.athleteId, r]));

  // 2. Points de base par athlète pronostiqué (cote × rang), + malus
  // "tour de péna" qui est propre à chacun des biathlètes choisis.
  const base: Record<string, number> = {};
  for (const athleteId of input.predictedAthleteIds) {
    base[athleteId] = computeBaseAthletePoints(
      resultsByAthleteId.get(athleteId),
      input.oddsByAthleteId[athleteId] ?? 0,
      input.specialRule
    );
  }

  // Cartes Fusée / Gâchette posées sur l'étape (04/11/2026) : points fixes par biathlète, doublés
  // seulement par le bonus ×2 perso (ni Mondiaux/JO, où les cartes n'existent pas, ni Fête nationale,
  // ni Team Nation ; Ça farte n'est pas cumulable). Pas besoin d'être dans le Top 10.
  const fuseeByAthlete: Record<string, number> = {};
  const gachetteByAthlete: Record<string, number> = {};
  for (const athleteId of input.predictedAthleteIds) {
    const result = resultsByAthleteId.get(athleteId);
    const skiRank = result?.skiRank ?? (result?.isFusee ? 1 : null);
    fuseeByAthlete[athleteId] = input.stageCards?.fusee ? fuseeCardPoints(skiRank) : 0;
    gachetteByAthlete[athleteId] = input.stageCards?.gachette
      ? gachetteCardPoints(input.raceFormat ?? "", result?.isGachette)
      : 0;
  }
  const cardBonusOf = (athleteId: string) => fuseeByAthlete[athleteId] + gachetteByAthlete[athleteId];

  const rawScore: Record<string, number> = {};
  for (const athleteId of input.predictedAthleteIds) {
    rawScore[athleteId] = base[athleteId];
  }

  // 6. Coefficient ×2 Mondiaux/JO, non cumulable avec le bonus ×2 personnel.
  const globalMultiplier = input.stageCoefficient === 2 ? 2 : input.bonusX2Active ? 2 : 1;
  const cardMultiplier = input.bonusX2Active ? 2 : 1;
  const caFarteTargetId =
    input.card.type === "ca_farte"
      ? input.card.targetAthleteId
      : input.card.type === "balle_de_pioche"
        ? input.card.caFarteTargetAthleteId ?? null
        : null;

  // Fête nationale : biathlètes de l'équipe favorite (nation + sexe) classés dans le Top 10.
  // Leurs points passent à ×2, sans cumul avec le bonus ×2 perso ni le coefficient Mondiaux/JO.
  const isNationalDayBoosted = (athleteId: string) =>
    input.specialRule === "fete_nationale" &&
    isFavoriteTeamAthlete(athleteId, input.athleteTeamByAthleteId, input.nationalDayTeam ?? null) &&
    (resultsByAthleteId.get(athleteId)?.rank ?? Infinity) <= 10;

  // 5b. Carte "Balle de pioche" — 4 choix, seuls les 3 meilleurs comptent. Avec Ça farte posé sur
  // un des 4, le ×3 est pris en compte pour désigner les 3 meilleurs (confirmé).
  // Les cartes Fusée / Gâchette comptent aussi pour désigner les 3 meilleurs (comme l'ancien bonus).
  const { counted, dropped } = selectCountedAthletes(
    input.predictedAthleteIds,
    rawScore,
    input.card,
    (id) => (id === caFarteTargetId ? 3 : isNationalDayBoosted(id) ? 2 : globalMultiplier),
    (id) => cardBonusOf(id) * cardMultiplier
  );

  // 5a. Carte "Ça farte" (×3) et 7. Bonus Team Nation (×2). Confirmé par
  // Guillaume : le ×3 n'est jamais cumulable avec un ×2 — l'athlète ciblé
  // par "Ça farte" ne reçoit ni le coefficient/bonus perso, ni Team Nation.
  const perAthlete: Record<string, number> = {};
  const teamNationBoostedAthleteIds: string[] = [];
  const nationalDayBoostedAthleteIds: string[] = [];
  for (const athleteId of counted) {
    const isCaFarteTarget = caFarteTargetId === athleteId;

    if (isCaFarteTarget) {
      perAthlete[athleteId] = rawScore[athleteId] * 3;
      continue;
    }

    if (isNationalDayBoosted(athleteId)) {
      perAthlete[athleteId] = rawScore[athleteId] * 2;
      nationalDayBoostedAthleteIds.push(athleteId);
      continue;
    }

    let value = rawScore[athleteId] * globalMultiplier;
    if (isEligibleForTeamNationBonus(athleteId, input.athleteTeamByAthleteId, input.favoriteTeam, input.raceCountryCode)) {
      value *= 2;
      teamNationBoostedAthleteIds.push(athleteId);
    }
    perAthlete[athleteId] = value;
  }

  // 3. Bonus de combinaison (Top 3/Top 5/Top 10, non cumulables entre eux —
  // seul le meilleur palier atteint est payé), sur les athlètes comptés.
  const tierBonus = computeCombinationBonus(counted, resultsByAthleteId);

  // Prono parfait : comparé aux 3 athlètes effectivement comptés (donc,
  // avec la Balle de pioche, aux 3 meilleurs des 4 choix — confirmé par
  // Guillaume, puisque ce seront de fait les 3 qui comptent pour l'étape).
  const pronoParfaitBonus = computePronoParfaitBonus(counted, results, input.oddsByAthleteId);
  // Demande de Guillaume (octobre 2026) : le Prono parfait remplace le bonus
  // Top 3/Top 5/Top 10, il ne s'y ajoute pas.
  const combinationBonus = pronoParfaitBonus > 0 ? 0 : tierBonus;

  // 4. Malus "t'es collé(e)" — lu sur l'ensemble du pronostic, pas par
  // athlète ("tour de péna" et "brouillard" sont déjà inclus au point 2).
  // Tour de péna : chaque biathlète non pronostiqué compte 5 tours d'office (Guillaume, 04/11/2026).
  const missingPicks = input.specialRule === "tour_de_pena" ? Math.max(0, 3 - input.predictedAthleteIds.length) : 0;
  const specialMalus =
    input.specialRule === "tes_colle"
      ? computeTesColleMalus(input.predictedAthleteIds, resultsByAthleteId)
      : missingPicks > 0
        ? missingPicks * TOUR_DE_PENA_EMPTY_PICK_LAPS * TOUR_DE_PENA_MALUS_PER_LAP
        : 0;

  const fuseeCardBonus = counted.reduce((sum, id) => sum + fuseeByAthlete[id], 0);
  const gachetteCardBonus = counted.reduce((sum, id) => sum + gachetteByAthlete[id], 0);
  // Points des cartes doublés par le bonus ×2 perso (Guillaume, 04/11/2026 : « 100 peut devenir 200 »).
  // Les valeurs par biathlète du breakdown restent brutes ; le total, lui, est multiplié.
  const fuseeGachetteBonus = (fuseeCardBonus + gachetteCardBonus) * cardMultiplier;

  // VéloPronos : Musette, Prono parfait et combatif du jour passent aussi au ×2 (règle base44).
  const bonusMultiplier = input.veloRules ? globalMultiplier : 1;
  const combatifBonus = (input.combatifBonus ?? 0) * bonusMultiplier;
  const total =
    Object.values(perAthlete).reduce((sum, v) => sum + v, 0) +
    fuseeGachetteBonus +
    (combinationBonus + pronoParfaitBonus) * bonusMultiplier +
    combatifBonus +
    specialMalus;

  return {
    total,
    perAthlete,
    breakdown: {
      base,
      combinationBonus: combinationBonus * bonusMultiplier,
      pronoParfaitBonus: pronoParfaitBonus * bonusMultiplier,
      ...(combatifBonus ? { combatifBonus } : {}),
      specialMalus,
      ...(missingPicks > 0 ? { missingPicks } : {}),
      fuseeGachetteBonus,
      ...(fuseeCardBonus ? { fuseeCardBonus, fuseeByAthlete: pickNonZero(fuseeByAthlete, counted) } : {}),
      ...(gachetteCardBonus ? { gachetteCardBonus, gachetteByAthlete: pickNonZero(gachetteByAthlete, counted) } : {}),
      droppedByBalleDePioche: dropped,
      teamNationBoostedAthleteIds,
      nationalDayBoostedAthleteIds,
    },
  };
}

function computeBaseAthletePoints(
  result: AthleteRaceResult | undefined,
  odds: number,
  specialRule: IndividualRaceScoringInput["specialRule"]
): number {
  const rank = result?.rank;
  let points = 0;

  if (rank != null && rank <= 10) {
    points = RANK_MULTIPLIERS[rank] * odds;
  } else if (specialRule === "brouillard" && rank != null) {
    // §9 — hors Top 10 sous "brouillard" : -1 pt par place au-delà de la 10e.
    points = -rank;
  }

  if (specialRule === "tour_de_pena") {
    points += (result?.penaltyLaps ?? 0) * TOUR_DE_PENA_MALUS_PER_LAP;
  }

  return points;
}

function pickNonZero(values: Record<string, number>, ids: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of ids) if (values[id]) out[id] = values[id];
  return out;
}

function selectCountedAthletes(
  predictedAthleteIds: string[],
  rawScore: Record<string, number>,
  card: IndividualRaceScoringInput["card"],
  multiplierOf: (athleteId: string) => number,
  flatBonusOf: (athleteId: string) => number
): { counted: string[]; dropped: string[] } {
  if (card.type !== "balle_de_pioche" || predictedAthleteIds.length <= 3) {
    return { counted: predictedAthleteIds, dropped: [] };
  }

  const value = (id: string) => rawScore[id] * multiplierOf(id) + flatBonusOf(id);
  const sorted = [...predictedAthleteIds].sort((a, b) => value(b) - value(a));
  return { counted: sorted.slice(0, 3), dropped: sorted.slice(3) };
}

function isFavoriteTeamAthlete(
  athleteId: string,
  athleteTeamByAthleteId: Record<string, { nationCode: string; sex: Sex }>,
  team: FavoriteTeam | null
): boolean {
  if (!team) return false;
  const athleteTeam = athleteTeamByAthleteId[athleteId];
  return athleteTeam?.nationCode === team.nationCode && athleteTeam?.sex === team.sex;
}

function isEligibleForTeamNationBonus(
  athleteId: string,
  athleteTeamByAthleteId: Record<string, { nationCode: string; sex: Sex }>,
  favoriteTeam: FavoriteTeam | null,
  raceCountryCode: string
): boolean {
  if (!favoriteTeam || favoriteTeam.nationCode !== raceCountryCode) return false;
  const team = athleteTeamByAthleteId[athleteId];
  return team?.nationCode === favoriteTeam.nationCode && team?.sex === favoriteTeam.sex;
}

function computeCombinationBonus(
  counted: string[],
  resultsByAthleteId: Map<string, AthleteRaceResult>
): number {
  // §1 — bonus évalués "sur l'ensemble des 3 choix" : jamais pour un
  // pronostic incomplet (moins de 3 comptés, cf. malus "t'es collé(e)").
  if (counted.length !== 3) return 0;

  const ranks = counted.map((id) => resultsByAthleteId.get(id)?.rank);
  if (ranks.some((r) => r == null)) return 0;

  // Non cumulables entre eux : seul le meilleur palier atteint est payé.
  const worstRank = Math.max(...(ranks as number[]));
  if (worstRank <= 3) return COMBINATION_BONUS.podium;
  if (worstRank <= 5) return COMBINATION_BONUS.top5;
  if (worstRank <= 10) return COMBINATION_BONUS.top10;
  return 0;
}

function computeAthletePotentialScore(result: AthleteRaceResult, odds: number): number {
  // Fusée et Gâchette n'entrent plus dans le Prono parfait : ce sont des cartes propres à chaque joueur.
  if (result.rank > 10) return -Infinity;
  return RANK_MULTIPLIERS[result.rank] * odds;
}

/** La combinaison des 3 athlètes qui rapportent objectivement le plus de points dans le Top 10. */
function computeBestPossibleTrio(
  results: AthleteRaceResult[],
  oddsByAthleteId: Record<string, number>
): Set<string> {
  const scored = results
    .map((r) => ({ athleteId: r.athleteId, score: computeAthletePotentialScore(r, oddsByAthleteId[r.athleteId] ?? 0) }))
    .filter((s) => s.score > -Infinity)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return new Set(scored.map((s) => s.athleteId));
}

function computePronoParfaitBonus(
  counted: string[],
  results: AthleteRaceResult[],
  oddsByAthleteId: Record<string, number>
): number {
  if (counted.length !== 3) return 0;

  const bestTrio = computeBestPossibleTrio(results, oddsByAthleteId);
  if (bestTrio.size !== 3) return 0;

  const matches = counted.every((id) => bestTrio.has(id));
  return matches ? COMBINATION_BONUS.pronoParfait : 0;
}

function computeTesColleMalus(
  predictedAthleteIds: string[],
  resultsByAthleteId: Map<string, AthleteRaceResult>
): number {
  if (predictedAthleteIds.length === 0) return TES_COLLE_MALUS.noBetOrIncomplete;

  let outsideTop10Count = 0;
  for (let slot = 0; slot < 3; slot++) {
    const athleteId = predictedAthleteIds[slot];
    const rank = athleteId ? resultsByAthleteId.get(athleteId)?.rank : undefined;
    if (!athleteId || rank == null || rank > 10) outsideTop10Count++;
  }

  if (outsideTop10Count === 1) return TES_COLLE_MALUS.oneOutOfTop10;
  if (outsideTop10Count === 2) return TES_COLLE_MALUS.twoOutOfTop10;
  if (outsideTop10Count === 3) return TES_COLLE_MALUS.threeOutOfTop10;
  return 0;
}

/**
 * §11 — bonus Aspiration (retiré du règlement le 30/10/2026, plus appelé par le calcul) : indépendant du pronostic du joueur, à partir du
 * nombre d'athlètes de sa nation/sexe favori(te) classés Top 10 sur la course.
 */
export function computeAspirationBonus(
  results: AthleteRaceResult[],
  athleteTeamByAthleteId: Record<string, { nationCode: string; sex: Sex }>,
  favoriteTeam: FavoriteTeam | null
): number {
  if (!favoriteTeam) return 0;

  const count = results.filter((r) => {
    if (r.rank > 10) return false;
    const team = athleteTeamByAthleteId[r.athleteId];
    return team?.nationCode === favoriteTeam.nationCode && team?.sex === favoriteTeam.sex;
  }).length;

  if (count < 2) return 0;
  return ASPIRATION_BONUS_BY_COUNT[count] ?? ASPIRATION_BONUS_BY_COUNT[4];
}
