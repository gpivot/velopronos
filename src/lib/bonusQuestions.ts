import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Questions bonus (02/11/2026, cf. supabase/migrations/0033_bonus_questions.sql) :
 * - « pre_race » : avant le départ, 2 à 4 réponses, on répond jusqu'au départ de la course ;
 * - « live » : pendant la course, 2 réponses, ouverte quelques minutes après son lancement par l'admin
 *   (notification push à l'appui).
 * Une bonne réponse rapporte BONUS_QUESTION_POINTS au classement général, une mauvaise 0 (décision de
 * Guillaume, 02/11/2026). L'admin saisit la bonne réponse une fois la question fermée.
 */
export const BONUS_QUESTION_POINTS = 20;
export const LIVE_QUESTION_DEFAULT_MINUTES = 5;
export const LIVE_QUESTION_MAX_MINUTES = 60;

export type BonusQuestionKind = "pre_race" | "live";

export interface BonusQuestionRow {
  id: string;
  race_id: string;
  kind: BonusQuestionKind;
  question: string;
  options: string[];
  opens_at: string | null;
  closes_at: string | null;
  correct_option: number | null;
  created_at: string;
}

export type BonusQuestionState = "draft" | "scheduled" | "open" | "closed";

/**
 * État d'une question à l'instant `now`. Une question avant le départ ferme au départ de la course
 * (`raceLocksAt`, comparé à l'horloge de la page, simulée pour l'admin) ; une question live suit
 * l'heure réelle (`realNow`), puisqu'elle se joue pendant la vraie course.
 */
export function bonusQuestionState(
  question: Pick<BonusQuestionRow, "kind" | "opens_at" | "closes_at">,
  raceLocksAt: string,
  now: Date,
  realNow: Date = now
): BonusQuestionState {
  if (question.kind === "pre_race") return new Date(raceLocksAt) > now ? "open" : "closed";
  if (!question.opens_at || !question.closes_at) return "draft";
  if (realNow < new Date(question.opens_at)) return "scheduled";
  return realNow < new Date(question.closes_at) ? "open" : "closed";
}

/** Nettoie les réponses saisies dans le back-office : vides retirées, 2 à 4 (exactement 2 en live). */
export function cleanOptions(raw: string[], kind: BonusQuestionKind): string[] | null {
  const options = raw.map((o) => o.trim()).filter(Boolean);
  if (options.some((o) => o.length > 80)) return null;
  if (kind === "live") return options.length === 2 ? options : null;
  return options.length >= 2 && options.length <= 4 ? options : null;
}

/** Question telle qu'affichée au joueur : avec sa réponse et son état. */
export interface PlayerBonusQuestion {
  id: string;
  raceId: string;
  kind: BonusQuestionKind;
  question: string;
  options: string[];
  state: BonusQuestionState;
  /** Fin de la question (départ de la course pour une question avant le départ). */
  closesAt: string;
  /** Index de la réponse du joueur, null s'il n'a pas répondu. */
  myAnswer: number | null;
  /** Bonne réponse saisie par l'admin, null tant qu'elle ne l'est pas. */
  correctOption: number | null;
}

/** Lignes de score_ledger d'une question notée : BONUS_QUESTION_POINTS pour chaque bonne réponse. */
export function bonusQuestionLedgerRows(
  answers: { user_id: string; option_index: number }[],
  correctOption: number,
  questionId: string,
  seasonId: string
) {
  return answers
    .filter((a) => Number(a.option_index) === correctOption)
    .map((a) => ({
      user_id: a.user_id,
      season_id: seasonId,
      bonus_question_id: questionId,
      points: BONUS_QUESTION_POINTS,
      breakdown: { bonusQuestion: BONUS_QUESTION_POINTS },
    }));
}

/** Questions publiées d'une course, avec la réponse du joueur connecté. */
export async function getRaceBonusQuestions(
  supabase: SupabaseClient,
  race: { id: string; locks_at: string },
  userId: string | null,
  now: Date
): Promise<PlayerBonusQuestion[]> {
  const { data, error } = await supabase
    .from("bonus_questions")
    .select("id, race_id, kind, question, options, opens_at, closes_at, correct_option, created_at")
    .eq("race_id", race.id)
    .order("created_at", { ascending: true });
  if (error) {
    // Migration 0033 pas encore appliquée : la page marche sans questions.
    console.error("getRaceBonusQuestions:", error.message);
    return [];
  }
  const questions = ((data ?? []) as BonusQuestionRow[]).filter((q) => q.kind === "pre_race" || q.opens_at);
  const answers = userId && questions.length ? await getMyAnswers(supabase, userId, questions.map((q) => q.id)) : new Map();
  return questions.map((q) => toPlayerQuestion(q, race.locks_at, now, answers.get(q.id) ?? null));
}

/**
 * Questions live ouvertes maintenant, toutes courses confondues (encadré de l'accueil et pop-up).
 * `unansweredOnly` : seulement celles auxquelles le joueur n'a pas encore répondu.
 */
export async function getOpenLiveQuestions(
  supabase: SupabaseClient,
  userId: string | null,
  realNow: Date = new Date()
): Promise<(PlayerBonusQuestion & { raceLabel: RaceLabelInfo })[]> {
  const iso = realNow.toISOString();
  const { data, error } = await supabase
    .from("bonus_questions")
    .select("id, race_id, kind, question, options, opens_at, closes_at, correct_option, created_at, races(locks_at, format, sex, stages(location, country_code))")
    .eq("kind", "live")
    .lte("opens_at", iso)
    .gt("closes_at", iso)
    .order("closes_at", { ascending: true });
  if (error) {
    console.error("getOpenLiveQuestions:", error.message);
    return [];
  }
  const rows = (data ?? []) as any[];
  const answers = userId && rows.length ? await getMyAnswers(supabase, userId, rows.map((q) => q.id)) : new Map();
  return rows.map((q) => ({
    ...toPlayerQuestion(q, q.races?.locks_at ?? q.closes_at, realNow, answers.get(q.id) ?? null),
    raceLabel: {
      format: q.races?.format ?? "",
      sex: q.races?.sex ?? null,
      location: q.races?.stages?.location ?? "",
      countryCode: q.races?.stages?.country_code ?? "",
    },
  }));
}

export interface RaceLabelInfo {
  format: string;
  sex: string | null;
  location: string;
  countryCode: string;
}

async function getMyAnswers(supabase: SupabaseClient, userId: string, questionIds: string[]): Promise<Map<string, number>> {
  const { data } = await supabase
    .from("bonus_answers")
    .select("question_id, option_index")
    .eq("user_id", userId)
    .in("question_id", questionIds);
  return new Map(((data ?? []) as any[]).map((a) => [a.question_id as string, Number(a.option_index)]));
}

function toPlayerQuestion(q: BonusQuestionRow, raceLocksAt: string, now: Date, myAnswer: number | null): PlayerBonusQuestion {
  return {
    id: q.id,
    raceId: q.race_id,
    kind: q.kind,
    question: q.question,
    options: q.options,
    // Les questions live suivent l'heure réelle, même quand l'admin simule une autre date.
    state: bonusQuestionState(q, raceLocksAt, now, new Date()),
    closesAt: q.kind === "live" ? q.closes_at ?? raceLocksAt : raceLocksAt,
    myAnswer,
    correctOption: q.correct_option ?? null,
  };
}

/**
 * Points des questions bonus rattachées à ces courses (lignes de score_ledger), pour les
 * classements d'étape et de course : même forme que les lignes de course.
 */
export async function getBonusQuestionLedger(
  supabase: SupabaseClient,
  raceIds: string[]
): Promise<{ userId: string; pseudo: string; points: number }[]> {
  if (raceIds.length === 0) return [];
  const { data, error } = await supabase
    .from("score_ledger")
    .select("user_id, points, profiles!inner(pseudo, signup_pending), bonus_questions!inner(race_id)")
    .eq("profiles.signup_pending", false)
    .in("bonus_questions.race_id", raceIds);
  if (error) {
    console.error("getBonusQuestionLedger:", error.message);
    return [];
  }
  return ((data ?? []) as any[]).map((l) => ({ userId: l.user_id, pseudo: l.profiles?.pseudo ?? "?", points: Number(l.points) }));
}

/**
 * Points des questions bonus d'un joueur, par course : ils s'ajoutent au total de la course
 * (page de la course, accueil, Ma saison), comme dans les classements.
 */
export async function getUserBonusQuestionPointsByRace(
  supabase: SupabaseClient,
  userId: string,
  raceIds: string[]
): Promise<Map<string, number>> {
  const byRace = new Map<string, number>();
  if (raceIds.length === 0) return byRace;
  const { data, error } = await supabase
    .from("score_ledger")
    .select("points, bonus_questions!inner(race_id)")
    .eq("user_id", userId)
    .in("bonus_questions.race_id", raceIds);
  if (error) {
    console.error("getUserBonusQuestionPointsByRace:", error.message);
    return byRace;
  }
  for (const row of (data ?? []) as any[]) {
    const raceId = row.bonus_questions?.race_id as string | undefined;
    if (raceId) byRace.set(raceId, (byRace.get(raceId) ?? 0) + Number(row.points));
  }
  return byRace;
}
