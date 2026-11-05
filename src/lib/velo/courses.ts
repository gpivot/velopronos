// VéloPronos — vocabulaire vélo du schéma (migrations 0044-0045).
// Tables héritées de Biathlonpronos : stages = courses, races = étapes, athletes = coureurs.

import { normalizeLabel } from "../admin/csv";

export type CourseKind = "one_day" | "stage_race" | "grand_tour" | "bonus_event";
export type CourseCategory =
  | "grand_tour"
  | "stage_race"
  | "monument"
  | "world_tour"
  | "world_champs"
  | "national_championships";
export type StageType = "sprint" | "montagne" | "clm" | "baroudeurs" | "clm_equipes";
export type JerseyType = "general" | "points" | "montagne" | "jeune" | "combatif" | "equipe";

export const COURSE_KINDS: CourseKind[] = ["one_day", "stage_race", "grand_tour", "bonus_event"];
export const COURSE_CATEGORIES: CourseCategory[] = [
  "grand_tour",
  "stage_race",
  "monument",
  "world_tour",
  "world_champs",
  "national_championships",
];

export const JERSEY_TYPES: JerseyType[] = ["general", "points", "montagne", "jeune", "combatif", "equipe"];

export const COURSE_KIND_LABELS: Record<CourseKind, string> = {
  one_day: "Classique",
  stage_race: "Course par étapes",
  grand_tour: "Grand Tour",
  bonus_event: "Événement bonus",
};

export const COURSE_CATEGORY_LABELS: Record<CourseCategory, string> = {
  grand_tour: "Grand Tour",
  stage_race: "Course par étapes",
  monument: "Monument",
  world_tour: "World Tour",
  world_champs: "Mondiaux",
  national_championships: "Championnats nationaux",
};

export const STAGE_TYPE_LABELS: Record<StageType, string> = {
  sprint: "Sprint",
  montagne: "Montagne",
  clm: "Contre-la-montre",
  baroudeurs: "Baroudeurs",
  clm_equipes: "CLM par équipes",
};

/** Libellé d'un fichier (VéloPronos ou ancienne app base44) → type d'étape. */
const STAGE_TYPE_ALIASES: Record<string, StageType> = {
  sprint: "sprint",
  montagne: "montagne",
  mountain: "montagne",
  clm: "clm",
  "contre-la-montre": "clm",
  time_trial: "clm",
  baroudeurs: "baroudeurs",
  baroudeur: "baroudeurs",
  accidentee: "baroudeurs",
  breakaway: "baroudeurs",
  clme: "clm_equipes",
  "clm par equipes": "clm_equipes",
  team_time_trial: "clm_equipes",
};

export function parseStageType(label: string | undefined): StageType | null {
  return STAGE_TYPE_ALIASES[normalizeLabel(label ?? "")] ?? null;
}

export const JERSEY_LABELS: Record<JerseyType, string> = {
  general: "Classement général",
  points: "Maillot vert (points)",
  montagne: "Maillot à pois (montagne)",
  jeune: "Meilleur jeune",
  combatif: "Super combatif",
  equipe: "Meilleure équipe",
};

/** Cote utilisée pour chaque pronostic maillot (valeurs d'odds_format, migration 0044). */
export const JERSEY_ODDS_FORMAT: Record<JerseyType, string> = {
  general: "maillot_general",
  points: "maillot_points",
  montagne: "maillot_montagne",
  jeune: "maillot_jeune",
  combatif: "super_combatif",
  equipe: "meilleure_equipe",
};

/**
 * Maillots pronostiqués par défaut selon le type de course (à confirmer par Guillaume) :
 * Grands Tours = tous ; autres courses par étapes = général, points, montagne, jeune ;
 * classiques = aucun. Modifiable course par course.
 */
export function defaultJerseys(kind: CourseKind): JerseyType[] {
  if (kind === "grand_tour") return ["general", "points", "montagne", "jeune", "combatif", "equipe"];
  if (kind === "stage_race") return ["general", "points", "montagne", "jeune"];
  return [];
}

/** Couleur du maillot de leader, connue pour les 3 Grands Tours ; ailleurs jaune (à confirmer). */
export function defaultJerseyColor(name: string, kind: CourseKind): string | null {
  const n = normalizeLabel(name);
  if (n.includes("giro") || n.includes("tour d'italie")) return "#F49AC1"; // rose
  if (n.includes("vuelta") || n.includes("tour d'espagne")) return "#D62828"; // rouge
  if (kind === "grand_tour" || kind === "stage_race") return "#FFD200"; // jaune
  return null;
}

const MONUMENT_NAMES = ["milan-san remo", "milan-sanremo", "tour des flandres", "paris-roubaix", "liege-bastogne-liege", "tour de lombardie", "il lombardia"];

/** Les 5 monuments et les Mondiaux comptent ×2 d'office (décision du 01/11/2026). */
export function courseCoefficient(name: string, category: CourseCategory | null): 1 | 2 {
  if (category === "monument" || category === "world_champs") return 2;
  const n = normalizeLabel(name);
  return MONUMENT_NAMES.some((m) => n.includes(m)) ? 2 : 1;
}

/** Date « 2027-03-06 », « 06/03/2027 » ou « 6/3/27 » → « 2027-03-06 ». */
export function parseDate(value: string | undefined): string | null {
  const v = (value ?? "").trim();
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = v.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})$/);
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

/** Heure « 13:05 », « 13h05 », « 13h » ou ISO complet → « 13:05 ». */
export function parseTime(value: string | undefined): string | null {
  const v = (value ?? "").trim();
  const iso = v.match(/T(\d{2}):(\d{2})/);
  if (iso) return `${iso[1]}:${iso[2]}`;
  const m = v.match(/^(\d{1,2})\s*[:hH]\s*(\d{2})?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Ajoute des jours à une date « AAAA-MM-JJ ». */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Heure de Paris (heure d'été comprise) → instant UTC ISO. */
export function parisTimeToUtcIso(date: string, time: string): string {
  const asUtc = Date.parse(`${date}T${time}:00Z`);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(asUtc));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const parisWall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  const offset = parisWall - asUtc; // +1 h ou +2 h
  return new Date(asUtc - offset).toISOString();
}

/** « oui », « true », « 1 », « x » → true ; « non », « false », « 0 » → false ; vide → défaut. */
export function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  const v = normalizeLabel(value ?? "");
  if (["oui", "true", "vrai", "1", "x", "yes"].includes(v)) return true;
  if (["non", "false", "faux", "0", "no"].includes(v)) return false;
  return fallback;
}
