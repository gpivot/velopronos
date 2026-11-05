/**
 * VéloPronos : joker retardataire (règle base44 « LateJoker », migration 0050). Un par joueur et
 * par course : pronostic d'une étape oubliée jusqu'à 1 h après son départ, points divisés par 2.
 */

export const LATE_JOKER_WINDOW_MS = 60 * 60 * 1000;

/** Fenêtre du joker : départ passé, moins d'une heure, résultats pas encore saisis. */
export function isLateJokerWindowOpen(locksAt: string, status: string, now: Date): boolean {
  const lock = Date.parse(locksAt);
  return status !== "finished" && lock <= now.getTime() && now.getTime() < lock + LATE_JOKER_WINDOW_MS;
}

/** Points d'un pronostic joker : moitié, arrondie à l'entier inférieur (comme base44). */
export function applyLateJoker(points: number, lateJoker: boolean): number {
  return lateJoker ? Math.floor(points / 2) : points;
}
