import { GROS_GLOBE_MULTIPLIERS, PETIT_GLOBE_MULTIPLIERS, PEPITE_MIN_ODDS, RANK_MULTIPLIERS } from "./constants";

export type SeasonPredictionCategory =
  | "gros_globe_h"
  | "gros_globe_f"
  | "meilleur_jeune_h"
  | "meilleur_jeune_f"
  | "meilleure_nation_h"
  | "meilleure_nation_f";

/**
 * §6 — globes de saison : cote × multiplicateur selon la position finale
 * (1re à 5e) du choix du joueur dans le classement officiel de fin de
 * saison saisi par l'admin. Gros globe (barème large) vs meilleur(e) jeune
 * / meilleure nation (barème réduit, podium uniquement).
 */
export function computeSeasonPredictionScore(
  category: SeasonPredictionCategory,
  finalRank: number | null,
  odds: number
): number {
  if (finalRank == null) return 0;
  const multipliers = category.startsWith("gros_globe") ? GROS_GLOBE_MULTIPLIERS : PETIT_GLOBE_MULTIPLIERS;
  return (multipliers[finalRank] ?? 0) * odds;
}

/**
 * §14 — Pépite cachée : un outsider choisi en début de saison (toutes ses
 * cotes ≥ 30 au moment du choix), une par sexe. C'est un pronostic caché actif sur chaque course
 * individuelle jusqu'à son premier Top 10 de la saison : à ce moment-là, son
 * score sur cette course (cote × multiplicateur de rang, même barème qu'un
 * pronostic normal, §1) s'ajoute en bonus au score du joueur. Ensuite, elle
 * redevient un athlète comme un autre — plus de bonus automatique sur les
 * courses suivantes (confirmé par Guillaume).
 */
export function isPepiteEligible(oddsAtPick: number): boolean {
  return oddsAtPick >= PEPITE_MIN_ODDS;
}

/**
 * Éligibilité d'un biathlète comme Pépite (règle précisée par Guillaume le
 * 04/11/2026) : TOUTES ses cotes courantes de la saison (sprint, poursuite,
 * individuel, mass start, globe, jeune) doivent être ≥ 30, pas une seule.
 * Même règle côté base : pepite_is_eligible (migration 0035).
 */
export function isPepiteEligibleOdds(allOdds: number[]): boolean {
  return allOdds.length > 0 && allOdds.every((v) => isPepiteEligible(Number(v)));
}

export function computePepiteBonus(oddsAtRace: number, rank: number, multiplier: 1 | 2 = 1): number {
  if (rank > 10) return 0;
  // Bonus ×2 perso du joueur sur l'étape, ou coefficient ×2 de la course (non cumulables) : les
  // points du porteur d'eau révélé sont doublés aussi (Guillaume, 26/11/2026, comme Biathlonpronos).
  return (RANK_MULTIPLIERS[rank] ?? 0) * oddsAtRace * multiplier;
}
