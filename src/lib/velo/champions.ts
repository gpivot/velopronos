// VéloPronos — WE des Champions (migration 0056, demande de Guillaume du 05/11/2026).
// Module bonus autonome : 1 coureur par championnat national, aucune cote, seul le vainqueur
// compte, et le score dépend du nombre total de champions trouvés (barème par palier).

/** Barème par défaut : index = nombre de champions trouvés. */
export const DEFAULT_CHAMPIONS_SCALE = [0, 50, 120, 220, 350, 500, 700, 950, 1250, 1600, 2000];

/** Points d'un palier : le palier atteint, pas 50 × bonnes réponses. Au-delà du barème : dernier palier. */
export function championsScore(correct: number, scale: number[] = DEFAULT_CHAMPIONS_SCALE): number {
  if (!scale.length || correct <= 0) return scale[0] ?? 0;
  return scale[Math.min(correct, scale.length - 1)];
}

/** Barème saisi dans l'admin (« 0, 50, 120… ») : nombres entiers positifs, 0 en tête. */
export function parseChampionsScale(text: string): number[] | null {
  const values = text
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map((v) => Number(v));
  if (values.length < 2 || values.some((v) => !Number.isInteger(v) || v < 0)) return null;
  return values;
}

export type ChampionshipStatus = "open" | "locked" | "completed";

export interface ChampionshipLike {
  id: string;
  locks_at: string;
  winner_athlete_id: string | null;
}

export function championshipStatus(c: ChampionshipLike, now: Date, closed = false): ChampionshipStatus {
  if (c.winner_athlete_id) return "completed";
  if (closed || new Date(c.locks_at) <= now) return "locked";
  return "open";
}

export interface ChampionsSummary {
  total: number;
  /** Championnats dont le vainqueur est connu. */
  known: number;
  correct: number;
  score: number;
  /** Tant que tous les vainqueurs ne sont pas connus (ou que l'événement n'est pas clôturé). */
  provisional: boolean;
}

/** Score (provisoire ou final) d'un joueur à partir de ses pronostics (championnat → coureur). */
export function summarizeChampions(
  championships: ChampionshipLike[],
  picks: Map<string, string>,
  scale: number[],
  closed: boolean
): ChampionsSummary {
  const known = championships.filter((c) => c.winner_athlete_id);
  const correct = known.filter((c) => picks.get(c.id) === c.winner_athlete_id).length;
  return {
    total: championships.length,
    known: known.length,
    correct,
    score: championsScore(correct, scale),
    provisional: !closed,
  };
}

export interface ChampionsRankingRow {
  userId: string;
  correct: number;
  score: number;
  rank: number;
}

/** Classement du WE : score puis nombre de champions trouvés, ex æquo sans départage. */
export function rankChampions(
  championships: ChampionshipLike[],
  picksByUser: Map<string, Map<string, string>>,
  scale: number[]
): ChampionsRankingRow[] {
  const rows = [...picksByUser.entries()].map(([userId, picks]) => {
    const { correct, score } = summarizeChampions(championships, picks, scale, false);
    return { userId, correct, score, rank: 0 };
  });
  rows.sort((a, b) => b.score - a.score || b.correct - a.correct);
  rows.forEach((row, i) => {
    const prev = rows[i - 1];
    row.rank = prev && prev.score === row.score && prev.correct === row.correct ? prev.rank : i + 1;
  });
  return rows;
}
