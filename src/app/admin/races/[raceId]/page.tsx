import { fullAthleteName } from "@/lib/athleteName";
import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { ResultsForm, type CandidateRow } from "./ResultsForm";
import { SpecialRuleSelect } from "../../_components/SpecialRuleSelect";
import {
  RACE_FORMATS,
  RACE_STATUS_LABELS,
  RACE_STATUS_STYLES,
  RELAY_FORMATS,
  SPECIAL_RULES,
  raceLabel,
  toDateTimeLocalUtc,
} from "../../_components/labels";
import { ConfirmButton } from "../../_components/ConfirmButton";
import { getRaceDisplayStatus } from "@/lib/raceStatus";
import { getClock } from "@/lib/clock";
import { removeRace, resetResults, updateRace, updateRaceOpinion } from "./actions";
import { ArrowLeftIcon } from "@/components/icons";
import { START_LIST_FORMATS, getStartList } from "@/lib/startList";
import { StartListPanel } from "./StartListPanel";
import { BonusQuestionsPanel, type AdminBonusQuestion } from "./BonusQuestionsPanel";
import { bonusQuestionState, type BonusQuestionRow } from "@/lib/bonusQuestions";

const inputClass = "rounded border border-border bg-bg px-2 py-1.5 text-sm";

export const dynamic = "force-dynamic";

export default async function AdminRacePage({ params }: { params: Promise<{ raceId: string }> }) {
  const { raceId } = await params;
  const admin = createAdminClient();

  const { data: race } = await admin
    .from("races")
    .select("*, stages(location, season_id, coefficient)")
    .eq("id", raceId)
    .single();
  if (!race) notFound();

  const stage = race.stages as { location: string; season_id: string; coefficient: number };
  const isRelay = RELAY_FORMATS.includes(race.format);

  const { data: existingResults } = await admin.from("race_results").select("*").eq("race_id", raceId);

  let candidates: CandidateRow[];

  if (isRelay) {
    const resultByNationCode = new Map((existingResults ?? []).map((r) => [r.nation_code, r]));

    const { data: odds } = await admin
      .from("odds")
      .select("nation_code, value, nations(name)")
      .eq("season_id", stage.season_id)
      .eq("stage_id", race.stage_id) // cotes propres à la course (VéloPronos, 0045)
      .eq("format", race.format)
      .is("valid_until", null);

    candidates = (odds ?? [])
      .map((o: any) => {
        const existing = resultByNationCode.get(o.nation_code);
        return {
          id: o.nation_code,
          name: o.nations?.name ?? o.nation_code,
          subtitle: o.nation_code,
          nationCode: o.nation_code,
          nationName: o.nations?.name ?? undefined,
          odds: o.value,
          existingResult: existing
            ? {
                rank: existing.rank,
                timeGapSeconds: existing.time_gap_seconds,
                penaltyLaps: existing.penalty_laps,
                shootings: existing.shootings ?? null,
                skiRank: existing.ski_rank ?? (existing.is_fusee ? 1 : null),
                isGachette: existing.is_gachette,
              }
            : undefined,
        };
      })
      .sort((a, b) => a.odds - b.odds);
  } else {
    const resultByAthleteId = new Map((existingResults ?? []).map((r) => [r.athlete_id, r]));

    const { data: odds } = await admin
      .from("odds")
      .select("athlete_id, value, athletes(first_name, last_name, nation_code, sex)")
      .eq("season_id", stage.season_id)
      .eq("stage_id", race.stage_id) // cotes propres à la course (VéloPronos, 0045)
      .eq("format", race.format)
      .is("valid_until", null);

    candidates = (odds ?? [])
      .filter((o: any) => !race.sex || o.athletes?.sex === race.sex)
      .map((o: any) => {
        const existing = resultByAthleteId.get(o.athlete_id);
        return {
          id: o.athlete_id,
          name: fullAthleteName(o.athletes),
          subtitle: o.athletes?.nation_code ?? "",
          firstName: o.athletes?.first_name ?? "",
          lastName: o.athletes?.last_name ?? "",
          nationCode: o.athletes?.nation_code ?? "",
          odds: o.value,
          existingResult: existing
            ? {
                rank: existing.rank,
                timeGapSeconds: existing.time_gap_seconds,
                penaltyLaps: existing.penalty_laps,
                shootings: existing.shootings ?? null,
                skiRank: existing.ski_rank ?? (existing.is_fusee ? 1 : null),
                isGachette: existing.is_gachette,
              }
            : undefined,
        };
      })
      .sort((a, b) => a.odds - b.odds);
  }

  const { now } = await getClock();
  const displayStatus = getRaceDisplayStatus(race, now);
  const hasResults = (existingResults ?? []).length > 0 || race.status === "finished";
  const startList = START_LIST_FORMATS.includes(race.format) ? await getStartList(admin, race) : null;
  const bonusQuestions = await getAdminBonusQuestions(admin, race, now);

  return (
    <div className="flex flex-col gap-4">
      <BackLinks raceId={race.id} />
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">
          {raceLabel(race)} — {stage.location}
        </h1>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${RACE_STATUS_STYLES[displayStatus]}`}>
          {RACE_STATUS_LABELS[displayStatus]}
        </span>
      </div>

      <form action={updateRace} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
        <div className="text-sm font-semibold">Infos de la course</div>
        <input type="hidden" name="race_id" value={race.id} />
        <div className="flex flex-wrap gap-2">
          <select name="format" defaultValue={race.format} className={inputClass}>
            {RACE_FORMATS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <select name="sex" defaultValue={race.sex ?? ""} className={inputClass}>
            <option value="F">Femmes</option>
            <option value="H">Hommes</option>
            <option value="">— (relais)</option>
          </select>
          <input
            name="locks_at"
            type="datetime-local"
            required
            defaultValue={toDateTimeLocalUtc(race.locks_at)}
            title="Heure de départ (= verrouillage), en UTC"
            className={inputClass}
          />
          <SpecialRuleSelect defaultValue={race.special_rule ?? ""} defaultFormat={race.format} championship={stage.coefficient === 2} className={inputClass} />
          <button type="submit" className="rounded bg-ice px-4 py-1.5 text-sm font-bold text-on-ice">
            Enregistrer
          </button>
        </div>
        <p className="text-xs text-text-dim">Heure de départ en UTC : c&apos;est aussi l&apos;heure de verrouillage des pronostics.</p>
      </form>

      <form action={updateRaceOpinion} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
        <div className="text-sm font-semibold">L&apos;avis de Biathlonpronos</div>
        <input type="hidden" name="race_id" value={race.id} />
        <textarea
          name="opinion"
          rows={4}
          defaultValue={race.opinion ?? ""}
          placeholder="Ton commentaire sur la course (favoris, pièges, météo…)"
          className={`${inputClass} w-full`}
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-text-dim">Affiché dans un encadré sur la page de la course. Laisse vide pour masquer la rubrique.</p>
          <button type="submit" className="flex-shrink-0 rounded bg-ice px-4 py-1.5 text-sm font-bold text-on-ice">
            Enregistrer
          </button>
        </div>
      </form>

      {startList && <StartListPanel raceId={race.id} format={race.format} startList={startList} />}

      <BonusQuestionsPanel raceId={race.id} questions={bonusQuestions} />

      {candidates.length === 0 ? (
        <p className="text-sm text-text-dim">
          Aucune cote saisie pour ce format (voir Athlètes & cotes) —
          impossible de noter la course.
        </p>
      ) : (
        <ResultsForm
          key={`${race.status}-${(existingResults ?? []).length}`}
          raceId={raceId}
          mode={isRelay ? "nation" : "athlete"}
          format={race.format}
          specialRule={race.special_rule}
          candidates={candidates}
        />
      )}

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        {hasResults && (
          <form action={resetResults}>
            <input type="hidden" name="race_id" value={race.id} />
            <ConfirmButton
              message="Réinitialiser les résultats de cette course ? Les résultats saisis et les points des joueurs sur cette course seront effacés."
              className="rounded border border-gold/60 px-4 py-1.5 text-sm text-gold hover:bg-gold/10"
            >
              Réinitialiser les résultats
            </ConfirmButton>
          </form>
        )}
        <form action={removeRace}>
          <input type="hidden" name="race_id" value={race.id} />
          <input type="hidden" name="redirect" value="1" />
          <ConfirmButton
            message="Supprimer cette course ? Ses pronostics, résultats et points seront effacés."
            className="rounded border border-red/50 px-4 py-1.5 text-sm text-red hover:bg-red/10"
          >
            Supprimer la course
          </ConfirmButton>
        </form>
      </div>
    </div>
  );
}

/** Questions bonus de la course, brouillons compris, avec le nombre de réponses par option. */
async function getAdminBonusQuestions(
  admin: ReturnType<typeof createAdminClient>,
  race: { id: string; locks_at: string },
  now: Date
): Promise<AdminBonusQuestion[]> {
  const { data, error } = await admin
    .from("bonus_questions")
    .select("id, race_id, kind, question, options, opens_at, closes_at, correct_option, created_at")
    .eq("race_id", race.id)
    .order("created_at", { ascending: true });
  if (error) {
    // Migration 0033 pas encore appliquée.
    console.error("getAdminBonusQuestions:", error.message);
    return [];
  }
  const questions = (data ?? []) as BonusQuestionRow[];
  const { data: answers } = questions.length
    ? await admin.from("bonus_answers").select("question_id, option_index").in("question_id", questions.map((q) => q.id))
    : { data: [] as any[] };
  return questions.map((q) => {
    const counts = q.options.map(() => 0);
    for (const a of (answers ?? []) as any[]) if (a.question_id === q.id && counts[a.option_index] != null) counts[a.option_index]++;
    return {
      id: q.id,
      kind: q.kind,
      question: q.question,
      options: q.options,
      state: bonusQuestionState(q, race.locks_at, now, new Date()),
      closesAt: q.closes_at,
      correctOption: q.correct_option ?? null,
      counts,
    };
  });
}

function BackLinks({ raceId }: { raceId: string }) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      {/* Page publique de la course : classement et points une fois la course notée. */}
      <Link
        href={`/courses/${raceId}`}
        className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-semibold text-frost hover:text-ice"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Voir la course et son classement
      </Link>
      <Link href="/admin" className="text-sm text-text-dim underline">
        Retour au calendrier
      </Link>
    </div>
  );
}
