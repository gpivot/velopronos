import { STREAK_TARGET } from "./constants";

export interface StreakUpdateResult {
  currentStreak: number;
  cardEarned: boolean;
}

/**
 * §12 — la série (VéloPronos : 5 étapes, STREAK_TARGET). La série continue tant qu'au moins un des choix du joueur
 * marque des points sur la course ; une course sans le moindre point la
 * remet à zéro. Au palier, une carte bonus est gagnée et le compteur repart de 0.
 */
export function updateStreak(currentStreak: number, raceTotalPoints: number): StreakUpdateResult {
  if (raceTotalPoints <= 0) {
    return { currentStreak: 0, cardEarned: false };
  }

  const next = currentStreak + 1;
  if (next >= STREAK_TARGET) {
    return { currentStreak: 0, cardEarned: true };
  }

  return { currentStreak: next, cardEarned: false };
}

export interface SeasonStreak {
  currentStreak: number;
  cardsEarned: number;
}

/**
 * Rejoue toute la saison : `raceIds` dans l'ordre chronologique, `pointsByRace` donne pour chaque
 * course les points de chaque joueur qui l'a pronostiquée (un joueur sans prono n'est pas compté,
 * comme lors de la notation). Sert à recalculer les séries après une correction de résultats.
 */
export function computeSeasonStreaks(
  raceIds: string[],
  pointsByRace: Map<string, Map<string, number>>
): Map<string, SeasonStreak> {
  const streaks = new Map<string, SeasonStreak>();
  for (const raceId of raceIds) {
    for (const [userId, points] of pointsByRace.get(raceId) ?? []) {
      const current = streaks.get(userId) ?? { currentStreak: 0, cardsEarned: 0 };
      const update = updateStreak(current.currentStreak, points);
      streaks.set(userId, {
        currentStreak: update.currentStreak,
        cardsEarned: current.cardsEarned + (update.cardEarned ? 1 : 0),
      });
    }
  }
  return streaks;
}

/**
 * VéloPronos : séries d'une course par étapes (règle base44). `raceIds` : étapes notées de la
 * course dans l'ordre. Un joueur qui a pronostiqué au moins une étape de la course et en oublie une
 * casse sa série (0 point) ; la série repart de zéro à chaque course.
 */
export function computeCourseStreaks(
  raceIds: string[],
  pointsByRace: Map<string, Map<string, number>>
): Map<string, SeasonStreak> {
  const players = new Set<string>();
  for (const raceId of raceIds) for (const userId of Array.from(pointsByRace.get(raceId)?.keys() ?? [])) players.add(userId);
  const streaks = new Map<string, SeasonStreak>();
  for (const userId of Array.from(players)) streaks.set(userId, { currentStreak: 0, cardsEarned: 0 });
  for (const raceId of raceIds) {
    const points = pointsByRace.get(raceId) ?? new Map<string, number>();
    for (const userId of Array.from(players)) {
      const current = streaks.get(userId)!;
      const update = updateStreak(current.currentStreak, points.get(userId) ?? 0);
      streaks.set(userId, { currentStreak: update.currentStreak, cardsEarned: current.cardsEarned + (update.cardEarned ? 1 : 0) });
    }
  }
  return streaks;
}
