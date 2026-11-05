// VéloPronos — imports CSV du back-office : calendrier de saison, étapes d'une course, coureurs
// et cotes d'une course. Formats repris de l'ancienne app (docs/velopronos/passation-projet.md).
// Chaque import est ré-exécutable : il met à jour ce qui existe au lieu de dupliquer.

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeLabel, parseCsv, parseOddsCell } from "../admin/csv";
import { NATION_NAMES, normalizeNationCode } from "../nationFlags";
import {
  addDays,
  COURSE_CATEGORIES,
  COURSE_KINDS,
  courseCoefficient,
  type CourseCategory,
  type CourseKind,
  daysBetween,
  defaultJerseyColor,
  defaultJerseys,
  type JerseyType,
  parisTimeToUtcIso,
  parseBoolean,
  parseDate,
  parseStageType,
  parseTime,
  type StageType,
} from "./courses";

export interface ImportSummary {
  created: number;
  updated: number;
  warnings: string[];
  details: string[];
}

function emptySummary(): ImportSummary {
  return { created: 0, updated: 0, warnings: [], details: [] };
}

/** Heure de départ par défaut d'une classique créée par le calendrier, à corriger dans l'admin. */
export const ONE_DAY_DEFAULT_TIME = "11:00";
/** Type d'étape par défaut d'une classique (à confirmer : les cotes de la course s'y rangent). */
export const ONE_DAY_DEFAULT_TYPE: StageType = "baroudeurs";

// ---------------------------------------------------------------------------------------------
// 1. Calendrier de saison
// ---------------------------------------------------------------------------------------------

export const COURSE_CALENDAR_HEADERS = [
  "Nom",
  "Date debut",
  "Date fin",
  "Categorie",
  "Type",
  "Pays",
  "Statut",
  "Visible",
  "Compte classement saison",
];

export interface ParsedCourse {
  name: string;
  startsOn: string;
  endsOn: string;
  kind: CourseKind;
  category: CourseCategory | null;
  countryCode: string;
  isVisible: boolean;
  countsInStandings: boolean;
  coefficient: 1 | 2;
  jerseys: JerseyType[];
  jerseyColor: string | null;
}

/**
 * Colonnes : Nom, Date debut, Date fin, Categorie, Type, Pays, Statut, Visible, Compte classement
 * saison (Cyclix et Expert, propres à l'ancienne app, sont ignorées ; le statut aussi : il se
 * déduit des dates).
 */
export function parseCourseCalendar(csvText: string): { courses: ParsedCourse[]; warnings: string[] } {
  const warnings: string[] = [];
  const courses: ParsedCourse[] = [];
  parseCsv(csvText).forEach((row, index) => {
    const line = index + 2;
    const name = row["nom"]?.trim();
    const startsOn = parseDate(row["date debut"]);
    if (!name || !startsOn) {
      warnings.push(`Ligne ${line} ignorée : nom ou date de début manquant.`);
      return;
    }
    const endsOn = parseDate(row["date fin"]) ?? startsOn;
    const kindRaw = normalizeLabel(row["type"] ?? "") as CourseKind;
    const kind: CourseKind = COURSE_KINDS.includes(kindRaw) ? kindRaw : endsOn > startsOn ? "stage_race" : "one_day";
    if (!COURSE_KINDS.includes(kindRaw)) warnings.push(`Ligne ${line} (${name}) : type « ${row["type"] ?? ""} » inconnu, « ${kind} » retenu.`);
    const categoryRaw = normalizeLabel(row["categorie"] ?? "") as CourseCategory;
    const category = COURSE_CATEGORIES.includes(categoryRaw) ? categoryRaw : null;
    if (!category && row["categorie"]?.trim()) warnings.push(`Ligne ${line} (${name}) : catégorie « ${row["categorie"]} » inconnue.`);
    let countryCode = normalizeNationCode(row["pays"]);
    if (!countryCode) {
      // Ex. Week-end des Champions (championnats nationaux) : pas de pays unique.
      countryCode = "FRA";
      warnings.push(`Ligne ${line} (${name}) : pays « ${row["pays"] ?? ""} » absent ou inconnu, France retenue.`);
    }
    courses.push({
      name,
      startsOn,
      endsOn: endsOn < startsOn ? startsOn : endsOn,
      kind,
      category,
      countryCode,
      // La colonne « Visible » de l'ancienne app vaut « non » partout dans l'export 2027 : elle est
      // ignorée, toute course importée est visible (à confirmer).
      isVisible: true,
      countsInStandings: parseBoolean(row["compte classement saison"], true),
      coefficient: courseCoefficient(name, category),
      jerseys: defaultJerseys(kind),
      jerseyColor: defaultJerseyColor(name, kind),
    });
  });
  return { courses, warnings };
}

async function ensureNations(admin: SupabaseClient, codes: Iterable<string>): Promise<void> {
  const wanted = Array.from(new Set(codes));
  if (wanted.length === 0) return;
  const { data } = await admin.from("nations").select("code").in("code", wanted);
  const known = new Set((data ?? []).map((n) => n.code as string));
  const missing = wanted.filter((c) => !known.has(c)).map((code) => ({ code, name: NATION_NAMES[code] ?? code }));
  if (missing.length > 0) {
    const { error } = await admin.from("nations").insert(missing);
    if (error) throw new Error(`Nations : ${error.message}`);
  }
}

/**
 * Crée ou met à jour les courses de la saison (retrouvées par leur nom). Une classique reçoit
 * aussi son étape unique, à 11 h (heure de Paris) et en type « baroudeurs » tant que l'admin ne
 * les a pas corrigés ; une étape existante n'est jamais modifiée par cet import.
 */
export async function importCourseCalendar(admin: SupabaseClient, seasonId: string, csvText: string): Promise<ImportSummary> {
  const summary = emptySummary();
  const { courses, warnings } = parseCourseCalendar(csvText);
  summary.warnings.push(...warnings);
  await ensureNations(admin, courses.map((c) => c.countryCode));

  const { data: existing } = await admin.from("stages").select("id, name").eq("season_id", seasonId);
  const idByName = new Map((existing ?? []).filter((s) => s.name).map((s) => [normalizeLabel(s.name as string), s.id as string]));

  for (const course of courses) {
    const fields = {
      name: course.name,
      location: course.name,
      country_code: course.countryCode,
      starts_on: course.startsOn,
      ends_on: course.endsOn,
      kind: course.kind,
      category: course.category,
      coefficient: course.coefficient,
      counts_in_standings: course.countsInStandings,
      is_visible: course.isVisible,
    };
    let stageId = idByName.get(normalizeLabel(course.name));
    if (stageId) {
      const { error } = await admin.from("stages").update(fields).eq("id", stageId);
      if (error) {
        summary.warnings.push(`${course.name} : mise à jour impossible (${error.message}).`);
        continue;
      }
      summary.updated++;
    } else {
      const { data, error } = await admin
        .from("stages")
        .insert({ ...fields, season_id: seasonId, jerseys: course.jerseys, jersey_color: course.jerseyColor })
        .select("id")
        .single();
      if (error || !data) {
        summary.warnings.push(`${course.name} : création impossible (${error?.message}).`);
        continue;
      }
      stageId = data.id as string;
      summary.created++;
    }

    if (course.kind === "one_day") {
      const { count } = await admin.from("races").select("id", { count: "exact", head: true }).eq("stage_id", stageId);
      if (!count) {
        const { error } = await admin.from("races").insert({
          stage_id: stageId,
          sex: "H",
          format: ONE_DAY_DEFAULT_TYPE,
          stage_number: 1,
          locks_at: parisTimeToUtcIso(course.startsOn, ONE_DAY_DEFAULT_TIME),
          status: "upcoming",
        });
        if (error) summary.warnings.push(`${course.name} : étape unique non créée (${error.message}).`);
        else summary.details.push(`${course.name} : étape unique créée à ${ONE_DAY_DEFAULT_TIME}, type baroudeurs (à vérifier).`);
      }
    }
  }
  return summary;
}

// ---------------------------------------------------------------------------------------------
// 2. Étapes d'une course
// ---------------------------------------------------------------------------------------------

export const COURSE_STAGES_HEADERS = [
  "stage_number",
  "ville_depart",
  "ville_arrivee",
  "type_etape",
  "km",
  "heure_depart",
  "date",
  "pays",
  "country_code",
  "denivele",
];

export interface ParsedStage {
  stageNumber: number;
  startCity: string;
  endCity: string;
  type: StageType;
  distanceKm: number | null;
  elevationM: number | null;
  date: string;
  time: string;
}

function parseNumber(value: string | undefined): number | null {
  const v = (value ?? "").replace(/\s/g, "").replace(",", ".");
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Colonnes : stage_number (0 ou P = prologue, R = repos), ville_depart, ville_arrivee,
 * type_etape (Sprint, Montagne, Baroudeurs, CLM, CLME), km, heure_depart (heure de Paris), date,
 * pays, country_code, denivele. `shiftDays` décale toutes les dates (course de test).
 */
export function parseCourseStages(
  csvText: string,
  shiftDays = 0
): { stages: ParsedStage[]; restDays: string[]; warnings: string[] } {
  const warnings: string[] = [];
  const stages: ParsedStage[] = [];
  const restDays: string[] = [];
  parseCsv(csvText).forEach((row, index) => {
    const line = index + 2;
    const numberRaw = (row["stage_number"] ?? "").trim().toUpperCase();
    const date = parseDate(row["date"]);
    if (!date) {
      warnings.push(`Ligne ${line} ignorée : date « ${row["date"] ?? ""} » illisible.`);
      return;
    }
    if (numberRaw === "R" || normalizeLabel(row["type_etape"] ?? "") === "rest") {
      restDays.push(addDays(date, shiftDays));
      return;
    }
    const stageNumber = numberRaw === "P" ? 0 : Number(numberRaw);
    if (!Number.isInteger(stageNumber) || stageNumber < 0) {
      warnings.push(`Ligne ${line} ignorée : numéro d'étape « ${numberRaw} » illisible.`);
      return;
    }
    const type = parseStageType(row["type_etape"]);
    if (!type) {
      warnings.push(`Étape ${stageNumber} ignorée : type « ${row["type_etape"] ?? ""} » inconnu.`);
      return;
    }
    const time = parseTime(row["heure_depart"]);
    if (!time) {
      warnings.push(`Étape ${stageNumber} ignorée : heure de départ « ${row["heure_depart"] ?? ""} » illisible.`);
      return;
    }
    const elevation = parseNumber(row["denivele"]);
    stages.push({
      stageNumber,
      startCity: (row["ville_depart"] ?? "").trim(),
      endCity: (row["ville_arrivee"] ?? "").trim(),
      type,
      distanceKm: parseNumber(row["km"]),
      elevationM: elevation == null ? null : Math.round(elevation),
      date: addDays(date, shiftDays),
      time,
    });
  });
  return { stages, restDays, warnings };
}

/**
 * Crée ou met à jour les étapes d'une course (retrouvées par leur numéro), ses jours de repos et
 * ses dates. `newStartDate` (AAAA-MM-JJ) décale tout le fichier pour que la 1re étape tombe ce
 * jour-là (ex. Tour 2026 rejoué comme course de test).
 */
export async function importCourseStages(
  admin: SupabaseClient,
  stageId: string,
  csvText: string,
  newStartDate?: string | null
): Promise<ImportSummary> {
  const summary = emptySummary();
  let shift = 0;
  if (newStartDate) {
    const firstDate = parseCourseStages(csvText).stages.map((s) => s.date).sort()[0];
    if (firstDate) shift = daysBetween(firstDate, newStartDate);
  }
  const { stages, restDays, warnings } = parseCourseStages(csvText, shift);
  summary.warnings.push(...warnings);
  if (shift) summary.details.push(`Dates décalées de ${shift} jour(s).`);
  if (stages.length === 0) return summary;

  const { data: existing } = await admin.from("races").select("id, stage_number").eq("stage_id", stageId);
  const idByNumber = new Map((existing ?? []).map((r) => [r.stage_number as number | null, r.id as string]));
  // Classique créée par le calendrier : son étape unique (n° 1) est reprise par la 1re ligne.

  for (const stage of stages) {
    const fields = {
      format: stage.type,
      stage_number: stage.stageNumber,
      start_city: stage.startCity || null,
      end_city: stage.endCity || null,
      distance_km: stage.distanceKm,
      elevation_m: stage.elevationM,
      locks_at: parisTimeToUtcIso(stage.date, stage.time),
    };
    const id = idByNumber.get(stage.stageNumber);
    if (id) {
      const { error } = await admin.from("races").update(fields).eq("id", id);
      if (error) summary.warnings.push(`Étape ${stage.stageNumber} : ${error.message}`);
      else summary.updated++;
    } else {
      const { error } = await admin.from("races").insert({ ...fields, stage_id: stageId, sex: "H", status: "upcoming" });
      if (error) summary.warnings.push(`Étape ${stage.stageNumber} : ${error.message}`);
      else summary.created++;
    }
  }

  const dates = [...stages.map((s) => s.date), ...restDays].sort();
  const { error } = await admin
    .from("stages")
    .update({ starts_on: dates[0], ends_on: dates[dates.length - 1], rest_days: Array.from(new Set(restDays)).sort() })
    .eq("id", stageId);
  if (error) summary.warnings.push(`Dates de la course : ${error.message}`);
  return summary;
}

// ---------------------------------------------------------------------------------------------
// 3. Coureurs et cotes d'une course
// ---------------------------------------------------------------------------------------------

export const COURSE_RIDERS_HEADERS = [
  "numero",
  "prenom",
  "nom",
  "equipe",
  "nom_equipe",
  "nationalite",
  "statut",
  "cote_sprint",
  "cote_montagne",
  "cote_clm",
  "cote_baroudeur",
  "MJ",
  "MV",
  "MP",
  "MJeune",
  "SC",
];

/** Colonne de cote du fichier → valeur d'odds_format. */
export const RIDER_ODDS_COLUMNS: Array<[string, string]> = [
  ["cote_sprint", "sprint"],
  ["cote_montagne", "montagne"],
  ["cote_clm", "clm"],
  ["cote_baroudeur", "baroudeurs"],
  ["mj", "maillot_general"],
  ["mv", "maillot_points"],
  ["mp", "maillot_montagne"],
  ["mjeune", "maillot_jeune"],
  ["sc", "super_combatif"],
];

export interface ParsedRider {
  bib: number | null;
  firstName: string;
  lastName: string;
  teamCode: string;
  /** Vide si le fichier ne le donne pas (le fichier des équipes le complète). */
  teamName: string;
  nationCode: string;
  odds: Record<string, number>;
}

/** Clé de rapprochement d'un coureur : prénom + nom sans accents ni casse. */
export function riderKey(firstName: string, lastName: string): string {
  return `${normalizeLabel(firstName)}|${normalizeLabel(lastName)}`;
}

/** Colonnes : voir COURSE_RIDERS_HEADERS. Le statut est ignoré (tous en course à l'import). */
export function parseCourseRiders(csvText: string): { riders: ParsedRider[]; warnings: string[] } {
  const warnings: string[] = [];
  const riders: ParsedRider[] = [];
  const seen = new Set<string>();
  parseCsv(csvText).forEach((row, index) => {
    const line = index + 2;
    const firstName = (row["prenom"] ?? "").trim();
    const lastName = (row["nom"] ?? "").trim();
    const teamCode = (row["equipe"] ?? "").trim().toUpperCase();
    const nationCode = normalizeNationCode(row["nationalite"]);
    if (!lastName || !teamCode || !nationCode) {
      warnings.push(`Ligne ${line} ignorée : nom, équipe ou nationalité manquant.`);
      return;
    }
    const key = riderKey(firstName, lastName);
    if (seen.has(key)) {
      warnings.push(`Ligne ${line} ignorée : ${firstName} ${lastName} est déjà dans le fichier.`);
      return;
    }
    seen.add(key);
    const odds: Record<string, number> = {};
    for (const [column, format] of RIDER_ODDS_COLUMNS) {
      const raw = row[column];
      const value = parseOddsCell(raw);
      if (value == null) continue;
      if (Number.isNaN(value)) {
        // Cote décimale de l'ancienne app : arrondie à l'entier (odds.value est un entier).
        const n = Number((raw ?? "").trim().replace(",", "."));
        if (Number.isFinite(n) && n > 0) {
          odds[format] = Math.max(1, Math.round(n));
          continue;
        }
        warnings.push(`Ligne ${line} (${lastName}) : cote ${column} « ${raw} » illisible.`);
        continue;
      }
      odds[format] = value;
    }
    const bib = parseNumber(row["numero"]);
    riders.push({
      bib: bib != null && Number.isInteger(bib) && bib > 0 ? bib : null,
      firstName,
      lastName,
      teamCode,
      teamName: (row["nom_equipe"] ?? "").trim(),
      nationCode,
      odds,
    });
  });
  return { riders, warnings };
}

/**
 * Importe les engagés d'une course : équipes (par code), coureurs de la saison (retrouvés par
 * prénom + nom, créés sinon), dossards, et cotes propres à cette course. Une cote qui change est
 * historisée (ancienne ligne close, nouvelle ligne courante) ; une cellule vide ne touche pas à
 * la cote existante.
 */
export async function importCourseRiders(admin: SupabaseClient, stageId: string, csvText: string): Promise<ImportSummary> {
  const summary = emptySummary();
  const { riders, warnings } = parseCourseRiders(csvText);
  summary.warnings.push(...warnings);
  if (riders.length === 0) return summary;

  const { data: stage, error: stageError } = await admin.from("stages").select("season_id").eq("id", stageId).single();
  if (stageError || !stage) throw new Error("Course introuvable.");
  const seasonId = stage.season_id as string;

  await ensureNations(admin, riders.map((r) => r.nationCode));

  // Équipes
  const teamNames = new Map<string, string>();
  for (const r of riders) if (!teamNames.get(r.teamCode)) teamNames.set(r.teamCode, r.teamName);
  const teamIdByCode = await upsertTeams(admin, seasonId, teamNames);

  // Coureurs
  const { data: athletes } = await admin.from("athletes").select("id, first_name, last_name").eq("season_id", seasonId);
  const athleteIdByKey = new Map((athletes ?? []).map((a) => [riderKey(a.first_name as string, a.last_name as string), a.id as string]));
  let ridersCreated = 0;
  for (const rider of riders) {
    const key = riderKey(rider.firstName, rider.lastName);
    const fields = { nation_code: rider.nationCode, team_id: teamIdByCode.get(rider.teamCode) ?? null };
    const id = athleteIdByKey.get(key);
    if (id) {
      await admin.from("athletes").update(fields).eq("id", id);
    } else {
      const { data, error } = await admin
        .from("athletes")
        .insert({ ...fields, season_id: seasonId, first_name: rider.firstName, last_name: rider.lastName, sex: "H" })
        .select("id")
        .single();
      if (error || !data) {
        summary.warnings.push(`${rider.firstName} ${rider.lastName} : création impossible (${error?.message}).`);
        continue;
      }
      athleteIdByKey.set(key, data.id as string);
      ridersCreated++;
    }
  }

  // Engagés
  const { data: entered } = await admin.from("stage_riders").select("athlete_id").eq("stage_id", stageId);
  const alreadyEntered = new Set((entered ?? []).map((e) => e.athlete_id as string));
  const entries = riders
    .map((r) => ({ stage_id: stageId, athlete_id: athleteIdByKey.get(riderKey(r.firstName, r.lastName)), bib: r.bib }))
    .filter((e): e is { stage_id: string; athlete_id: string; bib: number | null } => !!e.athlete_id);
  const { error: entryError } = await admin.from("stage_riders").upsert(entries, { onConflict: "stage_id,athlete_id" });
  if (entryError) throw new Error(`Engagés : ${entryError.message}`);
  summary.created = entries.filter((e) => !alreadyEntered.has(e.athlete_id)).length;
  summary.updated = entries.length - summary.created;

  // Cotes
  const wanted = riders.flatMap((rider) => {
    const athleteId = athleteIdByKey.get(riderKey(rider.firstName, rider.lastName));
    return athleteId ? Object.entries(rider.odds).map(([format, value]) => ({ targetId: athleteId, format, value })) : [];
  });
  const written = await writeCourseOdds(admin, seasonId, stageId, "athlete_id", wanted);

  summary.details.push(
    `${teamNames.size} équipe(s), ${ridersCreated} coureur(s) nouveau(x) dans la saison, ${written} cote(s) enregistrée(s).`
  );
  return summary;
}

/**
 * Crée les équipes manquantes de la saison et renomme celles dont le fichier donne un nom ; un nom
 * vide ne remplace jamais un nom existant (une nouvelle équipe prend alors son code comme nom).
 */
async function upsertTeams(admin: SupabaseClient, seasonId: string, namesByCode: Map<string, string>): Promise<Map<string, string>> {
  const { data: existing } = await admin.from("teams").select("id, code, name").eq("season_id", seasonId);
  const byCode = new Map((existing ?? []).map((t) => [t.code as string, { id: t.id as string, name: t.name as string }]));
  const toInsert: Array<{ season_id: string; code: string; name: string }> = [];
  for (const [code, name] of namesByCode) {
    const team = byCode.get(code);
    if (!team) toInsert.push({ season_id: seasonId, code, name: name || code });
    else if (name && name !== team.name) {
      const { error } = await admin.from("teams").update({ name }).eq("id", team.id);
      if (error) throw new Error(`Équipe ${code} : ${error.message}`);
    }
  }
  if (toInsert.length > 0) {
    const { data, error } = await admin.from("teams").insert(toInsert).select("id, code, name");
    if (error) throw new Error(`Équipes : ${error.message}`);
    for (const t of data ?? []) byCode.set(t.code as string, { id: t.id as string, name: t.name as string });
  }
  return new Map(Array.from(byCode, ([code, t]) => [code, t.id]));
}

/**
 * Remplace les cotes courantes d'une course qui ont changé (historisées), pour des cibles
 * coureur (`athlete_id`) ou équipe (`team_id`). Renvoie le nombre de cotes enregistrées.
 */
export async function writeCourseOdds(
  admin: SupabaseClient,
  seasonId: string,
  stageId: string,
  target: "athlete_id" | "team_id",
  wanted: Array<{ targetId: string; format: string; value: number }>
): Promise<number> {
  const { data: currentOdds } = await admin
    .from("odds")
    .select(`id, ${target}, format, value`)
    .eq("stage_id", stageId)
    .is("valid_until", null)
    .not(target, "is", null);
  const current = new Map(
    ((currentOdds ?? []) as unknown as Array<Record<string, unknown>>).map((o) => [
      `${o[target]}|${o.format}`,
      { id: o.id as string, value: o.value as number },
    ])
  );
  const toExpire: string[] = [];
  const toInsert: Array<Record<string, unknown>> = [];
  for (const { targetId, format, value } of wanted) {
    const existing = current.get(`${targetId}|${format}`);
    if (existing?.value === value) continue;
    if (existing) toExpire.push(existing.id);
    toInsert.push({ season_id: seasonId, stage_id: stageId, format, [target]: targetId, value });
  }
  const now = new Date().toISOString();
  for (let i = 0; i < toExpire.length; i += 200) {
    const { error } = await admin.from("odds").update({ valid_until: now }).in("id", toExpire.slice(i, i + 200));
    if (error) throw new Error(`Cotes : ${error.message}`);
  }
  for (let i = 0; i < toInsert.length; i += 500) {
    const { error } = await admin.from("odds").insert(toInsert.slice(i, i + 500));
    if (error) throw new Error(`Cotes : ${error.message}`);
  }
  return toInsert.length;
}

/** Retire (historise) les cotes courantes d'une cible dans une course, pour les types donnés (tous si vide). */
export async function clearCourseOdds(
  admin: SupabaseClient,
  stageId: string,
  target: "athlete_id" | "team_id",
  targetId: string,
  formats: string[] = []
): Promise<void> {
  let query = admin.from("odds").update({ valid_until: new Date().toISOString() }).eq("stage_id", stageId).eq(target, targetId).is("valid_until", null);
  if (formats.length > 0) query = query.in("format", formats);
  const { error } = await query;
  if (error) throw new Error(`Cotes : ${error.message}`);
}

// ---------------------------------------------------------------------------------------------
// 4. Équipes d'une course : noms, cote « meilleure équipe » et cote du CLM par équipes
// ---------------------------------------------------------------------------------------------

export const COURSE_TEAMS_HEADERS = ["equipe", "equipe_nom", "cote_ME", "CLME"];

export interface ParsedTeam {
  code: string;
  name: string;
  odds: Record<string, number>;
}

export function parseCourseTeams(csvText: string): { teams: ParsedTeam[]; warnings: string[] } {
  const warnings: string[] = [];
  const teams: ParsedTeam[] = [];
  parseCsv(csvText).forEach((row, index) => {
    const code = (row["equipe"] ?? "").trim().toUpperCase();
    if (!code) {
      warnings.push(`Ligne ${index + 2} ignorée : code d'équipe manquant.`);
      return;
    }
    const odds: Record<string, number> = {};
    for (const [column, format] of [
      ["cote_me", "meilleure_equipe"],
      ["clme", "clm_equipes"],
    ]) {
      const value = parseOddsCell(row[column]);
      if (value == null) continue;
      if (Number.isNaN(value)) warnings.push(`${code} : cote ${column} « ${row[column]} » illisible.`);
      else odds[format] = value;
    }
    teams.push({ code, name: (row["equipe_nom"] ?? "").trim(), odds });
  });
  return { teams, warnings };
}

export async function importCourseTeams(admin: SupabaseClient, stageId: string, csvText: string): Promise<ImportSummary> {
  const summary = emptySummary();
  const { teams, warnings } = parseCourseTeams(csvText);
  summary.warnings.push(...warnings);
  if (teams.length === 0) return summary;
  const { data: stage } = await admin.from("stages").select("season_id").eq("id", stageId).single();
  if (!stage) throw new Error("Course introuvable.");
  const seasonId = stage.season_id as string;

  const { data: before } = await admin.from("teams").select("code").eq("season_id", seasonId);
  const known = new Set((before ?? []).map((t) => t.code as string));
  const teamIdByCode = await upsertTeams(admin, seasonId, new Map(teams.map((t) => [t.code, t.name])));
  summary.created = teams.filter((t) => !known.has(t.code)).length;
  summary.updated = teams.length - summary.created;

  const wanted = teams.flatMap((t) =>
    Object.entries(t.odds).map(([format, value]) => ({ targetId: teamIdByCode.get(t.code)!, format, value }))
  );
  const written = await writeCourseOdds(admin, seasonId, stageId, "team_id", wanted);
  summary.details.push(`${written} cote(s) d'équipe enregistrée(s).`);
  return summary;
}
