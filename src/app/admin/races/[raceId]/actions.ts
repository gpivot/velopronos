"use server";

import { revalidatePath } from "next/cache";
import { fromDateTimeLocalParis, isSpecialRuleAllowed, stageFormFields } from "../../_components/labels";
import { createAdminClient } from "@/lib/supabase/server";
import { fillCourseOddsFromSeason } from "@/lib/velo/imports";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { fetchIbuResults, fetchIbuStartList } from "@/lib/admin/ibuResults";
import { aiResultToCsv, fetchAiStageResults, findRiderByName, officialSiteFor } from "@/lib/admin/aiStageResults";
import { toParisWallTime } from "@/lib/displayTimeZone";
import { matchStartList, saveStartList } from "@/lib/admin/startListImport";
import { notifyRaceResults } from "@/lib/notifications/jobs";
import { redirect } from "next/navigation";
import {
  deleteRace,
  rescorePursuitAfterSprint,
  resetRaceResults,
  saveRaceResults,
  scoreRace,
  type ResultEntryInput,
} from "@/lib/admin/raceResults";

export interface SubmitResultsState {
  status: "idle" | "success" | "error";
  message?: string;
}

export async function submitResults(
  raceId: string,
  entries: ResultEntryInput[]
): Promise<SubmitResultsState> {
  await requireAdmin();
  const admin = createAdminClient();

  try {
    await saveRaceResults(admin, raceId, entries);
    const summary = await scoreRace(admin, raceId);
    const pursuitRescored = await rescorePursuitAfterSprint(admin, raceId);
    const massStartNote = await tryMassStartListAfter(admin, raceId);
    // Les points sont enregistrés même si la notification échoue (Firebase pas branché…).
    const pushNote = await notifyRaceResults(admin, raceId).catch(
      (error) => ` Notification non envoyée : ${error instanceof Error ? error.message : "erreur inconnue"}.`
    );
    revalidatePath("/admin", "layout");
    return {
      status: "success",
      message:
        `Résultats enregistrés, ${summary.scoredPredictions} pronostic(s) noté(s), séries 10/10 recalculées.` +
        (pursuitRescored ? " Poursuite de l'étape renotée avec ses nouvelles cotes." : "") +
        massStartNote +
        pushNote,
    };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "Erreur inconnue." };
  }
}

/**
 * Après la saisie d'une course individuelle, tente de récupérer la liste de départ IBU de la mass
 * start suivante de l'étape (même sexe), si elle n'en a pas encore. Sans liste publiée, rien ne
 * change : le bouton de la page de la mass start reste disponible.
 */
async function tryMassStartListAfter(admin: ReturnType<typeof createAdminClient>, raceId: string): Promise<string> {
  const { data: race } = await admin.from("races").select("stage_id, sex, format, locks_at").eq("id", raceId).single();
  if (!race?.sex || race.format === "mass_start" || race.format.startsWith("relais_")) return "";
  const { data: massStart } = await admin
    .from("races")
    .select("id")
    .eq("stage_id", race.stage_id)
    .eq("format", "mass_start")
    .eq("sex", race.sex)
    .gt("locks_at", race.locks_at)
    .order("locks_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!massStart) return "";
  const { count } = await admin.from("race_start_lists").select("athlete_id", { count: "exact", head: true }).eq("race_id", massStart.id);
  if ((count ?? 0) > 0) return "";
  const outcome = await importIbuStartList(admin, massStart.id);
  return outcome.ok
    ? ` Mass start : ${outcome.message}`
    : " Mass start : liste de départ pas encore publiée par l'IBU, réessaie depuis la page de la mass start.";
}

export interface IbuImportState {
  ok: boolean;
  message: string;
  csv?: string;
  warnings: string[];
}

/** Classement officiel IBU de la course, au format CSV, pour pré-remplir le formulaire (rien n'est enregistré). */
export async function loadIbuResults(raceId: string, forcedIbuRaceId?: string): Promise<IbuImportState> {
  await requireAdmin();
  const admin = createAdminClient();

  const { data: race } = await admin
    .from("races")
    .select("format, sex, locks_at, stages(location, starts_on, ends_on, seasons(label))")
    .eq("id", raceId)
    .single();
  if (!race) return { ok: false, message: "Course introuvable.", warnings: [] };

  const stage = race.stages as any;
  try {
    const result = await fetchIbuResults({
      seasonLabel: stage.seasons?.label ?? "",
      stage,
      race,
      mode: ["relais_h", "relais_f", "relais_mixte", "relais_mixte_simple"].includes(race.format) ? "nation" : "athlete",
      forcedRaceId: forcedIbuRaceId,
    });
    return { ok: true, message: `Résultats IBU : ${result.description} (${result.raceId}).`, csv: result.csv, warnings: result.warnings };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Erreur IBU inconnue.", warnings: [] };
  }
}

export interface AiImportState {
  ok: boolean;
  message: string;
  csv?: string;
  warnings: string[];
  sources: Array<{ name: string; url: string }>;
  /** Combatif du jour donné par l'IA, retrouvé parmi les engagés (sinon seulement son nom). */
  combatif?: { name: string; athleteId: string | null };
}

/**
 * Résultats de l'étape cherchés par l'IA sur le web (site officiel, ProCyclingStats, L'Équipe),
 * au format CSV, pour pré-remplir le formulaire (rien n'est enregistré).
 */
export async function loadAiResults(raceId: string, referenceUrl?: string): Promise<AiImportState> {
  await requireAdmin();
  const admin = createAdminClient();
  const { data: race } = await admin
    .from("races")
    .select("stage_id, format, special_rule, stage_number, start_city, end_city, locks_at, stages(name, location, kind)")
    .eq("id", raceId)
    .single();
  if (!race) return { ok: false, message: "Étape introuvable.", warnings: [], sources: [] };
  const stage = race.stages as unknown as { name: string | null; location: string; kind: string };
  const courseName = stage.name ?? stage.location;
  const teamTimeTrial = race.format === "clm_equipes";

  // Étape Crevaison : la place de chaque coureur pronostiqué compte, même hors Top 10.
  let extraRiders: string[] = [];
  if (race.special_rule === "brouillard") {
    const { data: predictions } = await admin.from("predictions").select("athlete_ids").eq("race_id", raceId);
    const ids = [...new Set((predictions ?? []).flatMap((p: any) => (p.athlete_ids ?? []) as string[]))];
    if (ids.length > 0) {
      const { data: athletes } = await admin.from("athletes").select("first_name, last_name").in("id", ids);
      extraRiders = (athletes ?? []).map((a: any) => `${a.first_name} ${a.last_name}`.trim());
    }
  }

  try {
    const { result, model } = await fetchAiStageResults({
      courseName,
      date: toParisWallTime(new Date(race.locks_at)).slice(0, 10),
      stageNumber: stage.kind === "one_day" ? null : race.stage_number,
      startCity: race.start_city,
      endCity: race.end_city,
      teamTimeTrial,
      officialUrl: officialSiteFor(courseName),
      referenceUrl: referenceUrl?.trim() || null,
      topN: 10,
      extraRiders,
    });
    if (result.status === "not_found" || result.rows.length === 0) {
      return {
        ok: false,
        message: "L'IA n'a pas trouvé de résultat publié pour cette étape. Réessaie plus tard ou indique l'adresse de la page des résultats.",
        warnings: result.notes,
        sources: result.sources,
      };
    }
    const { csv, warnings } = aiResultToCsv(result, teamTimeTrial);

    let combatif: AiImportState["combatif"];
    if (result.combatif && !teamTimeTrial) {
      const { data: entries } = await admin.from("stage_riders").select("athlete_id, athletes(first_name, last_name)").eq("stage_id", race.stage_id);
      const riders = ((entries ?? []) as any[])
        .filter((e) => e.athletes)
        .map((e) => ({ id: e.athlete_id as string, firstName: e.athletes.first_name ?? "", lastName: e.athletes.last_name ?? "" }));
      combatif = { name: result.combatif.name, athleteId: findRiderByName(result.combatif.name, riders)?.id ?? null };
    }

    return {
      ok: true,
      message: `Résultats trouvés par l'IA (${model}, ${result.sources.length} source(s)).`,
      csv,
      warnings,
      sources: result.sources,
      combatif,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Erreur IA inconnue.", warnings: [], sources: [] };
  }
}

export interface StartListImportState {
  ok: boolean;
  message: string;
  unmatched: string[];
}

/**
 * Liste de départ officielle IBU (poursuite, mass start) : enregistrée directement, la course
 * n'affiche ensuite que ces biathlètes, avec les cotes déjà validées. Ré-exécutable.
 */
export async function loadIbuStartList(raceId: string, forcedIbuRaceId?: string): Promise<StartListImportState> {
  await requireAdmin();
  return importIbuStartList(createAdminClient(), raceId, forcedIbuRaceId);
}

async function importIbuStartList(admin: ReturnType<typeof createAdminClient>, raceId: string, forcedIbuRaceId?: string): Promise<StartListImportState> {
  const { data: race } = await admin
    .from("races")
    .select("format, sex, locks_at, stages(season_id, location, starts_on, ends_on, seasons(label))")
    .eq("id", raceId)
    .single();
  if (!race) return { ok: false, message: "Course introuvable.", unmatched: [] };
  const stage = race.stages as any;

  try {
    const ibu = await fetchIbuStartList({ seasonLabel: stage.seasons?.label ?? "", stage, race, forcedRaceId: forcedIbuRaceId });
    const { data: odds } = await admin
      .from("odds")
      .select("athlete_id, athletes(first_name, last_name, nation_code, sex)")
      .eq("season_id", stage.season_id)
      .eq("format", race.format)
      .is("valid_until", null);
    const candidates = (odds ?? [])
      .filter((o: any) => o.athlete_id && (!race.sex || o.athletes?.sex === race.sex))
      .map((o: any) => ({
        id: o.athlete_id as string,
        firstName: o.athletes?.first_name ?? "",
        lastName: o.athletes?.last_name ?? "",
        nationCode: o.athletes?.nation_code ?? "",
      }));
    const matched = matchStartList(ibu.entries, candidates);
    if (matched.rows.length === 0) {
      return { ok: false, message: `Aucun biathlète de la liste IBU (${ibu.entries.length}) n'a de cote pour ce format : rien enregistré.`, unmatched: matched.unmatched };
    }
    await saveStartList(admin, raceId, matched.rows);
    revalidatePath("/admin", "layout");
    return {
      ok: true,
      message: `Liste de départ IBU enregistrée : ${ibu.description} (${ibu.raceId}), ${matched.rows.length} biathlète(s) sur ${ibu.entries.length} avec leur cote.`,
      unmatched: matched.unmatched,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Erreur IBU inconnue.", unmatched: [] };
  }
}

export async function clearStartList(formData: FormData) {
  await requireAdmin();
  await saveStartList(createAdminClient(), String(formData.get("race_id")), []);
  revalidatePath("/admin", "layout");
}

/** Modifie une étape : type, numéro, villes, distance, dénivelé, heure de départ (Paris), règle spéciale. */
export async function updateRace(formData: FormData) {
  await requireAdmin();
  const raceId = String(formData.get("race_id"));
  const format = String(formData.get("format"));
  const specialRule = String(formData.get("special_rule"));
  if (!isSpecialRuleAllowed(format, specialRule)) throw new Error("Pas de règle spéciale sur un CLM par équipes.");
  const admin = createAdminClient();
  if (specialRule !== "") {
    const { data: race } = await admin.from("races").select("stages(coefficient)").eq("id", raceId).single();
    if ((race?.stages as unknown as { coefficient: number } | null)?.coefficient === 2) throw new Error("Pas d'étape malus ni de Fête nationale sur une course ×2 (monuments, Mondiaux).");
  }

  const { data: updated, error } = await admin
    .from("races")
    .update({
      format,
      sex: "H",
      ...stageFormFields(formData),
      locks_at: fromDateTimeLocalParis(String(formData.get("locks_at"))),
      special_rule: specialRule === "" ? null : specialRule,
    })
    .eq("id", raceId)
    .select("stage_id")
    .single();
  if (error) throw new Error(error.message);
  // Nouveau type d'étape (ex. Classique) : les engagés sans cote de ce type reprennent celle de la saison.
  if (updated?.stage_id) await fillCourseOddsFromSeason(admin, updated.stage_id as string);

  revalidatePath("/admin", "layout");
}

/**
 * Combatif du jour (VéloPronos) : +50 aux joueurs dont le super combatif pronostiqué sur la course
 * est désigné. Une étape déjà notée est renotée aussitôt.
 */
export async function updateCombatif(formData: FormData) {
  await requireAdmin();
  const raceId = String(formData.get("race_id"));
  const athleteId = String(formData.get("combatif_athlete_id") ?? "") || null;
  const admin = createAdminClient();
  const { data: race, error } = await admin
    .from("races")
    .update({ combatif_athlete_id: athleteId })
    .eq("id", raceId)
    .select("status")
    .single();
  if (error) throw new Error(error.message);
  if (race?.status === "finished") await scoreRace(admin, raceId);
  revalidatePath("/admin", "layout");
  revalidatePath("/", "layout");
}

/** « L'avis de VéloPronos » de la course ; un texte vide masque la rubrique sur la page course. */
export async function updateRaceOpinion(formData: FormData) {
  await requireAdmin();
  const raceId = String(formData.get("race_id"));
  const opinion = String(formData.get("opinion") ?? "").trim();

  const { error } = await createAdminClient()
    .from("races")
    .update({ opinion: opinion === "" ? null : opinion })
    .eq("id", raceId);
  if (error) throw new Error(error.message);

  revalidatePath("/admin", "layout");
  revalidatePath("/", "layout");
}

export async function resetResults(formData: FormData) {
  await requireAdmin();
  const raceId = String(formData.get("race_id"));
  const admin = createAdminClient();
  await resetRaceResults(admin, raceId);
  await rescorePursuitAfterSprint(admin, raceId);
  revalidatePath("/admin", "layout");
}

export async function removeRace(formData: FormData) {
  await requireAdmin();
  await deleteRace(createAdminClient(), String(formData.get("race_id")));
  revalidatePath("/admin", "layout");
  if (formData.get("redirect") === "1") redirect("/admin");
}
