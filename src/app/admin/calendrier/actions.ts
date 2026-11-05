"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fromDateTimeLocalParis, isSpecialRuleAllowed, stageFormFields } from "../_components/labels";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { importCalendarCsv } from "@/lib/admin/calendarImport";
import { deleteStage, recomputeSeasonStreaks } from "@/lib/admin/raceResults";
import { stageCategoryFields } from "@/lib/stageCategory";
import { COURSE_CATEGORIES, COURSE_KINDS, JERSEY_TYPES } from "@/lib/velo/courses";
import type { CsvActionResult } from "../_components/CsvImportPanel";

export async function createSeason(formData: FormData) {
  await requireAdmin();
  const { error } = await createAdminClient().from("seasons").insert({
    label: String(formData.get("label")),
    starts_on: String(formData.get("starts_on")),
    ends_on: String(formData.get("ends_on")),
    status: "preparation",
  });
  if (error) throw new Error(error.message);

  revalidatePath("/admin");
}

/**
 * Jokers de fin de saison (01/11/2026) : à activer quand la dernière course est notée. Le
 * classement retire alors les résultats effacés par les jokers ; réversible (désactiver).
 */
export async function setJokersApplied(formData: FormData) {
  await requireAdmin();
  const { error } = await createAdminClient()
    .from("seasons")
    .update({ jokers_applied: formData.get("applied") === "1" })
    .eq("id", String(formData.get("season_id")));
  if (error) throw new Error(`${error.message} (migration 0030 appliquée ?)`);

  revalidatePath("/admin");
}

export async function activateSeason(formData: FormData) {
  await requireAdmin();
  const admin = createAdminClient();
  const seasonId = String(formData.get("season_id"));

  await admin.from("seasons").update({ status: "preparation" }).eq("status", "active");

  const { error } = await admin.from("seasons").update({ status: "active" }).eq("id", seasonId);
  if (error) throw new Error(error.message);

  revalidatePath("/admin", "layout");
}

export async function createStage(formData: FormData) {
  await requireAdmin();
  const { error } = await createAdminClient().from("stages").insert({
    season_id: String(formData.get("season_id")),
    location: String(formData.get("location")),
    country_code: String(formData.get("country_code")),
    starts_on: String(formData.get("starts_on")),
    ends_on: String(formData.get("ends_on")),
    ...stageCategoryFields(formData.get("coefficient")),
  });
  if (error) throw new Error(error.message);

  revalidatePath("/admin");
}

export async function createRace(formData: FormData) {
  await requireAdmin();
  const specialRule = String(formData.get("special_rule"));
  const format = String(formData.get("format"));
  if (!isSpecialRuleAllowed(format, specialRule)) throw new Error("Pas de règle spéciale sur un CLM par équipes.");

  const admin = createAdminClient();
  const stageId = String(formData.get("stage_id"));
  if (specialRule !== "") {
    const { data: stage } = await admin.from("stages").select("coefficient").eq("id", stageId).single();
    if (stage?.coefficient === 2) throw new Error("Pas d'étape malus ni de Fête nationale sur une course ×2 (monuments, Mondiaux).");
  }

  const { error } = await admin.from("races").insert({
    stage_id: stageId,
    format,
    sex: "H",
    ...stageFormFields(formData),
    locks_at: fromDateTimeLocalParis(String(formData.get("locks_at"))),
    special_rule: specialRule === "" ? null : specialRule,
    status: "upcoming",
  });
  if (error) throw new Error(error.message);

  revalidatePath("/admin");
}

export async function importCalendar(seasonId: string, csvText: string): Promise<CsvActionResult> {
  await requireAdmin();
  const summary = await importCalendarCsv(createAdminClient(), seasonId, csvText);
  revalidatePath("/admin", "layout");
  return {
    ok: true,
    message:
      `${summary.stagesCreated} étape(s) créée(s), ${summary.stagesUpdated} mise(s) à jour ; ` +
      `${summary.racesCreated} course(s) créée(s), ${summary.racesUpdated} mise(s) à jour.`,
    errors: [],
    warnings: summary.warnings,
  };
}

export async function removeStage(formData: FormData) {
  await requireAdmin();
  await deleteStage(createAdminClient(), String(formData.get("stage_id")));
  revalidatePath("/admin", "layout");
}

/**
 * Supprime une saison et, par cascade en base, tout ce qui lui appartient : étapes, courses,
 * athlètes, cotes, pronostics, résultats, points, ligues, cartes, Pépites.
 */
export async function removeSeason(formData: FormData) {
  await requireAdmin();
  const { error } = await createAdminClient().from("seasons").delete().eq("id", String(formData.get("season_id")));
  if (error) throw new Error(error.message);
  revalidatePath("/admin", "layout");
}

/** Modifie les infos d'une course (nom, pays, dates, ×1 / ×2 / ×0, type, catégorie, maillots). */
export async function updateStage(formData: FormData) {
  await requireAdmin();
  const startsOn = String(formData.get("starts_on"));
  const endsOn = String(formData.get("ends_on"));
  if (endsOn < startsOn) throw new Error("La date de fin doit être après la date de début.");
  const stageId = String(formData.get("stage_id"));
  const category = stageCategoryFields(formData.get("coefficient"));
  const admin = createAdminClient();
  // Mondiaux / JO : pas de course spéciale (décision de Guillaume, 04/11/2026).
  if (category.coefficient === 2) {
    const { count } = await admin.from("races").select("id", { count: "exact", head: true }).eq("stage_id", stageId).not("special_rule", "is", null);
    if (count) throw new Error("Cette course a des étapes malus ou Fête nationale : retire-les avant de la passer à ×2.");
  }

  const { data: before } = await admin.from("stages").select("season_id, counts_in_standings").eq("id", stageId).single();
  const { error } = await admin
    .from("stages")
    .update({
      name: String(formData.get("location")).trim(),
      location: String(formData.get("location")).trim(),
      country_code: String(formData.get("country_code")),
      ...courseFormFields(formData),
      starts_on: startsOn,
      ends_on: endsOn,
      ...category,
    })
    .eq("id", stageId);
  if (error) throw new Error(error.message);
  // Étape passée dans ou hors du classement : les points suivent en base (trigger, migration 0041),
  // les séries 10/10 sont recalculées ici.
  if (before && before.counts_in_standings !== category.counts_in_standings) {
    await recomputeSeasonStreaks(admin, before.season_id);
  }

  revalidatePath("/admin", "layout");
  revalidatePath("/", "layout");
  redirect("/admin");
}

/** Champs vélo d'une course (type, catégorie, couleur du maillot de leader, maillots pronostiqués). */
function courseFormFields(formData: FormData) {
  const kind = String(formData.get("kind") ?? "");
  const category = String(formData.get("category") ?? "");
  const color = String(formData.get("jersey_color") ?? "").trim();
  const jerseys = formData.getAll("jerseys").map(String).filter((j) => (JERSEY_TYPES as string[]).includes(j));
  return {
    ...((COURSE_KINDS as string[]).includes(kind) ? { kind } : {}),
    category: (COURSE_CATEGORIES as string[]).includes(category) ? category : null,
    jersey_color: /^#[0-9a-fA-F]{6}$/.test(color) ? color : null,
    jerseys,
  };
}
