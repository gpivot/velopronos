import { normalizeLabel } from "../admin/csv";

/**
 * Couleurs des maillots d'une course, au choix de l'admin (demande de Guillaume du 08/11/2026)
 * plutôt qu'une palette libre : leader jaune, rose ou rouge ; sprint vert ou cyclamen ; montagne
 * à pois rouges, à pois bleus ou bleu. Migration 0059 : stages.points_jersey_color et
 * stages.mountain_jersey_color (le leader garde stages.jersey_color, en hexadécimal).
 */

export const LEADER_COLORS = [
  { value: "#FFD200", label: "Jaune" },
  { value: "#F49AC1", label: "Rose" },
  { value: "#D62828", label: "Rouge" },
] as const;

export const POINTS_COLORS = [
  { value: "vert", label: "Vert", css: "#2E9E44" },
  { value: "cyclamen", label: "Cyclamen (violet)", css: "#B5338A" },
] as const;

export const MOUNTAIN_COLORS = [
  { value: "pois_rouges", label: "À pois rouges", css: "repeating-radial-gradient(circle at 30% 30%, #D62828 0 3px, #FFFFFF 3px 7px)" },
  { value: "pois_bleus", label: "À pois bleus", css: "repeating-radial-gradient(circle at 30% 30%, #1F5FBF 0 3px, #FFFFFF 3px 7px)" },
  { value: "bleu", label: "Bleu", css: "#1F5FBF" },
] as const;

export type PointsColor = (typeof POINTS_COLORS)[number]["value"];
export type MountainColor = (typeof MOUNTAIN_COLORS)[number]["value"];

/** Couleurs par défaut selon la course : Giro cyclamen et bleu, Vuelta vert et pois bleus, sinon vert et pois rouges. */
export function defaultSecondaryJerseys(name: string): { points: PointsColor; mountain: MountainColor } {
  const n = normalizeLabel(name);
  if (n.includes("giro") || n.includes("tour d'italie")) return { points: "cyclamen", mountain: "bleu" };
  if (n.includes("vuelta") || n.includes("tour d'espagne")) return { points: "vert", mountain: "pois_bleus" };
  return { points: "vert", mountain: "pois_rouges" };
}

export interface CourseJerseyColors {
  name?: string | null;
  jersey_color?: string | null;
  points_jersey_color?: string | null;
  mountain_jersey_color?: string | null;
}

/** Fond CSS de la pastille de chaque maillot d'une course. */
export function jerseySwatches(course: CourseJerseyColors): Record<string, string> {
  const defaults = defaultSecondaryJerseys(course.name ?? "");
  const points = POINTS_COLORS.find((c) => c.value === course.points_jersey_color) ?? POINTS_COLORS.find((c) => c.value === defaults.points)!;
  const mountain = MOUNTAIN_COLORS.find((c) => c.value === course.mountain_jersey_color) ?? MOUNTAIN_COLORS.find((c) => c.value === defaults.mountain)!;
  return {
    general: course.jersey_color ?? "#FFD200",
    points: points.css,
    montagne: mountain.css,
    jeune: "#FFFFFF",
    combatif: "#C8102E",
    equipe: "#FFD200",
  };
}
