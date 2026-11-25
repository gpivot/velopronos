/**
 * Statistiques de rétention de l'admin « Joueurs & rôles » (Guillaume, 24/11/2026) :
 * nombre de pronostiqueurs par course au fil de la saison, et connexions récentes.
 * Les invités anonymes (bouton « Jouer » sans compte) sont exclus partout, comme dans le compteur
 * de joueurs inscrits.
 */

export interface RetentionRace {
  id: string;
  label: string;
  stageId: string;
  stageLocation: string;
  locksAt: string;
  offStandings: boolean;
}

export interface RetentionPoint extends RetentionRace {
  players: number;
}

export interface RetentionSummary {
  points: RetentionPoint[];
  /** Joueurs distincts ayant pronostiqué au moins une course de la liste. */
  distinctPlayers: number;
  /** Plus haut nombre de pronostiqueurs sur une course. */
  peak: number;
}

export function buildRetention(
  races: RetentionRace[],
  predictions: { user_id: string; race_id: string }[],
  excludedUserIds: Set<string>
): RetentionSummary {
  const byRace = new Map<string, Set<string>>();
  const distinct = new Set<string>();
  for (const p of predictions) {
    if (excludedUserIds.has(p.user_id)) continue;
    let set = byRace.get(p.race_id);
    if (!set) byRace.set(p.race_id, (set = new Set()));
    set.add(p.user_id);
    distinct.add(p.user_id);
  }
  const points = [...races]
    .sort((a, b) => a.locksAt.localeCompare(b.locksAt))
    .map((race) => ({ ...race, players: byRace.get(race.id)?.size ?? 0 }));
  return {
    points,
    distinctPlayers: distinct.size,
    peak: points.reduce((max, p) => Math.max(max, p.players), 0),
  };
}

/** Joueurs (hors invités) dont la dernière connexion date de moins de `days` jours. */
export function countRecentSignIns(
  users: { last_sign_in_at?: string | null; is_anonymous?: boolean }[],
  now: Date,
  days: number
): number {
  const since = now.getTime() - days * 24 * 3600 * 1000;
  return users.filter((u) => !u.is_anonymous && u.last_sign_in_at && new Date(u.last_sign_in_at).getTime() >= since).length;
}
