import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/admin/fetchAll";
import { fullAthleteName } from "@/lib/athleteName";
import { nationFlagEmoji } from "@/lib/nationFlags";
import { ConfirmButton } from "../_components/ConfirmButton";
import { formatLockTime, raceLabel } from "../_components/labels";
import { COURSE_KIND_LABELS, JERSEY_ODDS_FORMAT, type CourseKind, type JerseyType } from "@/lib/velo/courses";
import {
  addCourseRider,
  createTeam,
  fillOddsFromSeason,
  removeCourseRider,
  saveStartlistPrioritySite,
  saveStartlistSettings,
  syncStartlistNow,
  updateCourseRider,
  updateCourseTeam,
} from "./actions";
import { DEFAULT_STARTLIST_SITE } from "@/lib/velo/aiStartlist";

export const dynamic = "force-dynamic";

const inputClass = "rounded border border-border bg-bg px-2 py-1.5 text-sm";
const oddsInputClass = "w-14 rounded border border-border bg-card px-1.5 py-1 text-sm";

const STAGE_TYPE_COLUMNS = [
  { format: "sprint", label: "Sprint" },
  { format: "montagne", label: "Mont." },
  { format: "clm", label: "CLM" },
  { format: "baroudeurs", label: "Baroud." },
  { format: "classique", label: "Classique" },
];

const JERSEY_COLUMNS: Array<{ jersey: JerseyType; label: string }> = [
  { jersey: "general", label: "MJ" },
  { jersey: "points", label: "MV" },
  { jersey: "montagne", label: "MP" },
  { jersey: "jeune", label: "MJeune" },
  { jersey: "combatif", label: "SC" },
];

type OddsMap = Record<string, number>;

export default async function AdminRidersPage({
  searchParams,
}: {
  searchParams: Promise<{ course?: string; equipe?: string }>;
}) {
  const { course: courseParam = "", equipe: teamFilter = "" } = await searchParams;
  const admin = createAdminClient();

  const { data: season } = await admin.from("seasons").select("id, label").eq("status", "active").maybeSingle();
  if (!season) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-bold">Coureurs & cotes</h1>
        <p className="text-sm text-text-dim">
          Aucune saison active. <Link href="/admin" className="underline">Active une saison</Link> d&apos;abord.
        </p>
      </div>
    );
  }

  const { data: courses } = await admin
    .from("stages")
    .select("id, name, location, kind, jerseys, starts_on, ends_on, stage_riders(athlete_id)")
    .eq("season_id", season.id)
    .order("starts_on");
  const allCourses = courses ?? [];

  // Course affichée : celle demandée, sinon la prochaine (ou en cours) qui a des engagés, sinon la première.
  const today = new Date().toISOString().slice(0, 10);
  const course =
    allCourses.find((c) => c.id === courseParam) ??
    allCourses.find((c) => (c.ends_on ?? c.starts_on) >= today && (c.stage_riders ?? []).length > 0) ??
    allCourses.find((c) => (c.stage_riders ?? []).length > 0) ??
    allCourses[0];

  const courseSelector = (
    <form method="get" className="flex flex-wrap items-center gap-2">
      <select name="course" defaultValue={course?.id ?? ""} className={inputClass}>
        {allCourses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name ?? c.location} ({(c.stage_riders ?? []).length} coureurs)
          </option>
        ))}
      </select>
      <button type="submit" className="rounded bg-ice px-4 py-1.5 text-sm font-bold text-on-ice">
        Afficher
      </button>
    </form>
  );

  if (!course) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-bold">Coureurs & cotes — {season.label}</h1>
        <p className="text-sm text-text-dim">
          Aucune course : importe d&apos;abord le calendrier (onglet <Link href="/admin" className="underline">Calendrier</Link>).
        </p>
      </div>
    );
  }

  // Startlist par IA (migration 0058) : lue à part pour que la page marche sans la migration.
  const [{ data: startlistInfo }, { data: seasonStartlist }] = await Promise.all([
    admin.from("stages").select("startlist_url, startlist_auto, startlist_synced_at, startlist_report").eq("id", course.id).maybeSingle(),
    admin.from("seasons").select("startlist_priority_site").eq("id", season.id).maybeSingle(),
  ]);

  const [{ data: entries }, { data: teams }, { data: races }, odds] = await Promise.all([
    admin
      .from("stage_riders")
      .select("athlete_id, bib, abandoned_race_id, athletes(id, first_name, last_name, nation_code, team_id)")
      .eq("stage_id", course.id),
    admin.from("teams").select("id, code, name").eq("season_id", season.id).order("name"),
    admin.from("races").select("id, format, stage_number, locks_at").eq("stage_id", course.id).order("locks_at"),
    fetchAll((from, to) =>
      admin
        .from("odds")
        .select("athlete_id, team_id, format, value")
        .eq("stage_id", course.id)
        .is("valid_until", null)
        .order("id")
        .range(from, to)
    ),
  ]);

  const athleteOdds = new Map<string, OddsMap>();
  const teamOdds = new Map<string, OddsMap>();
  for (const o of odds) {
    if (o.athlete_id) athleteOdds.set(o.athlete_id, { ...athleteOdds.get(o.athlete_id), [o.format]: o.value });
    else if (o.team_id) teamOdds.set(o.team_id, { ...teamOdds.get(o.team_id), [o.format]: o.value });
  }

  // Colonnes utiles pour cette course : les types de ses étapes et ses maillots.
  const courseTypes = new Set((races ?? []).map((r) => r.format));
  const typeColumns = STAGE_TYPE_COLUMNS.filter((c) => courseTypes.size === 0 || courseTypes.has(c.format));
  const jerseys = new Set((course.jerseys ?? []) as JerseyType[]);
  const jerseyColumns = JERSEY_COLUMNS.filter((c) => jerseys.has(c.jersey)).map((c) => ({ format: JERSEY_ODDS_FORMAT[c.jersey], label: c.label }));
  const riderColumns = [...typeColumns, ...jerseyColumns];
  const teamColumns = [
    ...(jerseys.has("equipe") ? [{ format: "meilleure_equipe", label: "Meilleure équipe" }] : []),
    ...(courseTypes.has("clm_equipes") ? [{ format: "clm_equipes", label: "CLM par équipes" }] : []),
  ];

  type Rider = { id: string; first_name: string; last_name: string; nation_code: string; team_id: string | null; bib: number | null; abandoned_race_id: string | null };
  const riders: Rider[] = (entries ?? [])
    .map((e: any) => ({ ...e.athletes, bib: e.bib, abandoned_race_id: e.abandoned_race_id }))
    .filter((r: any) => r.id)
    .sort((a: Rider, b: Rider) => (a.bib ?? 9999) - (b.bib ?? 9999) || a.last_name.localeCompare(b.last_name));

  const teamById = new Map((teams ?? []).map((t) => [t.id, t]));
  const ridersByTeam = new Map<string, Rider[]>();
  for (const r of riders) {
    const key = r.team_id ?? "";
    ridersByTeam.set(key, [...(ridersByTeam.get(key) ?? []), r]);
  }
  const courseTeams = [...ridersByTeam.keys()]
    .map((id) => ({ id, code: teamById.get(id)?.code ?? "", name: teamById.get(id)?.name ?? "Sans équipe" }))
    .sort((a, b) => (a.id === "" ? 1 : b.id === "" ? -1 : a.name.localeCompare(b.name)))
    .filter((t) => !teamFilter || t.code === teamFilter);
  const abandons = riders.filter((r) => r.abandoned_race_id).length;
  const withoutOdds = riders.filter((r) => !athleteOdds.has(r.id)).length;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-bold">Coureurs & cotes — {season.label}</h1>
      {courseSelector}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-dim">
        <span className="font-semibold text-text">{course.name ?? course.location}</span>
        <span>{COURSE_KIND_LABELS[course.kind as CourseKind] ?? ""}</span>
        <span>
          {riders.length} coureur(s) · {ridersByTeam.size - (ridersByTeam.has("") ? 1 : 0)} équipe(s) · {abandons} abandon(s)
          {withoutOdds > 0 && ` · ${withoutOdds} sans cote`}
        </span>
        <a href={`/admin/athletes/export?course=${course.id}`} className="underline">
          Télécharger le CSV de la course
        </a>
        {riders.length > 0 && (
          <form action={fillOddsFromSeason}>
            <input type="hidden" name="stage_id" value={course.id} />
            <button type="submit" className="rounded border border-border px-2 py-1 text-xs">
              Compléter avec les cotes de la saison
            </button>
          </form>
        )}
      </div>
      <p className="text-xs text-text-dim">
        Les cotes sont propres à la course. Un coureur engagé sans cote reprend celle de la liste de la saison
        (import « Coureurs de la saison », onglet Calendrier) ; une cote saisie ici n&apos;est jamais écrasée. Une case vidée retire la cote, une cote modifiée garde l&apos;ancienne dans
        l&apos;historique. Pour tout remplacer d&apos;un coup, réimporte le fichier des coureurs (onglet{" "}
        <Link href="/admin" className="underline">Calendrier</Link>, en bas de page). Abandon : choisis l&apos;étape où le
        coureur a quitté la course.
      </p>

      <section className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 text-sm">
        <h2 className="font-semibold">Startlist par IA</h2>
        <p className="text-xs text-text-dim">
          Le lundi 17 h de la semaine de course, puis chaque jour à 17 h et à 7 h le matin du départ, l&apos;IA récupère les
          engagés (noms, équipes, dossards) et met la liste à jour ; les cotes viennent de la liste des coureurs de la saison.
          Rien n&apos;est touché après le départ de la 1re étape.
        </p>
        {startlistInfo ? (
          <>
            <p className="text-xs">
              {startlistInfo.startlist_synced_at
                ? `Dernier passage : ${formatLockTime(startlistInfo.startlist_synced_at)} · ${startlistInfo.startlist_report ?? ""}`
                : "Pas encore de passage pour cette course."}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <form action={syncStartlistNow}>
                <input type="hidden" name="stage_id" value={course.id} />
                <button type="submit" className="rounded bg-ice px-3 py-1.5 text-xs font-bold text-on-ice">
                  Mettre à jour la startlist maintenant (1 à 3 min)
                </button>
              </form>
            </div>
            <form action={saveStartlistSettings} className="flex flex-wrap items-center gap-2 text-xs text-text-dim">
              <input type="hidden" name="stage_id" value={course.id} />
              <input
                name="startlist_url"
                defaultValue={startlistInfo.startlist_url ?? ""}
                placeholder="Page des engagés à lire en premier (facultatif)"
                className={`${inputClass} w-80`}
              />
              <label className="flex items-center gap-1">
                <input type="checkbox" name="startlist_auto" defaultChecked={startlistInfo.startlist_auto !== false} /> Mise à jour automatique
              </label>
              <button type="submit" className="rounded border border-border px-2 py-1 text-xs">
                Enregistrer
              </button>
            </form>
            <form action={saveStartlistPrioritySite} className="flex flex-wrap items-center gap-2 text-xs text-text-dim">
              <input type="hidden" name="season_id" value={season.id} />
              Site prioritaire (toute la saison)
              <input
                name="startlist_priority_site"
                defaultValue={seasonStartlist?.startlist_priority_site ?? ""}
                placeholder={DEFAULT_STARTLIST_SITE}
                className={`${inputClass} w-56`}
              />
              <button type="submit" className="rounded border border-border px-2 py-1 text-xs">
                Enregistrer
              </button>
            </form>
          </>
        ) : (
          <p className="text-xs text-text-dim">Colle la migration 0058 dans Supabase pour activer la startlist par IA.</p>
        )}
      </section>

      <details className="rounded-xl border border-border bg-card p-4">
        <summary className="cursor-pointer text-xs font-semibold text-text-dim">Ajouter un coureur ou une équipe</summary>
        <form action={addCourseRider} className="mt-3 flex flex-wrap gap-2">
          <input type="hidden" name="stage_id" value={course.id} />
          <input name="bib" type="number" min={1} placeholder="Dossard" className={`${inputClass} w-24`} />
          <input name="first_name" required placeholder="Prénom" className={inputClass} />
          <input name="last_name" required placeholder="Nom" className={inputClass} />
          <input name="nation_code" required placeholder="Nation (FRA)" maxLength={3} className={`${inputClass} w-28`} />
          <select name="team_id" defaultValue="" className={inputClass}>
            <option value="">Sans équipe</option>
            {(teams ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.code})
              </option>
            ))}
          </select>
          <button type="submit" className="rounded bg-ice px-4 py-1.5 text-sm font-bold text-on-ice">
            Engager le coureur
          </button>
        </form>
        <form action={createTeam} className="mt-3 flex flex-wrap gap-2 border-t border-border/50 pt-3">
          <input type="hidden" name="season_id" value={season.id} />
          <input name="code" required placeholder="Code (ex. UAD)" maxLength={4} className={`${inputClass} w-28`} />
          <input name="name" placeholder="Nom complet" className={inputClass} />
          <button type="submit" className="rounded border border-border px-3 py-1.5 text-xs">
            Ajouter l&apos;équipe
          </button>
        </form>
      </details>

      {riders.length > 0 && (
        <form method="get" className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="course" value={course.id} />
          <select name="equipe" defaultValue={teamFilter} className={inputClass}>
            <option value="">Toutes les équipes</option>
            {[...ridersByTeam.keys()]
                .map((id) => teamById.get(id))
                .filter((t): t is NonNullable<typeof t> => !!t)
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((t) => (
                  <option key={t.id} value={t.code}>
                    {t.name}
                  </option>
                ))}
          </select>
          <button type="submit" className="rounded border border-border px-3 py-1.5 text-xs">
            Filtrer
          </button>
          {teamFilter && (
            <Link href={`/admin/athletes?course=${course.id}`} className="text-xs text-text-dim underline">
              Tout afficher
            </Link>
          )}
        </form>
      )}

      <div className="flex flex-col gap-2">
        {courseTeams.map((team) => {
          const members = ridersByTeam.get(team.id) ?? [];
          const tOdds = teamOdds.get(team.id) ?? {};
          return (
            <details key={team.id || "none"} open={Boolean(teamFilter)} className="rounded-xl border border-border bg-card">
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span className="text-sm font-semibold">
                  {team.name} {team.code && <span className="text-text-dim">({team.code})</span>}
                </span>
                <span className="text-xs text-text-dim">
                  {members.length} coureur(s)
                  {members.some((m) => m.abandoned_race_id) && ` · ${members.filter((m) => m.abandoned_race_id).length} abandon(s)`}
                </span>
              </summary>

              <div className="flex flex-col gap-3 border-t border-border px-4 py-3">
                {team.id && teamColumns.length > 0 && (
                  <form action={updateCourseTeam} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-bg/60 px-3 py-2 text-sm">
                    <input type="hidden" name="stage_id" value={course.id} />
                    <input type="hidden" name="team_id" value={team.id} />
                    <span className="min-w-[9rem] font-semibold">Cotes de l&apos;équipe</span>
                    {teamColumns.map((f) => (
                      <label key={f.format} className="flex items-center gap-1.5 text-xs text-text-dim">
                        {f.label}
                        <input name={`odds_${f.format}`} type="number" min={1} defaultValue={tOdds[f.format] ?? ""} className={oddsInputClass} />
                      </label>
                    ))}
                    <button type="submit" className="rounded border border-border px-2 py-1 text-xs">
                      OK
                    </button>
                  </form>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-text-dim">
                        <th className="px-1 py-1 font-normal">Dos.</th>
                        <th className="w-48 px-2 py-1 font-normal">Coureur</th>
                        {riderColumns.map((f) => (
                          <th key={f.format} className="px-1 py-1 font-normal">
                            {f.label}
                          </th>
                        ))}
                        <th className="px-1 py-1 font-normal">Abandon</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((rider) => {
                        const formId = `rider-${rider.id}`;
                        const current = athleteOdds.get(rider.id) ?? {};
                        return (
                          <tr key={rider.id} className={`border-t border-border/40 ${rider.abandoned_race_id ? "opacity-60" : ""}`}>
                            <td className="px-1 py-1">
                              <form id={formId} action={updateCourseRider}>
                                <input type="hidden" name="stage_id" value={course.id} />
                                <input type="hidden" name="athlete_id" value={rider.id} />
                              </form>
                              <input form={formId} name="bib" type="number" min={1} defaultValue={rider.bib ?? ""} className={oddsInputClass} />
                            </td>
                            <td className="whitespace-nowrap px-2 py-1">
                              {nationFlagEmoji(rider.nation_code)} {fullAthleteName(rider)}
                            </td>
                            {riderColumns.map((f) => (
                              <td key={f.format} className="px-1 py-1">
                                <input
                                  form={formId}
                                  name={`odds_${f.format}`}
                                  type="number"
                                  min={1}
                                  defaultValue={current[f.format] ?? ""}
                                  className={oddsInputClass}
                                />
                              </td>
                            ))}
                            <td className="px-1 py-1">
                              <select form={formId} name="abandoned_race_id" defaultValue={rider.abandoned_race_id ?? ""} className="rounded border border-border bg-card px-1 py-1 text-xs">
                                <option value="">En course</option>
                                {(races ?? []).map((r) => (
                                  <option key={r.id} value={r.id}>
                                    {raceLabel(r)}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="flex gap-1 px-1 py-1">
                              <button form={formId} type="submit" className="rounded border border-border px-2 py-1 text-xs">
                                OK
                              </button>
                              <form action={removeCourseRider}>
                                <input type="hidden" name="stage_id" value={course.id} />
                                <input type="hidden" name="athlete_id" value={rider.id} />
                                <ConfirmButton
                                  message={`Retirer ${fullAthleteName(rider)} de la course ? Ses cotes de la course sont retirées.`}
                                  className="rounded border border-red/50 px-2 py-1 text-xs text-red"
                                >
                                  ✕
                                </ConfirmButton>
                              </form>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </details>
          );
        })}

        {riders.length === 0 && (
          <p className="text-sm text-text-dim">
            Aucun coureur engagé dans cette course : importe le fichier des coureurs (onglet{" "}
            <Link href="/admin" className="underline">Calendrier</Link>) ou ajoute-les à la main ci-dessus.
          </p>
        )}
      </div>
    </div>
  );
}
