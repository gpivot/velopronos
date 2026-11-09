import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { nameVariants } from "../admin/resultsCsv";
import { normalizeLabel } from "../admin/csv";
import { toParisWallTime } from "../displayTimeZone";
import { normalizeNationCode, NATION_NAMES } from "../nationFlags";
import { isPredictionOpen } from "../predictionWindow";
import { clearCourseOdds, fillCourseOddsFromSeason } from "./imports";
import { fetchAiStartlist, type AiStartlistRider } from "./aiStartlist";

/**
 * Mise à jour automatique des engagés d'une course par IA (07/11/2026) : le lundi 17 h de la
 * semaine de course (ouverture des pronostics), puis chaque jour à 17 h, et une dernière fois à
 * 7 h le matin du départ. Après le départ de la 1re étape, plus rien n'est touché (les abandons se
 * gèrent à la main). Les engagés reprennent les cotes de la liste de la saison.
 */

/** Une liste plus courte est jugée incomplète : rien n'est modifié. */
export const MIN_STARTLIST_RIDERS = 20;

export type StartlistSlot = "evening" | "morning";

/** Créneau du passage : 17 h (heure de Paris) chaque jour, 7 h le matin de course ; sinon rien. */
export function startlistSlot(now: Date): StartlistSlot | null {
  const hour = Number(toParisWallTime(now).slice(11, 13));
  return hour === 17 ? "evening" : hour === 7 ? "morning" : null;
}

export interface StartlistCourse {
  kind: string;
  starts_on: string;
  /** Départ de la 1re étape (ISO), null si la course n'a pas encore d'étape. */
  firstLocksAt: string | null;
  startlist_auto: boolean;
}

/** La course doit-elle être mise à jour à ce passage ? */
export function isStartlistDue(course: StartlistCourse, now: Date, slot: StartlistSlot): boolean {
  if (!course.startlist_auto || course.kind === "bonus_event" || !course.firstLocksAt) return false;
  if (!isPredictionOpen(course.starts_on, now)) return false;
  const firstLock = new Date(course.firstLocksAt);
  if (now.getTime() >= firstLock.getTime()) return false;
  if (slot === "morning") return toParisWallTime(firstLock).slice(0, 10) === toParisWallTime(now).slice(0, 10);
  return true;
}

export interface SeasonAthlete {
  id: string;
  first_name: string;
  last_name: string;
  nation_code: string;
}

export interface StartlistPlan {
  /** Engagés retenus (coureurs connus de la saison). */
  entries: Array<{ athleteId: string; bib: number | null; rider: AiStartlistRider }>;
  /** Coureurs de la liste inconnus dans la saison : à créer. */
  unknown: AiStartlistRider[];
  /** Engagés actuels absents de la nouvelle liste : à retirer. */
  removed: string[];
}

/**
 * Partie pure (testée) : rapproche la liste de l'IA des coureurs de la saison (noms sans accents,
 * prénom/nom dans les deux sens ; la nation départage les homonymes), et calcule les retraits.
 */
export function planStartlist(riders: AiStartlistRider[], athletes: SeasonAthlete[], enteredIds: string[]): StartlistPlan {
  const byName = new Map<string, SeasonAthlete[]>();
  for (const a of athletes) {
    const keys = [`${a.first_name} ${a.last_name}`, `${a.last_name} ${a.first_name}`].flatMap(nameVariants);
    for (const key of new Set(keys)) byName.set(key, [...(byName.get(key) ?? []), a]);
  }
  const plan: StartlistPlan = { entries: [], unknown: [], removed: [] };
  const taken = new Set<string>();
  for (const rider of riders) {
    const found = new Map<string, SeasonAthlete>();
    for (const key of nameVariants(`${rider.firstName} ${rider.lastName}`.trim())) for (const a of byName.get(key) ?? []) found.set(a.id, a);
    let matches = [...found.values()];
    if (matches.length > 1) matches = matches.filter((a) => a.nation_code === normalizeNationCode(rider.nation));
    if (matches.length === 1 && !taken.has(matches[0].id)) {
      taken.add(matches[0].id);
      plan.entries.push({ athleteId: matches[0].id, bib: rider.bib, rider });
    } else if (matches.length === 0) {
      plan.unknown.push(rider);
    }
    // Plusieurs homonymes indépartageables : ignoré (signalé par le rapport via le décompte).
  }
  plan.removed = enteredIds.filter((id) => !taken.has(id));
  return plan;
}

/** Équipe de la saison qui correspond au nom donné par l'IA (nom ou code, sans accents ni casse). */
export function matchTeam(name: string, teams: Array<{ id: string; code: string; name: string }>): string | null {
  const n = normalizeLabel(name);
  if (!n) return null;
  const exact = teams.find((t) => normalizeLabel(t.name) === n || normalizeLabel(t.code) === n);
  if (exact) return exact.id;
  const partial = teams.filter((t) => normalizeLabel(t.name).length >= 4 && (n.includes(normalizeLabel(t.name)) || normalizeLabel(t.name).includes(n)));
  return partial.length === 1 ? partial[0].id : null;
}

export interface StartlistSyncReport {
  ok: boolean;
  message: string;
}

/**
 * Récupère la startlist d'une course par IA et met à jour ses engagés : ajout (coureurs créés dans
 * la saison s'ils sont inconnus), dossards, retrait des coureurs qui ne sont plus au départ (leurs
 * cotes de course sont retirées), puis reprise des cotes de la saison. Le rapport est gardé sur la
 * course (stages.startlist_report) pour l'admin.
 */
export async function syncCourseStartlist(admin: SupabaseClient, stageId: string, client?: Anthropic): Promise<StartlistSyncReport> {
  const { data: stage, error: stageError } = await admin
    .from("stages")
    .select("id, season_id, name, location, starts_on, startlist_url, seasons(startlist_priority_site)")
    .eq("id", stageId)
    .single();
  if (stageError || !stage) throw new Error(`Course introuvable${stageError ? ` (${stageError.message} ; migration 0058 appliquée ?)` : ""}.`);
  const courseName = (stage.name ?? stage.location) as string;
  const prioritySite = (stage.seasons as unknown as { startlist_priority_site: string | null } | null)?.startlist_priority_site ?? null;

  const finish = async (ok: boolean, message: string): Promise<StartlistSyncReport> => {
    await admin.from("stages").update({ startlist_synced_at: new Date().toISOString(), startlist_report: message }).eq("id", stageId);
    return { ok, message };
  };

  let startlist;
  try {
    ({ startlist } = await fetchAiStartlist({ courseName, startsOn: stage.starts_on as string, prioritySite, courseUrl: stage.startlist_url as string | null }, client));
  } catch (error) {
    return finish(false, `Échec : ${error instanceof Error ? error.message : "erreur inconnue"}`);
  }
  const sourceLabel = startlist.sources.map((s) => s.name || s.url).slice(0, 3).join(", ");
  if (startlist.status === "not_found") return finish(false, `Startlist pas encore publiée${sourceLabel ? ` (${sourceLabel})` : ""}. Rien n'a changé.`);
  if (startlist.riders.length < MIN_STARTLIST_RIDERS) {
    return finish(false, `Liste incomplète (${startlist.riders.length} coureurs) : rien n'a changé. ${startlist.notes.join(" ")}`.trim());
  }

  const seasonId = stage.season_id as string;
  const [{ data: athletes }, { data: entered }, { data: teams }] = await Promise.all([
    admin.from("athletes").select("id, first_name, last_name, nation_code").eq("season_id", seasonId),
    admin.from("stage_riders").select("athlete_id").eq("stage_id", stageId),
    admin.from("teams").select("id, code, name").eq("season_id", seasonId),
  ]);
  const plan = planStartlist(startlist.riders, (athletes ?? []) as SeasonAthlete[], (entered ?? []).map((e) => e.athlete_id as string));

  // Coureurs inconnus : créés dans la saison, sans cote (à compléter dans la liste de la saison).
  const created: string[] = [];
  const nations = new Set(plan.unknown.map((r) => normalizeNationCode(r.nation)).filter((c): c is string => !!c));
  if (nations.size > 0) {
    await admin
      .from("nations")
      .upsert([...nations].map((code) => ({ code, name: NATION_NAMES[code] ?? code })), { onConflict: "code", ignoreDuplicates: true });
  }
  for (const rider of plan.unknown) {
    const { data, error } = await admin
      .from("athletes")
      .insert({
        season_id: seasonId,
        first_name: rider.firstName,
        last_name: rider.lastName,
        nation_code: normalizeNationCode(rider.nation) ?? "FRA",
        team_id: matchTeam(rider.team, teams ?? []),
        sex: "H",
      })
      .select("id")
      .single();
    if (error || !data) continue;
    created.push(`${rider.firstName} ${rider.lastName}`);
    plan.entries.push({ athleteId: data.id as string, bib: rider.bib, rider });
  }

  const { error: entryError } = await admin
    .from("stage_riders")
    .upsert(plan.entries.map((e) => ({ stage_id: stageId, athlete_id: e.athleteId, bib: e.bib })), { onConflict: "stage_id,athlete_id" });
  if (entryError) return finish(false, `Échec de l'enregistrement des engagés : ${entryError.message}`);

  const nameById = new Map(((athletes ?? []) as SeasonAthlete[]).map((a) => [a.id, `${a.first_name} ${a.last_name}`.trim()]));
  if (plan.removed.length > 0) {
    await admin.from("stage_riders").delete().eq("stage_id", stageId).in("athlete_id", plan.removed);
    for (const id of plan.removed) await clearCourseOdds(admin, stageId, "athlete_id", id);
  }
  const filled = await fillCourseOddsFromSeason(admin, stageId);

  const status = startlist.status === "final" ? "définitive" : "provisoire";
  const parts = [
    `Liste ${status} : ${plan.entries.length} engagé(s)${sourceLabel ? ` (${sourceLabel})` : ""}.`,
    plan.removed.length ? `Retiré(s) : ${plan.removed.map((id) => nameById.get(id) ?? id).join(", ")}.` : "",
    created.length ? `⚠️ Inconnu(s) de la liste de la saison, ajouté(s) sans cote : ${created.join(", ")}.` : "",
    filled ? `${filled} cote(s) reprise(s) de la saison.` : "",
    ...startlist.notes,
  ];
  return finish(true, parts.filter(Boolean).join(" "));
}

/**
 * Passage planifié (pg_cron toutes les 10 minutes autour de 7 h et 17 h) : met à jour **une**
 * course due à ce créneau, pour rester dans la durée maximale d'un appel ; les suivantes passent
 * aux appels suivants (une course déjà mise à jour dans l'heure est sautée).
 */
export async function runStartlistSync(admin: SupabaseClient, now: Date, client?: Anthropic): Promise<string> {
  const slot = startlistSlot(now);
  if (!slot) return "Startlists : pas de passage à cette heure.";
  const today = toParisWallTime(now).slice(0, 10);
  const { data: courses, error } = await admin
    .from("stages")
    .select("id, name, location, kind, starts_on, startlist_auto, startlist_synced_at, races(locks_at)")
    .gte("starts_on", today)
    .lte("starts_on", new Date(now.getTime() + 8 * 86400000).toISOString().slice(0, 10));
  if (error) return `Startlists : ${error.message} (migration 0058 appliquée ?)`;
  const due = (courses ?? []).filter((c: any) => {
    // Déjà passé dans l'heure (appel répété) : on ne relance pas.
    if (c.startlist_synced_at && now.getTime() - new Date(c.startlist_synced_at).getTime() < 50 * 60000) return false;
    const locks = ((c.races ?? []) as Array<{ locks_at: string }>).map((r) => r.locks_at).sort();
    return isStartlistDue({ kind: c.kind, starts_on: c.starts_on, firstLocksAt: locks[0] ?? null, startlist_auto: c.startlist_auto !== false }, now, slot);
  });
  const label = slot === "evening" ? "17 h" : "7 h";
  const course = due[0];
  if (!course) return `Startlists (${label}) : rien à mettre à jour.`;
  const report = await syncCourseStartlist(admin, course.id as string, client);
  return `Startlists (${label}) : ${course.name ?? course.location} : ${report.message}${due.length > 1 ? ` (${due.length - 1} autre(s) au prochain appel)` : ""}`;
}
