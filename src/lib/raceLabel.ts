/**
 * VéloPronos : toutes les étapes sont masculines, le sexe n'est donc jamais affiché (hérité de
 * Biathlonpronos, où « Sprint Femmes » et « Sprint Hommes » coexistaient).
 */
export function displayedSex(_race: { format: string; sex: string | null }): string | null {
  return null;
}

type Translate = (key: string, values?: Record<string, string | number>) => string;

/**
 * Nom d'une étape côté joueur : « Étape 3 · Sprint », « Prologue · Contre-la-montre », ou le seul
 * type d'étape pour une classique (étape unique, sans numéro). `tFormat` : espace RaceFormat,
 * `tRace` : espace Race.
 */
export function raceTitle(
  race: { format: string; stage_number?: number | null; stageNumber?: number | null },
  tFormat: Translate,
  tRace: Translate
): string {
  const type = tFormat(race.format);
  const n = race.stage_number ?? race.stageNumber ?? null;
  if (n == null) return type;
  return tRace("stageTitle", { stage: n === 0 ? tRace("prologue") : tRace("stageNumber", { number: n }), type });
}

/** « Barcelone → Barcelone · 182 km » (vide si l'étape n'a ni villes ni distance). */
export function stageRoute(race: {
  start_city?: string | null;
  end_city?: string | null;
  distance_km?: number | null;
  startCity?: string | null;
  endCity?: string | null;
  distanceKm?: number | null;
}): string {
  const start = race.start_city ?? race.startCity ?? "";
  const end = race.end_city ?? race.endCity ?? "";
  const km = race.distance_km ?? race.distanceKm ?? null;
  const cities = start && end && start !== end ? `${start} → ${end}` : start || end;
  return [cities, km ? `${Math.round(Number(km) * 10) / 10} km` : ""].filter(Boolean).join(" · ");
}
