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
  toDateTimeLocalParis,
} from "../../_components/labels";
import { ConfirmButton } from "../../_components/ConfirmButton";
import { getRaceDisplayStatus } from "@/lib/raceStatus";
import { getClock } from "@/lib/clock";
import { removeRace, removeStageProfile, resetResults, updateCombatif, updateRace, updateRaceOpinion, uploadStageProfile } from "./actions";
import { ArrowLeftIcon } from "@/components/icons";
import { START_LIST_FORMATS, getStartList } from "@/lib/startList";
import { StartListPanel } from "./StartListPanel";
import { BonusQuestionsPanel, type AdminBonusQuestion } from "./BonusQuestionsPanel";
import { bonusQuestionState, type BonusQuestionRow } from "@/lib/bonusQuestions";

const inputClass = "rounded border border-border bg-bg px-2 py-1.5 text-sm";

export const dynamic = "force-dynamic";
// Récupération des résultats par IA (recherche web) : une à deux minutes, au-delà du délai par défaut.
export const maxDuration = 300;

export default async function AdminRacePage({ params }: { params: Promise<{ raceId: string }> }) {
  const { raceId } = await params;
  const admin = createAdminClient();

  const { data: race } = await admin
    .from("races")
    .select("*, stages(name, location, season_id, coefficient)")
    .eq("id", raceId)
    .single();
  if (!race) notFound();

  const stage = race.stages as { name: string | null; location: string; season_id: string; coefficient: number };
  const isRelay = RELAY_FORMATS.includes(race.format);

  const { data: existingResults } = await admin.from("race_results").select("*").eq("race_id", raceId);

  let candidates: CandidateRow[];

  const isTeamRace = race.format === "clm_equipes";

  if (isTeamRace) {
    // CLM par équipes : les équipes qui ont une cote « CLM par équipes » pour la course.
    const resultByTeamId = new Map((existingResults ?? []).map((r) => [r.team_id, r]));
    const { data: odds } = await admin
      .from("odds")
      .select("team_id, value, teams(code, name)")
      .eq("stage_id", race.stage_id)
      .eq("format", race.format)
      .is("valid_until", null)
      .not("team_id", "is", null);
    candidates = (odds ?? [])
      .map((o: any) => {
        const existing = resultByTeamId.get(o.team_id);
        return {
          id: o.team_id,
          name: o.teams?.name ?? o.team_id,
          subtitle: o.teams?.code ?? "",
          nationCode: o.teams?.code ?? "",
          nationName: o.teams?.name ?? undefined,
          odds: o.value,
          existingResult: existing
            ? { rank: existing.rank, timeGapSeconds: null, penaltyLaps: 0, shootings: null, skiRank: null, isGachette: false }
            : undefined,
        };
      })
      .sort((a, b) => a.odds - b.odds);
  } else if (isRelay) {
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
  // Engagés de la course, pour le combatif du jour (VéloPronos).
  const { data: entries } = await admin
    .from("stage_riders")
    .select("athlete_id, bib, athletes(first_name, last_name)")
    .eq("stage_id", race.stage_id);
  const riders = ((entries ?? []) as any[])
    .filter((e) => e.athletes)
    .sort((a, b) => (a.bib ?? 9999) - (b.bib ?? 9999));

  return (
    <div className="flex flex-col gap-4">
      <BackLinks raceId={race.id} />
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">
          {raceLabel(race)} — {stage.name ?? stage.location}
        </h1>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${RACE_STATUS_STYLES[displayStatus]}`}>
          {RACE_STATUS_LABELS[displayStatus]}
        </span>
      </div>

      <form action={updateRace} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
        <div className="text-sm font-semibold">Infos de l&apos;étape</div>
        <input type="hidden" name="race_id" value={race.id} />
        <div className="flex flex-wrap gap-2">
          <input name="stage_number" type="number" min={0} defaultValue={race.stage_number ?? ""} placeholder="N°" title="Numéro (0 = prologue)" className={`${inputClass} w-16`} />
          <select name="format" defaultValue={race.format} className={inputClass}>
            {RACE_FORMATS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <input name="start_city" defaultValue={race.start_city ?? ""} placeholder="Départ" className={inputClass} />
          <input name="end_city" defaultValue={race.end_city ?? ""} placeholder="Arrivée" className={inputClass} />
          <input name="distance_km" type="number" step="0.1" min={0} defaultValue={race.distance_km ?? ""} placeholder="km" className={`${inputClass} w-20`} />
          <input name="elevation_m" type="number" min={0} defaultValue={race.elevation_m ?? ""} placeholder="D+ (m)" className={`${inputClass} w-24`} />
          <input
            name="country_code"
            defaultValue={race.country_code ?? ""}
            placeholder="Pays (ESP)"
            maxLength={3}
            title="Pays de l'étape (code à 3 lettres) : petit drapeau dans le calendrier"
            className={`${inputClass} w-24 uppercase`}
          />
          <input
            name="locks_at"
            type="datetime-local"
            required
            defaultValue={toDateTimeLocalParis(race.locks_at)}
            title="Heure de départ (= verrouillage), heure de Paris"
            className={inputClass}
          />
          <SpecialRuleSelect defaultValue={race.special_rule ?? ""} defaultFormat={race.format} championship={stage.coefficient === 2} className={inputClass} />
          <button type="submit" className="rounded bg-ice px-4 py-1.5 text-sm font-bold text-on-ice">
            Enregistrer
          </button>
        </div>
        <p className="text-xs text-text-dim">Heure de départ en heure de Paris : c&apos;est aussi l&apos;heure de verrouillage des pronostics.</p>
      </form>

      <section className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
        <div className="text-sm font-semibold">Profil de l&apos;étape</div>
        {race.profile_image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={race.profile_image_url} alt="Profil de l'étape" className="max-h-64 w-full rounded-lg border border-border bg-white object-contain" />
        )}
        <form action={uploadStageProfile} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="race_id" value={race.id} />
          <input name="profile" type="file" required accept="image/png,image/jpeg,image/webp" className="text-xs" />
          <button type="submit" className="rounded bg-ice px-4 py-1.5 text-sm font-bold text-on-ice">
            {race.profile_image_url ? "Remplacer" : "Envoyer"}
          </button>
        </form>
        {race.profile_image_url && (
          <form action={removeStageProfile}>
            <input type="hidden" name="race_id" value={race.id} />
            <button type="submit" className="rounded border border-red/50 px-3 py-1 text-xs text-red">
              Retirer le profil
            </button>
          </form>
        )}
        <p className="text-xs text-text-dim">PNG ou JPG, 5 Mo maximum. Affiché au-dessus de « L&apos;avis de VéloPronos » sur la page de l&apos;étape.</p>
      </section>

      <form action={updateRaceOpinion} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
        <div className="text-sm font-semibold">L&apos;avis de VéloPronos</div>
        <input type="hidden" name="race_id" value={race.id} />
        <textarea
          name="opinion"
          rows={4}
          defaultValue={race.opinion ?? ""}
          placeholder="Ton commentaire sur l'étape (favoris, pièges, météo…)"
          className={`${inputClass} w-full`}
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-text-dim">Affiché dans un encadré sur la page de l&apos;étape. Laisse vide pour masquer la rubrique.</p>
          <button type="submit" className="flex-shrink-0 rounded bg-ice px-4 py-1.5 text-sm font-bold text-on-ice">
            Enregistrer
          </button>
        </div>
      </form>

      {startList && <StartListPanel raceId={race.id} format={race.format} startList={startList} />}

      <BonusQuestionsPanel raceId={race.id} questions={bonusQuestions} />

      {candidates.length === 0 ? (
        <p className="text-sm text-text-dim">
          {isTeamRace
            ? "Aucune équipe n'a de cote « CLM par équipes » pour cette course (onglet Coureurs & cotes, ou import des équipes) : impossible de noter l'étape."
            : "Aucune cote de ce type d'étape pour les coureurs de la course (onglet Calendrier, import des coureurs) : impossible de noter l'étape."}
        </p>
      ) : (
        <ResultsForm
          key={`${race.status}-${(existingResults ?? []).length}`}
          raceId={raceId}
          mode={isTeamRace ? "team" : isRelay ? "nation" : "athlete"}
          format={race.format}
          specialRule={race.special_rule}
          candidates={candidates}
        />
      )}

      {race.format !== "clm_equipes" && riders.length > 0 && (
        <form action={updateCombatif} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-4">
          <input type="hidden" name="race_id" value={race.id} />
          <span className="text-sm font-semibold">Combatif du jour</span>
          <select name="combatif_athlete_id" defaultValue={race.combatif_athlete_id ?? ""} className={inputClass}>
            <option value="">— Aucun —</option>
            {riders.map((e) => (
              <option key={e.athlete_id} value={e.athlete_id}>
                {e.bib ? `${e.bib} · ` : ""}
                {fullAthleteName(e.athletes)}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded bg-ice px-4 py-1.5 text-sm font-bold text-on-ice">
            Enregistrer
          </button>
          <p className="w-full text-xs text-text-dim">
            +50 (doublé par le ×2) aux joueurs dont le super combatif pronostiqué est ce coureur. Une étape déjà notée est renotée.
          </p>
        </form>
      )}

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        {hasResults && (
          <form action={resetResults}>
            <input type="hidden" name="race_id" value={race.id} />
            <ConfirmButton
              message="Réinitialiser les résultats de cette étape ? Les résultats saisis et les points des joueurs sur cette étape seront effacés."
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
            message="Supprimer cette étape ? Ses pronostics, résultats et points seront effacés."
            className="rounded border border-red/50 px-4 py-1.5 text-sm text-red hover:bg-red/10"
          >
            Supprimer l&apos;étape
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
        Voir l&apos;étape et son classement
      </Link>
      <Link href="/admin" className="text-sm text-text-dim underline">
        Retour au calendrier
      </Link>
    </div>
  );
}
