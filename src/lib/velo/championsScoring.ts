// VéloPronos — WE des Champions : lecture de l'événement et clôture (migration 0056).
// Seul le score final entre dans le grand livre (score_ledger.bonus_kind = 'champions'), donc dans
// le classement Saison, où un événement bonus compte intégralement (retainedResults.ts).

import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_CHAMPIONS_SCALE, rankChampions, type ChampionsRankingRow } from "./champions";

export interface ChampionshipRow {
  id: string;
  nation_code: string;
  starts_at: string;
  locks_at: string;
  winner_athlete_id: string | null;
}

export async function loadChampionships(supabase: SupabaseClient, stageId: string): Promise<ChampionshipRow[]> {
  const { data, error } = await supabase
    .from("champion_championships")
    .select("id, nation_code, starts_at, locks_at, winner_athlete_id")
    .eq("stage_id", stageId)
    .order("starts_at", { ascending: true })
    .order("nation_code", { ascending: true });
  if (error) console.error("loadChampionships:", error.message);
  return (data ?? []) as ChampionshipRow[];
}

/** Tous les pronostics de l'événement, par joueur (clé de service : classement et clôture). */
export async function loadAllChampionPicks(admin: SupabaseClient, championshipIds: string[]): Promise<Map<string, Map<string, string>>> {
  const byUser = new Map<string, Map<string, string>>();
  if (!championshipIds.length) return byUser;
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from("champion_predictions")
      .select("user_id, championship_id, athlete_id")
      .in("championship_id", championshipIds)
      .order("user_id")
      .order("championship_id")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const p of data ?? []) {
      if (!byUser.has(p.user_id)) byUser.set(p.user_id, new Map());
      byUser.get(p.user_id)!.set(p.championship_id, p.athlete_id);
    }
    if (!data || data.length < 1000) break;
  }
  return byUser;
}

export function scaleOf(stage: { champions_scale?: number[] | null }): number[] {
  return stage.champions_scale?.length ? stage.champions_scale : DEFAULT_CHAMPIONS_SCALE;
}

export async function championsRanking(admin: SupabaseClient, stageId: string, scale: number[]): Promise<ChampionsRankingRow[]> {
  const championships = await loadChampionships(admin, stageId);
  const picks = await loadAllChampionPicks(admin, championships.map((c) => c.id));
  return rankChampions(championships, picks, scale);
}

export async function closeChampionsEvent(admin: SupabaseClient, stageId: string): Promise<number> {
  const { data: stage, error } = await admin.from("stages").select("id, season_id, champions_scale").eq("id", stageId).single();
  if (error || !stage) throw new Error(error?.message ?? "Événement introuvable.");
  const championships = await loadChampionships(admin, stageId);
  if (!championships.length) throw new Error("Aucun championnat dans cet événement.");
  const missing = championships.filter((c) => !c.winner_athlete_id).map((c) => c.nation_code);
  if (missing.length) throw new Error(`Champion à renseigner : ${missing.join(", ")}.`);

  const ranking = rankChampions(championships, await loadAllChampionPicks(admin, championships.map((c) => c.id)), scaleOf(stage));
  const { error: deleteError } = await admin.from("score_ledger").delete().eq("stage_id", stageId).eq("bonus_kind", "champions");
  if (deleteError) throw new Error(`${deleteError.message} (migration 0056 appliquée ?)`);
  if (ranking.length) {
    const { error: insertError } = await admin.from("score_ledger").insert(
      ranking.map((row) => ({
        user_id: row.userId,
        season_id: stage.season_id,
        stage_id: stageId,
        bonus_kind: "champions",
        points: row.score,
        breakdown: { champions: { correct: row.correct, total: championships.length } },
      }))
    );
    if (insertError) throw new Error(insertError.message);
  }
  const { error: closeError } = await admin.from("stages").update({ champions_closed_at: new Date().toISOString() }).eq("id", stageId);
  if (closeError) throw new Error(closeError.message);
  return ranking.length;
}

/** Réouverture (correction d'un vainqueur) : retire les scores du classement Saison. */
export async function reopenChampionsEvent(admin: SupabaseClient, stageId: string): Promise<void> {
  const { error } = await admin.from("score_ledger").delete().eq("stage_id", stageId).eq("bonus_kind", "champions");
  if (error) throw new Error(error.message);
  const { error: openError } = await admin.from("stages").update({ champions_closed_at: null }).eq("id", stageId);
  if (openError) throw new Error(openError.message);
}
