"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { normalizeNationCode } from "@/lib/nationFlags";
import { clearCourseOdds, fillCourseOddsFromSeason, riderKey, writeCourseOdds } from "@/lib/velo/imports";

// VéloPronos : coureurs et cotes d'une course (stage_riders + odds.stage_id).

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

/**
 * Lit les champs `odds_<format>` d'un formulaire : une cote entière positive est écrite (avec
 * historique si elle change), un champ vidé retire la cote courante.
 */
async function saveOddsFields(
  formData: FormData,
  stageId: string,
  target: "athlete_id" | "team_id",
  targetId: string
): Promise<void> {
  const admin = createAdminClient();
  const { data: stage } = await admin.from("stages").select("season_id").eq("id", stageId).single();
  if (!stage) throw new Error("Course introuvable.");

  const wanted: Array<{ targetId: string; format: string; value: number }> = [];
  const cleared: string[] = [];
  for (const [key, raw] of formData.entries()) {
    if (!key.startsWith("odds_")) continue;
    const format = key.slice("odds_".length);
    const value = String(raw).trim();
    if (value === "") cleared.push(format);
    else {
      const n = Math.round(Number(value.replace(",", ".")));
      if (Number.isFinite(n) && n > 0) wanted.push({ targetId, format, value: n });
    }
  }
  if (cleared.length > 0) await clearCourseOdds(admin, stageId, target, targetId, cleared);
  await writeCourseOdds(admin, stage.season_id as string, stageId, target, wanted);
}

/** Ligne d'un coureur : dossard, équipe, abandon et cotes de la course. */
export async function updateCourseRider(formData: FormData) {
  await requireAdmin();
  const admin = createAdminClient();
  const stageId = text(formData, "stage_id");
  const athleteId = text(formData, "athlete_id");

  const bib = text(formData, "bib");
  const { error } = await admin
    .from("stage_riders")
    .update({ bib: bib ? Number(bib) : null, abandoned_race_id: text(formData, "abandoned_race_id") || null })
    .eq("stage_id", stageId)
    .eq("athlete_id", athleteId);
  if (error) throw new Error(error.message);

  if (formData.has("team_id")) {
    await admin.from("athletes").update({ team_id: text(formData, "team_id") || null }).eq("id", athleteId);
  }
  await saveOddsFields(formData, stageId, "athlete_id", athleteId);
  revalidatePath("/admin/athletes");
}

/** Cotes d'une équipe dans la course (meilleure équipe, CLM par équipes). */
export async function updateCourseTeam(formData: FormData) {
  await requireAdmin();
  await saveOddsFields(formData, text(formData, "stage_id"), "team_id", text(formData, "team_id"));
  revalidatePath("/admin/athletes");
}

/** Engage un coureur dans la course ; il est créé dans la saison s'il n'existe pas encore. */
export async function addCourseRider(formData: FormData) {
  await requireAdmin();
  const admin = createAdminClient();
  const stageId = text(formData, "stage_id");
  const firstName = text(formData, "first_name");
  const lastName = text(formData, "last_name");
  const nationCode = normalizeNationCode(text(formData, "nation_code")) || "FRA";
  const teamId = text(formData, "team_id") || null;
  const bib = text(formData, "bib");
  if (!firstName || !lastName) throw new Error("Prénom et nom obligatoires.");

  const { data: stage } = await admin.from("stages").select("season_id").eq("id", stageId).single();
  if (!stage) throw new Error("Course introuvable.");
  const seasonId = stage.season_id as string;

  const { data: nation } = await admin.from("nations").select("code").eq("code", nationCode).maybeSingle();
  if (!nation) await admin.from("nations").insert({ code: nationCode, name: nationCode });

  const { data: athletes } = await admin.from("athletes").select("id, first_name, last_name").eq("season_id", seasonId);
  const key = riderKey(firstName, lastName);
  let athleteId = (athletes ?? []).find((a) => riderKey(a.first_name as string, a.last_name as string) === key)?.id as string | undefined;
  if (athleteId) {
    await admin.from("athletes").update({ nation_code: nationCode, team_id: teamId }).eq("id", athleteId);
  } else {
    const { data, error } = await admin
      .from("athletes")
      .insert({ season_id: seasonId, first_name: firstName, last_name: lastName, nation_code: nationCode, team_id: teamId, sex: "H" })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Création impossible.");
    athleteId = data.id as string;
  }

  const { error } = await admin
    .from("stage_riders")
    .upsert({ stage_id: stageId, athlete_id: athleteId, bib: bib ? Number(bib) : null }, { onConflict: "stage_id,athlete_id" });
  if (error) throw new Error(error.message);
  await fillCourseOddsFromSeason(admin, stageId);
  revalidatePath("/admin/athletes");
}

/** Copie les cotes de la saison dans la course, pour les engagés qui n'ont pas de cote propre. */
export async function fillOddsFromSeason(formData: FormData) {
  await requireAdmin();
  await fillCourseOddsFromSeason(createAdminClient(), text(formData, "stage_id"));
  revalidatePath("/admin/athletes");
}

/** Retire un coureur de la course et ses cotes courantes (l'historique reste). */
export async function removeCourseRider(formData: FormData) {
  await requireAdmin();
  const admin = createAdminClient();
  const stageId = text(formData, "stage_id");
  const athleteId = text(formData, "athlete_id");
  const { error } = await admin.from("stage_riders").delete().eq("stage_id", stageId).eq("athlete_id", athleteId);
  if (error) throw new Error(error.message);
  await clearCourseOdds(admin, stageId, "athlete_id", athleteId);
  revalidatePath("/admin/athletes");
}

export async function createTeam(formData: FormData) {
  await requireAdmin();
  const admin = createAdminClient();
  const code = text(formData, "code").toUpperCase();
  const name = text(formData, "name") || code;
  if (!code) throw new Error("Code obligatoire.");
  const { error } = await admin
    .from("teams")
    .upsert({ season_id: text(formData, "season_id"), code, name }, { onConflict: "season_id,code" });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/athletes");
}
