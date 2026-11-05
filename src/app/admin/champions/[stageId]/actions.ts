"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { fromDateTimeLocalParis } from "../../_components/labels";
import { NATION_NAMES, normalizeNationCode } from "@/lib/nationFlags";
import { parseChampionsScale } from "@/lib/velo/champions";
import { closeChampionsEvent, reopenChampionsEvent } from "@/lib/velo/championsScoring";

function refresh() {
  revalidatePath("/admin", "layout");
  revalidatePath("/", "layout");
}

/** Ajoute un championnat national (pays, départ et limite de pronostic en heure de Paris). */
export async function addChampionship(formData: FormData) {
  await requireAdmin();
  const stageId = String(formData.get("stage_id"));
  const nationCode = normalizeNationCode(String(formData.get("nation_code") ?? ""));
  if (!nationCode) throw new Error("Code pays inconnu (ex. FRA, BEL, ITA).");
  const startsAt = fromDateTimeLocalParis(String(formData.get("starts_at")));
  const locksAtRaw = String(formData.get("locks_at") ?? "");
  const locksAt = locksAtRaw ? fromDateTimeLocalParis(locksAtRaw) : startsAt;
  const admin = createAdminClient();
  await admin.from("nations").upsert({ code: nationCode, name: NATION_NAMES[nationCode] ?? nationCode }, { onConflict: "code", ignoreDuplicates: true });
  const { error } = await admin.from("champion_championships").insert({ stage_id: stageId, nation_code: nationCode, starts_at: startsAt, locks_at: locksAt });
  if (error) throw new Error(`${error.message} (migration 0056 appliquée ?)`);
  refresh();
}

export async function updateChampionship(formData: FormData) {
  await requireAdmin();
  const startsAt = fromDateTimeLocalParis(String(formData.get("starts_at")));
  const locksAt = fromDateTimeLocalParis(String(formData.get("locks_at")));
  const { error } = await createAdminClient()
    .from("champion_championships")
    .update({ starts_at: startsAt, locks_at: locksAt })
    .eq("id", String(formData.get("championship_id")));
  if (error) throw new Error(error.message);
  refresh();
}

/** Même limite de pronostic pour tous les championnats de l'événement. */
export async function setGlobalLock(formData: FormData) {
  await requireAdmin();
  const locksAt = fromDateTimeLocalParis(String(formData.get("locks_at")));
  const { error } = await createAdminClient()
    .from("champion_championships")
    .update({ locks_at: locksAt })
    .eq("stage_id", String(formData.get("stage_id")));
  if (error) throw new Error(error.message);
  refresh();
}

export async function removeChampionship(formData: FormData) {
  await requireAdmin();
  const { error } = await createAdminClient().from("champion_championships").delete().eq("id", String(formData.get("championship_id")));
  if (error) throw new Error(error.message);
  refresh();
}

/** Vainqueur officiel (vide : retiré). Les scores provisoires se recalculent à la lecture. */
export async function setChampion(formData: FormData) {
  await requireAdmin();
  const winner = String(formData.get("winner_athlete_id") ?? "") || null;
  const { error } = await createAdminClient()
    .from("champion_championships")
    .update({ winner_athlete_id: winner })
    .eq("id", String(formData.get("championship_id")));
  if (error) throw new Error(error.message);
  refresh();
}

/** Ajoute un coureur de la nation du championnat s'il n'est pas déjà dans la saison. */
export async function addChampionRider(formData: FormData) {
  await requireAdmin();
  const seasonId = String(formData.get("season_id"));
  const nationCode = String(formData.get("nation_code"));
  const firstName = String(formData.get("first_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();
  if (!lastName) throw new Error("Nom du coureur manquant.");
  const { error } = await createAdminClient()
    .from("athletes")
    .insert({ season_id: seasonId, first_name: firstName, last_name: lastName, nation_code: nationCode, sex: "H" });
  if (error) throw new Error(error.message);
  refresh();
}

export async function saveChampionsScale(formData: FormData) {
  await requireAdmin();
  const scale = parseChampionsScale(String(formData.get("scale") ?? ""));
  if (!scale) throw new Error("Barème invalide : une suite de nombres entiers, en commençant par 0 champion trouvé.");
  const { error } = await createAdminClient().from("stages").update({ champions_scale: scale }).eq("id", String(formData.get("stage_id")));
  if (error) throw new Error(error.message);
  refresh();
}

/** Clôture : vérifie les vainqueurs, fige les scores et les injecte dans le classement Saison. */
export async function closeChampions(formData: FormData) {
  await requireAdmin();
  await closeChampionsEvent(createAdminClient(), String(formData.get("stage_id")));
  refresh();
}

export async function reopenChampions(formData: FormData) {
  await requireAdmin();
  await reopenChampionsEvent(createAdminClient(), String(formData.get("stage_id")));
  refresh();
}
