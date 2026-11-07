import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { nationFlagEmoji } from "@/lib/nationFlags";
import { getRaceDisplayStatus } from "@/lib/raceStatus";
import { getClock } from "@/lib/clock";
import { PencilIcon, TrashIcon } from "@/components/icons";
import { ConfirmButton } from "./_components/ConfirmButton";
import { SpecialRuleSelect } from "./_components/SpecialRuleSelect";
import {
  RACE_FORMATS,
  RACE_STATUS_LABELS,
  RACE_STATUS_STYLES,
  SPECIAL_RULES,
  formatDateRange,
  formatLockTime,
  raceLabel,
} from "./_components/labels";
import {
  activateSeason,
  createRace,
  createSeason,
  removeSeason,
  removeStage,
  setJokersApplied,
} from "./calendrier/actions";
import { removeRace } from "./races/[raceId]/actions";
import { COURSE_KIND_LABELS, type CourseKind } from "@/lib/velo/courses";
import { VeloImports } from "./velo/VeloImports";

export const dynamic = "force-dynamic";

const inputClass = "rounded border border-border bg-bg px-2 py-1.5 text-sm";
const trashClass =
  "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-red/40 text-red hover:bg-red/10";

/** Calendrier & résultats : saisons, courses et étapes de la saison active, imports vélo. */
export default async function AdminCalendarResultsPage() {
  const admin = createAdminClient();
  const { now } = await getClock();
  const { data: seasons } = await admin.from("seasons").select("*").order("starts_on", { ascending: false });
  const season = (seasons ?? []).find((s) => s.status === "active");

  const [{ data: nations }, { data: stages }] = await Promise.all([
    admin.from("nations").select("*").order("name"),
    season
      ? admin
          .from("stages")
          .select("*, races(id, format, sex, locks_at, special_rule, status, stage_number, start_city, end_city), stage_riders(athlete_id)")
          .eq("season_id", season.id)
          .order("starts_on")
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const sortedStages = (stages ?? []).map((stage: any) => ({
    ...stage,
    races: [...(stage.races ?? [])]
      .sort((a: any, b: any) => new Date(a.locks_at).getTime() - new Date(b.locks_at).getTime())
      .map((race: any) => ({ ...race, displayStatus: getRaceDisplayStatus(race, now) })),
  }));
  // Comme le Calendrier joueur : ouverte par défaut, la première étape dont une course reste à saisir.
  const defaultOpenId = sortedStages.find((s) => s.races.some((r: any) => r.status !== "finished"))?.id;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h1 className="text-xl font-bold">Saisons</h1>

        <div className="flex flex-col gap-2">
          {(seasons ?? []).map((s) => (
            <details key={s.id} className="rounded-xl border border-border bg-card">
              <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
                <div>
                  <div className="text-sm font-semibold">{s.label}</div>
                  <div className="text-xs text-text-dim">
                    {s.starts_on} → {s.ends_on}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {s.status === "active" ? (
                    <span className="rounded-full bg-ice-soft px-3 py-1 text-xs font-semibold text-ice">active</span>
                  ) : (
                    <form action={activateSeason}>
                      <input type="hidden" name="season_id" value={s.id} />
                      <button type="submit" className="rounded border border-border px-3 py-1 text-xs">
                        Activer
                      </button>
                    </form>
                  )}
                  <form action={removeSeason}>
                    <input type="hidden" name="season_id" value={s.id} />
                    <ConfirmButton
                      title="Supprimer la saison"
                      requireText={s.label}
                      message={`Supprimer la saison ${s.label} ? Tout ce qui en dépend sera définitivement effacé : étapes, courses, athlètes, cotes, pronostics, résultats, points, classements, ligues, cartes et Pépites.`}
                      className={trashClass}
                    >
                      <TrashIcon className="h-4 w-4" />
                    </ConfirmButton>
                  </form>
                </div>
              </summary>
              <div className="flex flex-col gap-3 border-t border-border px-4 py-3">
                <form action={setJokersApplied} className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
                  <input type="hidden" name="season_id" value={s.id} />
                  <input type="hidden" name="applied" value={s.jokers_applied ? "0" : "1"} />
                  <div className="flex-1 text-xs text-text-dim">
                    <b className="text-frost">Jokers de fin de saison</b> : {s.jokers_applied ? "appliqués au classement." : "pas encore appliqués."}{" "}
                    Les 3 plus mauvaises courses individuelles et les 2 plus mauvais relais de chaque joueur (hors
                    Mondiaux/JO, courses non jouées d&apos;abord) sont retirés du classement. À activer quand la dernière
                    course est notée ; les joueurs en voient l&apos;aperçu dans Ma saison.
                  </div>
                  <ConfirmButton
                    message={
                      s.jokers_applied
                        ? "Retirer les jokers du classement ?"
                        : "Appliquer les jokers de fin de saison au classement ? (réversible)"
                    }
                    className="rounded border border-border px-3 py-1 text-xs"
                  >
                    {s.jokers_applied ? "Retirer les jokers" : "Appliquer les jokers"}
                  </ConfirmButton>
                </form>
              </div>
            </details>
          ))}
          {(!seasons || seasons.length === 0) && (
            <p className="text-sm text-text-dim">Aucune saison. Crée-en une ci-dessous pour commencer.</p>
          )}
        </div>

        <details className="rounded-xl border border-border bg-card p-4">
          <summary className="cursor-pointer text-xs font-semibold text-text-dim">Nouvelle saison</summary>
          <form action={createSeason} className="mt-3 flex flex-wrap gap-2">
            <input name="label" required placeholder="Label (ex. 2026-27)" className={inputClass} />
            <input name="starts_on" type="date" required className={inputClass} />
            <input name="ends_on" type="date" required className={inputClass} />
            <button type="submit" className="rounded bg-ice px-4 py-1.5 text-sm font-bold text-on-ice">
              Créer
            </button>
          </form>
        </details>
      </section>

      {!season ? (
        <p className="text-sm text-text-dim">Active une saison pour gérer ses étapes, ses courses et leurs résultats.</p>
      ) : (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">Courses & étapes — {season.label}</h2>

          <div className="flex flex-col gap-2">
            {sortedStages.map((stage) => {
              const done = stage.races.filter((r: any) => r.status === "finished").length;
              return (
                <details key={stage.id} open={stage.id === defaultOpenId} className="rounded-xl border border-border bg-card">
                  <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <div className="text-sm font-semibold">
                        {nationFlagEmoji(stage.country_code)} {stage.name ?? stage.location}
                        <span className="ml-2 text-xs font-normal text-text-dim">{COURSE_KIND_LABELS[stage.kind as CourseKind] ?? ""}</span>
                        {stage.coefficient === 2 && <span className="ml-2 text-xs text-gold">×2</span>}
                        {stage.counts_in_standings === false && (
                          <span className="ml-2 text-xs text-text-dim">Autre (×0, hors classement)</span>
                        )}
                      </div>
                      <div className="text-xs text-text-dim">
                        {stage.kind === "one_day" ? formatDateRange(stage.starts_on, stage.starts_on) : formatDateRange(stage.starts_on, stage.ends_on)}
                        {(stage.rest_days ?? []).length > 0 && ` · ${stage.rest_days.length} repos`}
                        {` · ${(stage.stage_riders ?? []).length} engagé(s)`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-text-dim">
                        {done}/{stage.races.length} résultat(s) saisi(s)
                      </span>
                      {stage.kind === "bonus_event" && (
                        <Link href={`/admin/champions/${stage.id}`} className="rounded-full border border-gold/50 px-2.5 py-1 text-xs font-semibold text-gold">
                          🏆 WE des Champions
                        </Link>
                      )}
                      <Link
                        href={`/admin/stages/${stage.id}`}
                        title="Modifier la course"
                        aria-label="Modifier la course"
                        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-border text-text-dim hover:text-ice"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </Link>
                      <form action={removeStage}>
                        <input type="hidden" name="stage_id" value={stage.id} />
                        <ConfirmButton
                          title="Supprimer la course"
                          message={`Supprimer ${stage.name ?? stage.location} et ses ${stage.races.length} étape(s) ? Leurs pronostics, résultats et points seront effacés.`}
                          className={trashClass}
                        >
                          <TrashIcon className="h-4 w-4" />
                        </ConfirmButton>
                      </form>
                    </div>
                  </summary>

                  <div className="flex flex-col gap-1 border-t border-border px-3 py-3">
                    {stage.races.map((race: any) => (
                      <div key={race.id} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-bg">
                        <Link href={`/admin/races/${race.id}`} className="min-w-0 flex-1">
                          <div className="text-sm font-semibold">
                            {raceLabel(race)}
                            {race.special_rule && (
                              <span className="ml-2 text-xs font-normal text-gold">
                                {SPECIAL_RULES.find((r) => r.value === race.special_rule)?.label}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-text-dim">
                            {formatLockTime(race.locks_at)}
                            {race.start_city && ` · ${race.start_city}${race.end_city && race.end_city !== race.start_city ? ` → ${race.end_city}` : ""}`}
                          </div>
                        </Link>
                        <span
                          className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${RACE_STATUS_STYLES[race.displayStatus]}`}
                        >
                          {RACE_STATUS_LABELS[race.displayStatus]}
                        </span>
                        <Link
                          href={`/admin/races/${race.id}`}
                          title="Modifier l'étape et saisir les résultats"
                          aria-label="Modifier l'étape et saisir les résultats"
                          className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-text-dim hover:text-ice"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </Link>
                        <form action={removeRace}>
                          <input type="hidden" name="race_id" value={race.id} />
                          <ConfirmButton
                            title="Supprimer l'étape"
                            message={`Supprimer ${raceLabel(race)} (${stage.name ?? stage.location}) ? Ses pronostics, résultats et points seront effacés.`}
                            className={trashClass}
                          >
                            <TrashIcon className="h-4 w-4" />
                          </ConfirmButton>
                        </form>
                      </div>
                    ))}
                    {stage.races.length === 0 && <p className="px-2 text-xs text-text-dim">Aucune étape : importe le fichier des étapes ci-dessous.</p>}

                    <form action={createRace} className="mt-2 flex flex-wrap gap-2 border-t border-border/50 px-2 pt-3">
                      <input type="hidden" name="stage_id" value={stage.id} />
                      <input name="stage_number" type="number" min={0} placeholder="N°" title="Numéro (0 = prologue)" className={`${inputClass} w-16`} />
                      <select name="format" required className={inputClass}>
                        {RACE_FORMATS.map((f) => (
                          <option key={f.value} value={f.value}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                      <input name="start_city" placeholder="Départ" className={`${inputClass} w-32`} />
                      <input name="end_city" placeholder="Arrivée" className={`${inputClass} w-32`} />
                      <input
                        name="locks_at"
                        type="datetime-local"
                        required
                        title="Heure de départ (= verrouillage), heure de Paris"
                        className={inputClass}
                      />
                      <SpecialRuleSelect defaultFormat={RACE_FORMATS[0].value} championship={stage.coefficient === 2} className={inputClass} />
                      <button type="submit" className="rounded border border-border px-3 py-1.5 text-xs">
                        Ajouter l&apos;étape
                      </button>
                    </form>
                  </div>
                </details>
              );
            })}

            {sortedStages.length === 0 && (
              <p className="text-sm text-text-dim">Aucune course pour cette saison : importe le calendrier ci-dessous.</p>
            )}
          </div>

          <VeloImports seasonId={season.id} courses={sortedStages.map((c) => ({ id: c.id, label: `${c.name ?? c.location} (${c.starts_on})` }))} />
        </section>
      )}
    </div>
  );
}
