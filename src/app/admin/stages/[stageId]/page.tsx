import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { nationFlagEmoji } from "@/lib/nationFlags";
import { updateStage } from "../../calendrier/actions";
import { submitJerseyResults } from "./actions";
import { CourseImportsSection } from "../../velo/VeloImports";
import { fullAthleteName } from "@/lib/athleteName";
import { STAGE_CATEGORY_OPTIONS, stageCategoryFormValue } from "@/lib/stageCategory";
import {
  COURSE_CATEGORIES,
  COURSE_CATEGORY_LABELS,
  COURSE_KIND_LABELS,
  COURSE_KINDS,
  JERSEY_LABELS,
  JERSEY_TYPES,
  defaultJerseyColor,
} from "@/lib/velo/courses";
import { LEADER_COLORS, MOUNTAIN_COLORS, POINTS_COLORS, defaultSecondaryJerseys } from "@/lib/velo/jerseyColors";

const inputClass = "rounded border border-border bg-bg px-2 py-1.5 text-sm";

export const dynamic = "force-dynamic";

/** Modification des infos d'une course (nom, pays, dates, coefficient, type, maillots). */
export default async function AdminStagePage({ params }: { params: Promise<{ stageId: string }> }) {
  const { stageId } = await params;
  const admin = createAdminClient();

  const [{ data: stage }, { data: nations }] = await Promise.all([
    admin.from("stages").select("*, races(id, status)").eq("id", stageId).single(),
    admin.from("nations").select("*").order("name"),
  ]);
  if (!stage) notFound();

  // Couleurs des maillots au choix (jerseyColors.ts) ; un ancien hexadécimal libre retombe sur le plus proche des 3.
  const jerseyDefaults = defaultSecondaryJerseys(stage.name ?? stage.location ?? "");
  const leaderColor = LEADER_COLORS.some((c) => c.value === stage.jersey_color)
    ? (stage.jersey_color as string)
    : (defaultJerseyColor(stage.name ?? "", stage.kind) ?? "#FFD200");

  const hasFinishedRace = ((stage.races ?? []) as { status: string }[]).some((r) => r.status === "finished");

  // Podiums finaux des maillots (VéloPronos) : engagés et équipes de la course, résultats saisis.
  const courseJerseys = JERSEY_TYPES.filter((j) => ((stage.jerseys ?? []) as string[]).includes(j));
  const [{ data: entries }, { data: jerseyResults }, { count: jerseyPredictionCount }] = await Promise.all([
    admin.from("stage_riders").select("bib, athletes(id, first_name, last_name, teams(id, code, name))").eq("stage_id", stageId),
    admin.from("course_jersey_results").select("jersey, rank, athlete_id, team_id").eq("stage_id", stageId),
    admin.from("course_predictions").select("id", { count: "exact", head: true }).eq("stage_id", stageId),
  ]);
  const riders = ((entries ?? []) as any[])
    .filter((e) => e.athletes)
    .sort((a, b) => (a.bib ?? 9999) - (b.bib ?? 9999))
    .map((e) => ({ id: e.athletes.id as string, label: `${e.bib ? `${e.bib} · ` : ""}${fullAthleteName(e.athletes)}${e.athletes.teams?.code ? ` (${e.athletes.teams.code})` : ""}` }));
  const teamMap = new Map<string, { id: string; label: string }>();
  for (const e of (entries ?? []) as any[]) if (e.athletes?.teams) teamMap.set(e.athletes.teams.id, { id: e.athletes.teams.id, label: e.athletes.teams.name });
  const teams = Array.from(teamMap.values()).sort((a, b) => a.label.localeCompare(b.label));
  const podiumOf = (jersey: string, rank: number) => {
    const r = (jerseyResults ?? []).find((x) => x.jersey === jersey && x.rank === rank);
    return (r?.athlete_id ?? r?.team_id ?? "") as string;
  };

  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin" className="text-sm text-text-dim underline">
        Retour au calendrier
      </Link>
      <h1 className="text-xl font-bold">
        {nationFlagEmoji(stage.country_code)} {stage.name ?? stage.location}
      </h1>

      <form action={updateStage} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
        <div className="text-sm font-semibold">Infos de la course</div>
        <input type="hidden" name="stage_id" value={stage.id} />
        <div className="flex flex-wrap gap-2">
          <input
            name="location"
            required
            defaultValue={stage.name ?? stage.location}
            placeholder="Nom (ex. Paris-Nice)"
            className={inputClass}
          />
          <select name="country_code" required defaultValue={stage.country_code} className={inputClass}>
            {(nations ?? []).map((n) => (
              <option key={n.code} value={n.code}>
                {n.name} ({n.code})
              </option>
            ))}
          </select>
          {/* Course d'un jour : une seule date (la fin suit le début, cf. updateStage). */}
          <input
            name="starts_on"
            type="date"
            required
            defaultValue={stage.starts_on}
            title={stage.kind === "one_day" ? "Date" : "Début"}
            className={inputClass}
          />
          {stage.kind !== "one_day" && (
            <input name="ends_on" type="date" required defaultValue={stage.ends_on} title="Fin" className={inputClass} />
          )}
          <select name="coefficient" defaultValue={stageCategoryFormValue(stage)} className={inputClass}>
            {STAGE_CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select name="kind" defaultValue={stage.kind ?? "one_day"} className={inputClass}>
            {COURSE_KINDS.map((k) => (
              <option key={k} value={k}>
                {COURSE_KIND_LABELS[k]}
              </option>
            ))}
          </select>
          <select name="category" defaultValue={stage.category ?? ""} className={inputClass}>
            <option value="">Catégorie —</option>
            {COURSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {COURSE_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-text-dim">
            Maillot de leader
            <select name="jersey_color" defaultValue={leaderColor} className={inputClass}>
              {LEADER_COLORS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-text-dim">
            Maillot sprint
            <select name="points_jersey_color" defaultValue={stage.points_jersey_color ?? jerseyDefaults.points} className={inputClass}>
              {POINTS_COLORS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-text-dim">
            Maillot montagne
            <select name="mountain_jersey_color" defaultValue={stage.mountain_jersey_color ?? jerseyDefaults.mountain} className={inputClass}>
              {MOUNTAIN_COLORS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-text-dim">
          Maillots pronostiqués :
          {JERSEY_TYPES.map((j) => (
            <label key={j} className="flex items-center gap-1">
              <input type="checkbox" name="jerseys" value={j} defaultChecked={(stage.jerseys ?? []).includes(j)} />
              {JERSEY_LABELS[j]}
            </label>
          ))}
        </div>
        <div>
          <button type="submit" className="rounded bg-ice px-4 py-1.5 text-sm font-bold text-on-ice">
            Enregistrer
          </button>
        </div>
        <p className="text-xs text-text-dim">
          Les horaires des étapes se modifient avec le crayon de chaque étape. « Autre (×0) » : courses
          de test, notées normalement mais hors classement de la saison (pas de carte bonus, de ×2 ni de
          série).
          {hasFinishedRace &&
            " Attention : des étapes de cette course sont déjà notées ; un passage ×1 / ×2 ne recalcule pas leurs points tant que leurs résultats ne sont pas réenregistrés (le passage en ×0 ou hors de ×0 s’applique tout de suite au classement)."}
        </p>
      </form>

      {courseJerseys.length > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
          <div className="text-sm font-semibold">Podiums finaux des maillots</div>
          <p className="text-xs text-text-dim">
            À saisir à la fin de la course. Chaque enregistrement recalcule les points du maillot ({jerseyPredictionCount ?? 0} pronostic(s)
            maillot sur la course) : cote × 5 / × 2 / × 1 pour le podium, +200 pour le vainqueur du super combatif.
            Vider les 3 cases efface le podium et ses points.
          </p>
          {riders.length === 0 ? (
            <p className="text-xs text-text-dim">Aucun engagé : importe d&apos;abord les coureurs de la course.</p>
          ) : (
            courseJerseys.map((jersey) => {
              const options = jersey === "equipe" ? teams : riders;
              const ranks = jersey === "combatif" ? [1] : [1, 2, 3];
              return (
                <form key={jersey} action={submitJerseyResults} className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
                  <input type="hidden" name="stage_id" value={stage.id} />
                  <input type="hidden" name="jersey" value={jersey} />
                  <span className="w-44 text-sm font-semibold">{JERSEY_LABELS[jersey]}</span>
                  {ranks.map((rank) => (
                    <label key={rank} className="flex items-center gap-1 text-xs text-text-dim">
                      {rank}
                      <select name={`rank_${rank}`} defaultValue={podiumOf(jersey, rank)} className={`${inputClass} max-w-[14rem]`}>
                        <option value="">—</option>
                        {options.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                  <button type="submit" className="rounded bg-ice px-3 py-1.5 text-xs font-bold text-on-ice">
                    Enregistrer
                  </button>
                </form>
              );
            })
          )}
        </div>
      )}

      <CourseImportsSection course={{ id: stage.id, label: stage.name ?? stage.location }} />
    </div>
  );
}
