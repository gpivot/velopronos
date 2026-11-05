export type Sex = "H" | "F";

/**
 * Règle de course désignée par l'admin : trois malus, et « fete_nationale » (bonus, 01/11/2026) qui
 * double les points des biathlètes de l'équipe favorite du joueur classés dans le Top 10.
 */
export type SpecialRule = "tour_de_pena" | "brouillard" | "tes_colle" | "fete_nationale" | null;

/** Résultat d'un athlète sur une course individuelle (table race_results). */
export interface AthleteRaceResult {
  athleteId: string;
  rank: number;
  penaltyLaps?: number;
  /** Rang au temps de ski (1 = meilleur temps), pour la carte Fusée. */
  skiRank?: number | null;
  /** Ancienne case « Fusée » (meilleur temps de ski) : vaut skiRank 1 si skiRank n'est pas saisi. */
  isFusee?: boolean;
  /** Sans-faute au tir (10/10 au sprint, 20/20 sinon), pour la carte Gâchette. */
  isGachette?: boolean;
}

export type BonusCardEffect =
  | { type: "none" }
  // 4 choix pronostiqués, seuls les 3 meilleurs comptent ; Ça farte peut s'y ajouter (×3 sur un des 4)
  | { type: "balle_de_pioche"; caFarteTargetAthleteId?: string }
  | { type: "ca_farte"; targetAthleteId: string } // ×3 sur un athlète choisi
  | { type: "aspiration" }; // chaque athlète pronostiqué compte une place plus haut
// "chat_noir" a été retiré du jeu le 01/11/2026 (carte réservée à VéloPronos).

export interface FavoriteTeam {
  nationCode: string;
  sex: Sex;
}

export interface IndividualRaceScoringInput {
  /** 3 athlètes pronostiqués, ou 4 si carte "balle_de_pioche" active. */
  predictedAthleteIds: string[];
  /** Tous les résultats connus de la course (Top 10 au minimum ; le classement complet pour "brouillard"/"tes_colle"). */
  results: AthleteRaceResult[];
  /** Cote effective par athlète pour cette course (cote poursuite déjà recalculée en amont). */
  oddsByAthleteId: Record<string, number>;
  /** Nation/sexe de chaque athlète pronostiqué, nécessaire au bonus Team Nation. */
  athleteTeamByAthleteId: Record<string, { nationCode: string; sex: Sex }>;
  specialRule: SpecialRule;
  /** 2 si Mondiaux/JO, sinon 1. */
  stageCoefficient: 1 | 2;
  /** Bonus ×2 personnel de saison activé sur cette course (ignoré si stageCoefficient === 2, non cumulables). */
  bonusX2Active: boolean;
  card: BonusCardEffect;
  favoriteTeam: FavoriteTeam | null;
  /** Code nation du pays hôte de l'étape — nécessaire au bonus Team Nation. */
  raceCountryCode: string;
  /**
   * Fête nationale (specialRule "fete_nationale") : équipe favorite du joueur (nation + sexe). Ses
   * biathlètes pronostiqués classés dans le Top 10 voient leurs points doublés, sans cumul avec
   * un autre ×2 (bonus perso, Mondiaux/JO) ni avec Ça farte (×3 seul).
   */
  nationalDayTeam?: FavoriteTeam | null;
  /** Format de la course (Gâchette : 50 pts au sprint, 100 sinon). */
  raceFormat?: string;
  /**
   * Cartes Fusée / Gâchette posées par le joueur sur l'étape de cette course (04/11/2026). Points
   * fixes par biathlète compté, ajoutés au total sans aucun multiplicateur.
   */
  stageCards?: { fusee: boolean; gachette: boolean };
  /**
   * VéloPronos (règle base44) : le ×2 (bonus perso ou course ×2) s'applique aussi aux bonus Musette
   * et Prono parfait et au bonus du combatif du jour, pas seulement aux coureurs.
   */
  veloRules?: boolean;
  /** VéloPronos : +50 si le super combatif pronostiqué par le joueur est le combatif du jour. */
  combatifBonus?: number;
}

export interface IndividualRaceScoringResult {
  total: number;
  /** Contribution finale par athlète pronostiqué (après cartes, coefficient, Team Nation). */
  perAthlete: Record<string, number>;
  breakdown: {
    /** Points de base par athlète (barème cote × rang, avant cartes/coefficient/Team Nation). */
    base: Record<string, number>;
    combinationBonus: number;
    pronoParfaitBonus: number;
    /** VéloPronos : bonus du combatif du jour (×2 compris). */
    combatifBonus?: number;
    specialMalus: number;
    /** Tour de péna : biathlètes non pronostiqués (5 tours d'office chacun), déjà compris dans specialMalus. */
    missingPicks?: number;
    /** Cartes Fusée + Gâchette (total des deux). */
    fuseeGachetteBonus: number;
    /** Carte Fusée : points par biathlète compté (100/50/20 selon le temps de ski). */
    fuseeCardBonus?: number;
    fuseeByAthlete?: Record<string, number>;
    /** Carte Gâchette : points par biathlète compté (50 au sprint, 100 sinon). */
    gachetteCardBonus?: number;
    gachetteByAthlete?: Record<string, number>;
    /** Athlètes exclus du score car carte "balle de pioche" retient les 3 meilleurs sur 4. */
    droppedByBalleDePioche: string[];
    /** Athlète(s) dont les points ont été doublés par le bonus Team Nation. */
    teamNationBoostedAthleteIds: string[];
    /** Athlète(s) dont les points ont été doublés par la Fête nationale. */
    nationalDayBoostedAthleteIds: string[];
  };
}
