// Types de domaine — miroir TypeScript du schéma SQL
// (supabase/migrations/0001_init.sql). À terme, remplacer par les types
// générés automatiquement via `supabase gen types typescript`.

export type Sex = "H" | "F";

export type SeasonStatus = "preparation" | "active" | "archived";

export interface Season {
  id: string;
  label: string; // "2026-27"
  starts_on: string;
  ends_on: string;
  status: SeasonStatus;
}

export interface Nation {
  code: string; // "FRA"
  name: string;
}

export interface Athlete {
  id: string;
  season_id: string;
  first_name: string;
  last_name: string;
  nation_code: string;
  sex: Sex;
}

export type OddsFormat =
  | "sprint"
  | "poursuite"
  | "individuel"
  | "mass_start"
  | "gros_globe"
  | "meilleur_jeune"
  | "meilleure_nation";

export interface Odds {
  id: string;
  season_id: string;
  format: OddsFormat;
  athlete_id: string | null;
  nation_code: string | null;
  nation_sex: Sex | null;
  value: number;
  valid_from: string;
  valid_until: string | null;
}

export interface Stage {
  id: string;
  season_id: string;
  location: string;
  country_code: string;
  starts_on: string;
  ends_on: string;
  coefficient: 1 | 2;
  /** false : étape « Autre (×0) », hors classement de la saison (migration 0041). */
  counts_in_standings: boolean;
}

export type RaceFormat =
  | "sprint"
  | "poursuite"
  | "individuel"
  | "mass_start"
  | "relais_h"
  | "relais_f"
  | "relais_mixte"
  | "relais_mixte_simple";

export type SpecialRule = "tour_de_pena" | "brouillard" | "tes_colle" | null;

export type RaceStatus = "upcoming" | "locked" | "finished";

export interface Race {
  id: string;
  stage_id: string;
  sex: Sex | null;
  format: RaceFormat;
  locks_at: string;
  special_rule: SpecialRule;
  status: RaceStatus;
}

export interface RaceResult {
  id: string;
  race_id: string;
  athlete_id: string | null;
  nation_code: string | null;
  rank: number;
  time_gap_seconds: number | null;
  penalty_laps: number;
  /** Fautes au tir, une valeur par tir (null avant la migration 0024). */
  shootings: number[] | null;
  is_fusee: boolean;
  is_gachette: boolean;
}

export interface Profile {
  id: string;
  pseudo: string;
}

// "chat_noir" reste une valeur de l'enum en base (0001) mais la carte est retirée du jeu (01/11/2026).
export type BonusCardType = "balle_de_pioche" | "ca_farte" | "fondue" | "aspiration" | "equipe";

export interface Prediction {
  id: string;
  user_id: string;
  race_id: string;
  athlete_ids: string[] | null; // 3 pour une course individuelle
  nation_code: string | null; // pour un relais
  bonus_x2_used: boolean;
  bonus_card_used: BonusCardType | null;
  submitted_at: string;
}

export type SeasonPredictionCategory =
  | "gros_globe_h"
  | "gros_globe_f"
  | "meilleur_jeune_h"
  | "meilleur_jeune_f"
  | "meilleure_nation_h"
  | "meilleure_nation_f";

export interface League {
  id: string;
  season_id: string;
  name: string;
  owner_id: string;
  invite_code: string;
}

export interface ScoreLedgerEntry {
  id: string;
  user_id: string;
  season_id: string;
  race_id: string | null;
  season_prediction_category: SeasonPredictionCategory | null;
  points: number;
  breakdown: Record<string, unknown>;
}
