import type { SupabaseClient } from "@supabase/supabase-js";
import { getCardCourse, getCourseStreak } from "./bonusCards";

/** Vrai dès qu'au moins une course de la saison a été notée (statut « finished »). */
export async function seasonHasFinishedRace(supabase: SupabaseClient, seasonId: string): Promise<boolean> {
  const { count } = await supabase
    .from("races")
    .select("id, stages!inner(season_id)", { count: "exact", head: true })
    .eq("stages.season_id", seasonId)
    .eq("status", "finished");
  return (count ?? 0) > 0;
}

/**
 * VéloPronos : série en cours d'un joueur dans la course par étapes en cours (ou la prochaine),
 * 0 sans compteur. null : aucune course par étapes à venir, ou rien n'a encore été noté.
 */
export async function getCurrentStreak(
  supabase: SupabaseClient,
  seasonId: string,
  userId: string,
  now: Date = new Date()
): Promise<number | null> {
  const [started, course] = await Promise.all([seasonHasFinishedRace(supabase, seasonId), getCardCourse(supabase, seasonId, now)]);
  if (!started || !course) return null;
  return getCourseStreak(supabase, course.id, userId);
}
