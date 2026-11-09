import { STAGE_TYPE_LABELS } from "@/lib/velo/courses";
import { fromParisWallTime, toParisWallTime } from "@/lib/displayTimeZone";

/** VéloPronos : types d'étape (valeurs de races.format, migration 0044). */
export const RACE_FORMATS = Object.entries(STAGE_TYPE_LABELS).map(([value, label]) => ({ value, label }));

/** Règles spéciales vélo (valeurs héritées de l'enum special_rule : mêmes mécaniques). */
export const SPECIAL_RULES = [
  { value: "", label: "Aucune" },
  { value: "brouillard", label: "Crevaison (malus)" },
  { value: "tes_colle", label: "Crise de foie (malus)" },
  { value: "fete_nationale", label: "Fête nationale (bonus)" },
];

/** Formats autorisés par règle spéciale : pas sur un CLM par équipes (on y pronostique des équipes). */
const INDIVIDUAL_STAGE_TYPES = ["sprint", "montagne", "clm", "baroudeurs", "classique"];
export const SPECIAL_RULE_FORMATS: Record<string, string[]> = {
  brouillard: INDIVIDUAL_STAGE_TYPES,
  tes_colle: INDIVIDUAL_STAGE_TYPES,
  fete_nationale: INDIVIDUAL_STAGE_TYPES,
};

export function isSpecialRuleAllowed(format: string, specialRule: string): boolean {
  const allowed = SPECIAL_RULE_FORMATS[specialRule];
  return !allowed || allowed.includes(format);
}

export const RELAY_FORMATS = ["relais_h", "relais_f", "relais_mixte", "relais_mixte_simple"];

/** « Étape 3 · Montagne », « Prologue · Contre-la-montre », ou le seul type d'étape. */
export function raceLabel(race: { format: string; sex?: string | null; stage_number?: number | null }): string {
  const type = RACE_FORMATS.find((f) => f.value === race.format)?.label ?? race.format;
  if (race.stage_number == null) return type;
  return `${race.stage_number === 0 ? "Prologue" : `Étape ${race.stage_number}`} · ${type}`;
}

/** Heure de départ en heure de Paris, comme saisie et importée. */
export function formatLockTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateRange(startsOn: string, endsOn: string): string {
  const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
  return startsOn === endsOn ? fmt(startsOn) : `${fmt(startsOn)} → ${fmt(endsOn)}`;
}

/** Statut affiché dans l'admin (même règle que le Calendrier joueur, cf. getRaceDisplayStatus). */
export const RACE_STATUS_LABELS: Record<string, string> = {
  upcoming: "à venir",
  ongoing: "résultats à saisir",
  finished: "résultats saisis",
};

export const RACE_STATUS_STYLES: Record<string, string> = {
  upcoming: "border border-border text-text-dim",
  ongoing: "bg-gold-soft text-gold",
  finished: "bg-ice-soft text-ice",
};

/** Valeur d'un input datetime-local (heure de Paris) à partir d'une date ISO. */
export function toDateTimeLocalParis(iso: string): string {
  return toParisWallTime(new Date(iso));
}

/** Instant ISO d'un input datetime-local saisi en heure de Paris. */
export function fromDateTimeLocalParis(value: string): string {
  return fromParisWallTime(value).toISOString();
}

/** Champs vélo d'une étape saisis dans un formulaire admin (numéro, villes, distance, dénivelé). */
export function stageFormFields(formData: FormData) {
  const text = (name: string) => String(formData.get(name) ?? "").trim() || null;
  const num = (name: string) => {
    const v = String(formData.get(name) ?? "").trim().replace(",", ".");
    return v === "" || !Number.isFinite(Number(v)) ? null : Number(v);
  };
  const elevation = num("elevation_m");
  return {
    stage_number: num("stage_number"),
    start_city: text("start_city"),
    end_city: text("end_city"),
    distance_km: num("distance_km"),
    elevation_m: elevation == null ? null : Math.round(elevation),
  };
}
