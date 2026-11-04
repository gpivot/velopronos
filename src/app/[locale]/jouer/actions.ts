"use server";

import { createClient } from "@/lib/supabase/server";
import { getClock } from "@/lib/clock";
import { isPredictionOpen } from "@/lib/predictionWindow";
import { getStartList } from "@/lib/startList";

/**
 * Bouton « Jouer » de l'accueil visiteur : la prochaine course sur laquelle on peut pronostiquer
 * (pas encore partie, pronostics ouverts, cotes saisies, liste de départ connue). null : aucune.
 */
export async function findNextPlayableRace(): Promise<string | null> {
  const supabase = createClient();
  const { now } = await getClock();
  const { data: season } = await supabase.from("seasons").select("id").eq("status", "active").maybeSingle();
  if (!season) return null;

  const { data: races } = await supabase
    .from("races")
    .select("id, format, sex, locks_at, stage_id, stages!inner(season_id, starts_on)")
    .eq("stages.season_id", season.id)
    .neq("status", "finished")
    .gt("locks_at", now.toISOString())
    .order("locks_at", { ascending: true })
    .limit(12);

  for (const race of (races ?? []) as any[]) {
    if (!isPredictionOpen(race.stages.starts_on, now)) continue;
    const { count } = await supabase
      .from("odds")
      .select("id", { count: "exact", head: true })
      .eq("season_id", season.id)
      .eq("stage_id", race.stage_id) // cotes propres à la course (VéloPronos, 0045)
      .eq("format", race.format)
      .is("valid_until", null);
    if (!count) continue;
    const startList = await getStartList(supabase, race);
    if (startList.status === "pending") continue;
    return race.id as string;
  }
  return null;
}
