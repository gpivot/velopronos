"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import {
  courseCoefficient,
  COURSE_CATEGORIES,
  COURSE_KINDS,
  type CourseCategory,
  type CourseKind,
  defaultJerseyColor,
  defaultJerseys,
} from "@/lib/velo/courses";
import {
  importCourseCalendar,
  importCourseRiders,
  importCourseStages,
  importCourseTeams,
  type ImportSummary,
} from "@/lib/velo/imports";
import { normalizeNationCode, NATION_NAMES } from "@/lib/nationFlags";
import type { CsvActionResult } from "../_components/CsvImportPanel";

function toResult(summary: ImportSummary, what: string): CsvActionResult {
  return {
    ok: true,
    message: [`${summary.created} ${what} créé(e)s, ${summary.updated} mis(es) à jour.`, ...summary.details].join(" "),
    errors: [],
    warnings: summary.warnings,
  };
}

async function run(fn: () => Promise<CsvActionResult>): Promise<CsvActionResult> {
  try {
    const result = await fn();
    revalidatePath("/admin", "layout");
    return result;
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Erreur inconnue.", errors: [], warnings: [] };
  }
}

export async function importVeloCalendar(seasonId: string, csvText: string): Promise<CsvActionResult> {
  await requireAdmin();
  return run(async () => toResult(await importCourseCalendar(createAdminClient(), seasonId, csvText), "course(s)"));
}

export async function importVeloStages(stageId: string, newStartDate: string | null, csvText: string): Promise<CsvActionResult> {
  await requireAdmin();
  return run(async () => toResult(await importCourseStages(createAdminClient(), stageId, csvText, newStartDate || null), "étape(s)"));
}

export async function importVeloRiders(stageId: string, csvText: string): Promise<CsvActionResult> {
  await requireAdmin();
  return run(async () => toResult(await importCourseRiders(createAdminClient(), stageId, csvText), "engagé(s)"));
}

export async function importVeloTeams(stageId: string, csvText: string): Promise<CsvActionResult> {
  await requireAdmin();
  return run(async () => toResult(await importCourseTeams(createAdminClient(), stageId, csvText), "équipe(s)"));
}

/** Création à la main d'une course (ex. « Tour de France 2026 (test) », hors classement). */
export async function createVeloCourse(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind")) as CourseKind;
  const categoryRaw = String(formData.get("category") ?? "");
  const category = (COURSE_CATEGORIES as string[]).includes(categoryRaw) ? (categoryRaw as CourseCategory) : null;
  const countryCode = normalizeNationCode(String(formData.get("country_code") ?? "")) ?? "FRA";
  const startsOn = String(formData.get("starts_on"));
  const endsOn = kind === "one_day" ? startsOn : String(formData.get("ends_on") || startsOn);
  if (!name || !COURSE_KINDS.includes(kind)) throw new Error("Nom ou type de course manquant.");
  if (endsOn < startsOn) throw new Error("La date de fin doit être après la date de début.");

  const admin = createAdminClient();
  await admin.from("nations").upsert({ code: countryCode, name: NATION_NAMES[countryCode] ?? countryCode }, { onConflict: "code", ignoreDuplicates: true });
  const { error } = await admin.from("stages").insert({
    season_id: String(formData.get("season_id")),
    name,
    location: name,
    kind,
    category,
    country_code: countryCode,
    starts_on: startsOn,
    ends_on: endsOn,
    coefficient: courseCoefficient(name, category),
    counts_in_standings: formData.get("counts_in_standings") === "on",
    jerseys: defaultJerseys(kind),
    jersey_color: defaultJerseyColor(name, kind),
  });
  if (error) throw new Error(`${error.message} (migrations 0044 et 0045 appliquées ?)`);
  revalidatePath("/admin", "layout");
}
