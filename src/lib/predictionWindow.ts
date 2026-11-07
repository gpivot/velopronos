import { addDays } from "./weekStage";
import { parisTimeToUtcIso } from "./velo/courses";

/**
 * VéloPronos (07/11/2026) : les pronostics d'une course (liste des coureurs et cotes) ouvrent le
 * lundi à 17 h (heure de Paris) de la semaine de la course ; une course qui part un lundi ouvre le
 * lundi précédent. La startlist provisoire est récupérée à ce moment-là.
 */
export const PREDICTION_OPENING_TIME = "17:00";

/** Jour (Paris, "2027-01-04") où les pronostics de la course ouvrent : le lundi de sa semaine. */
export function predictionOpensOn(stageStartsOn: string): string {
  const day = stageStartsOn.slice(0, 10);
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay(); // 0 = dimanche, 1 = lundi
  const daysSinceMonday = weekday === 1 ? 7 : (weekday + 6) % 7;
  return addDays(day, -daysSinceMonday);
}

/** Instant exact de l'ouverture : le lundi de la semaine de course à 17 h, heure de Paris. */
export function predictionOpensAt(stageStartsOn: string): Date {
  return new Date(parisTimeToUtcIso(predictionOpensOn(stageStartsOn), PREDICTION_OPENING_TIME));
}

/** Les pronostics de la course sont-ils ouverts à cet instant ? */
export function isPredictionOpen(stageStartsOn: string, now: Date): boolean {
  return now.getTime() >= predictionOpensAt(stageStartsOn).getTime();
}
