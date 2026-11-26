"use server";

import { createClient } from "@/lib/supabase/server";
import { getClock } from "@/lib/clock";
import { getRaceDisplayStatus } from "@/lib/raceStatus";
import { getRaceResult, type LastResult } from "@/lib/lastResult";

export interface PlayerRaceResult {
  pseudo: string;
  prediction: LastResult["prediction"];
  /** Porteur d'eau du joueur révélé sur cette étape : ses points s'ajoutent au total (26/11/2026). */
  pepite: LastResult["pepite"];
  /** Fiche du joueur connecté lui-même (« Ton porteur d'eau » plutôt que « Son porteur d'eau »). */
  isSelf: boolean;
}

/**
 * Pop-up d'un joueur dans le classement d'une course notée : son pronostic détaillé (place et
 * points par choix, bonus). Seulement sur une course notée, comme le prévoit la migration 0018.
 */
export async function getPlayerRaceResult(raceId: string, userId: string): Promise<PlayerRaceResult | null> {
  const supabase = createClient();
  const [{ data: race }, { data: profile }, { now }, { data: auth }] = await Promise.all([
    supabase.from("races").select("status, locks_at").eq("id", raceId).maybeSingle(),
    supabase.from("profiles").select("pseudo").eq("id", userId).maybeSingle(),
    getClock(),
    supabase.auth.getUser(),
  ]);
  if (!race || getRaceDisplayStatus(race, now) !== "finished") return null;
  const result = await getRaceResult(supabase, raceId, userId);
  if (!result) return null;
  return { pseudo: profile?.pseudo ?? "?", prediction: result.prediction, pepite: result.pepite, isSelf: auth.user?.id === userId };
}
