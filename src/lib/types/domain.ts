// Types de domaine — miroir TypeScript du schéma SQL
// (supabase/migrations/0001_init.sql). À terme, remplacer par les types
// générés automatiquement via `supabase gen types typescript`.

import type { CourseCategory, CourseKind, JerseyType } from "../velo/courses";

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
  /** VéloPronos (0045) */
  team_id?: string | null;
}

/** VéloPronos (0045) : équipe d'une saison. */
export interface Team {
  id: string;
  season_id: string;
  code: string;
  name: string;
  nation_code: string | null;
}

/** VéloPronos (0045) : engagé d'une course. */
export interface StageRider {
  stage_id: string;
  athlete_id: string;
  bib: number | null;
  abandoned_race_id: string | null;
}

/** VéloPronos (0045) : pronostic maillot d'une course. */
export interface CoursePrediction {
  id: string;
  user_id: string;
  stage_id: string;
  jersey: JerseyType;
  athlete_id: string | null;
  team_id: string | null;
  corrected_via_chat_noir: boolean;
}

export type OddsFormat =
  | "sprint"
  | "poursuite"
  | "individuel"
  | "mass_start"
  | "gros_globe"
  | "meilleur_jeune"
  | "meilleure_nation"
  // VéloPronos (0044) : types d'étape et maillots, cotes propres à une course
  | "montagne"
  | "clm"
  | "baroudeurs"
  | "clm_equipes"
  | "maillot_general"
  | "maillot_points"
  | "maillot_montagne"
  | "maillot_jeune"
  | "super_combatif"
  | "meilleure_equipe";

export interface Odds {
  id: string;
  season_id: string;
  format: OddsFormat;
  athlete_id: string | null;
  nation_code: string | null;
  nation_sex: Sex | null;
  /** VéloPronos (0045) : course de la cote (null = cote de saison) et équipe ciblée. */
  stage_id?: string | null;
  team_id?: string | null;
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
  // VéloPronos (0045) : une « stage » est une course (Tour de France, Strade Bianche…).
  name?: string | null;
  kind?: CourseKind;
  category?: CourseCategory | null;
  jersey_color?: string | null;
  jerseys?: JerseyType[];
  rest_days?: string[];
  is_visible?: boolean;
}

export type RaceFormat =
  | "sprint"
  | "poursuite"
  | "individuel"
  | "mass_start"
  | "relais_h"
  | "relais_f"
  | "relais_mixte"
  | "relais_mixte_simple"
  // VéloPronos (0044) : type d'étape ("sprint" est commun)
  | "montagne"
  | "clm"
  | "baroudeurs"
  | "clm_equipes";

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
  // VéloPronos (0045) : une « race » est une étape.
  stage_number?: number | null;
  start_city?: string | null;
  end_city?: string | null;
  distance_km?: number | null;
  elevation_m?: number | null;
  combatif_athlete_id?: string | null;
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
