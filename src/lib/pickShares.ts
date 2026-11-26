import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * % de joueurs ayant choisi chaque coureur (ou équipe, ou nation) sur une course (repris de
 * Biathlonpronos, 26/11/2026). VéloPronos : une « course » de la table `races` est une étape, et
 * l'on pronostique étape par étape, donc le compte et le seuil s'entendent par étape.
 */

/** Avant le départ, la barre n'apparaît qu'à partir de ce nombre de pronostics sur la course. */
export const PICK_SHARE_MIN_PREDICTIONS = 20;

export interface PickShares {
  /** Pronostics de la course qui contiennent au moins un choix. */
  total: number;
  /** % (0-100, arrondi) de ces pronostics qui contiennent chaque choix. */
  percents: Record<string, number>;
}

type PredictionPicks = { athlete_ids?: string[] | null; team_ids?: string[] | null; nation_code?: string | null };

/** Compte les choix des pronostics ; un joueur compte une fois par coureur, quel que soit son rang. */
export function computePickShares(predictions: PredictionPicks[]): PickShares {
  const counts = new Map<string, number>();
  let total = 0;
  for (const p of predictions) {
    const keys = new Set<string>([...(p.athlete_ids ?? []), ...(p.team_ids ?? []), ...(p.nation_code ? [p.nation_code] : [])]);
    if (keys.size === 0) continue;
    total++;
    for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const percents: Record<string, number> = {};
  for (const [key, count] of counts) percents[key] = Math.round((count / total) * 100);
  return { total, percents };
}

/**
 * Avant le départ : seulement à partir de 20 pronostics, pour ne dévoiler le choix de personne.
 * Après le départ (course en cours ou terminée) : toujours, dès qu'il y a un pronostic.
 */
export function shouldShowPickShares(total: number, displayStatus: "upcoming" | "ongoing" | "finished"): boolean {
  if (total === 0) return false;
  return displayStatus !== "upcoming" || total >= PICK_SHARE_MIN_PREDICTIONS;
}

/**
 * Lit tous les pronostics de la course. À appeler avec le client admin : la sécurité de la base ne
 * laisse pas un joueur lire les pronostics des autres avant le départ. Seuls les % en sortent.
 */
export async function getPickShares(admin: SupabaseClient, raceId: string): Promise<PickShares> {
  const pageSize = 1000;
  const rows: PredictionPicks[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin
      .from("predictions")
      .select("athlete_ids, team_ids, nation_code")
      .eq("race_id", raceId)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as PredictionPicks[]));
    if (!data || data.length < pageSize) break;
  }
  return computePickShares(rows);
}
