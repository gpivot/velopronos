// Barèmes chiffrés du règlement (docs/reglement.md) — une seule source de
// vérité pour toutes les valeurs numériques du moteur de scoring.

/** §1 — cote × multiplicateur, par rang. Rien au-delà de la 10e place. */
export const RANK_MULTIPLIERS: Record<number, number> = {
  1: 25,
  2: 18,
  3: 13,
  4: 10,
  5: 7,
  6: 5,
  7: 4,
  8: 3,
  9: 2,
  10: 1,
};

/** §1 — bonus de combinaison, évalués sur l'ensemble des 3 choix comptés. */
export const COMBINATION_BONUS = {
  podium: 100,
  top5: 50,
  top10: 20,
  pronoParfait: 200,
} as const;

/** §4 — recalcul de la cote poursuite à partir de l'écart au sprint. */
export const PURSUIT_ODDS = {
  stepSeconds: 20,
  incrementPerStep: 5,
  cap: 50,
} as const;

/** §5 — relais : barème réduit, seules les 5 premières nations marquent. */
export const RELAY_RANK_MULTIPLIERS: Record<number, number> = {
  1: 10,
  2: 6,
  3: 4,
  4: 2,
  5: 1,
};

/** §6 — pronostics de saison (globes). */
export const GROS_GLOBE_MULTIPLIERS: Record<number, number> = {
  1: 10,
  2: 5,
  3: 3,
  4: 2,
  5: 1,
};

export const PETIT_GLOBE_MULTIPLIERS: Record<number, number> = {
  1: 5,
  2: 2,
  3: 1,
};

/** §9 — courses spéciales. */
export const TOUR_DE_PENA_MALUS_PER_LAP = -20;
/**
 * Tour de péna : un biathlète non pronostiqué compte 5 tours d'office (-100 pts). Un joueur absent
 * (aucun prono) prend donc -300 (Guillaume, 04/11/2026).
 */
export const TOUR_DE_PENA_EMPTY_PICK_LAPS = 5;

export const TES_COLLE_MALUS = {
  oneOutOfTop10: -30,
  twoOutOfTop10: -100,
  threeOutOfTop10: -300,
  noBetOrIncomplete: -200,
} as const;

/** §11 — bonus Aspiration, calculé sur la performance collective réelle. */
export const ASPIRATION_BONUS_BY_COUNT: Record<number, number> = {
  2: 20,
  3: 50,
  4: 100, // et au-delà
};

/** §12 — série de courses consécutives où au moins un choix marque des points. */
/** VéloPronos : série de 5 étapes d'affilée avec des points, dans une course par étapes. */
export const STREAK_TARGET = 5;

/**
 * §15 — cartes Fusée et Gâchette (cartes bonus depuis le 04/11/2026, plus de bonus automatique).
 * Fusée : selon le rang au temps de ski (1er, 2e, 3e meilleur temps). Gâchette : 10/10 au sprint,
 * 20/20 en poursuite, individuel et mass start. Points fixes, jamais multipliés.
 */
export const FUSEE_CARD_BONUS_BY_SKI_RANK: Record<number, number> = { 1: 100, 2: 50, 3: 20 };
export const GACHETTE_CARD_BONUS = { sprint: 50, other: 100 } as const;

/** §14 — cote minimale pour être éligible comme Pépite. */
export const PEPITE_MIN_ODDS = 30;

/** VéloPronos : bonus quand le super combatif pronostiqué est le combatif du jour (base44). */
export const COMBATIF_DU_JOUR_BONUS = 50;
