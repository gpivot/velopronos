// VéloPronos — présentation d'une course dans Ma saison et sur l'accueil (demande de Guillaume du
// 05/11/2026) : courses par étapes plus hautes, Grands Tours marqués d'un liseré drapeau, courses
// d'un jour avec une seule date, Monuments, Mondiaux en doré, Week-end des Champions sans drapeau.

export type CourseLook = "grand_tour" | "stage_race" | "worlds" | "monument" | "bonus" | "one_day";

/** Filtres proposés en haut de Ma saison. */
export type CourseFilter = "all" | "grand_tour" | "stage_race" | "one_day" | "monument" | "championships" | "other";
export const COURSE_FILTERS: CourseFilter[] = ["all", "grand_tour", "stage_race", "one_day", "monument", "championships", "other"];

export interface CourseLookInput {
  kind?: string | null;
  category?: string | null;
  coefficient?: number | null;
}

export function courseLook({ kind, category, coefficient }: CourseLookInput): CourseLook {
  if (kind === "grand_tour" || category === "grand_tour") return "grand_tour";
  if (kind === "bonus_event" || category === "national_championships") return "bonus";
  if (category === "world_champs") return "worlds";
  if (kind === "stage_race" || category === "stage_race") return "stage_race";
  // Course ×2 sans catégorie : monument reconnu par son nom à l'import (Paris-Roubaix…).
  if (category === "monument" || coefficient === 2) return "monument";
  return "one_day";
}

/** Course à plusieurs étapes (encadré plus haut, nombre d'étapes, prochaine étape). */
export function isMultiStage(look: CourseLook): boolean {
  return look === "grand_tour" || look === "stage_race";
}

/**
 * Filtre « Autre » : les courses hors classement, qui sortent des autres filtres (demande de
 * Guillaume du 05/11/2026).
 */
export function matchesCourseFilter(look: CourseLook, filter: CourseFilter, countsInStandings = true): boolean {
  if (filter === "all") return true;
  if (filter === "other") return !countsInStandings;
  if (!countsInStandings) return false;
  switch (filter) {
    case "grand_tour":
      return look === "grand_tour";
    case "stage_race":
      return look === "stage_race";
    // Courses d'un jour : classiques, Monuments et Mondiaux.
    case "one_day":
      return look === "one_day" || look === "monument" || look === "worlds";
    case "monument":
      return look === "monument";
    case "championships":
      return look === "worlds" || look === "bonus";
  }
}

/**
 * Couleurs du liseré drapeau d'un Grand Tour, de la bande extérieure vers l'intérieure.
 * Pays sans entrée : liseré à la couleur du maillot de leader.
 */
export const FLAG_STRIPES: Record<string, string[]> = {
  FRA: ["#0055A4", "#FFFFFF", "#EF4135"],
  ITA: ["#009246", "#FFFFFF", "#CE2B37"],
  ESP: ["#AA151B", "#F1BF00", "#F1BF00", "#AA151B"],
};
