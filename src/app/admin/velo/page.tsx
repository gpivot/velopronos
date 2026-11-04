import { createAdminClient } from "@/lib/supabase/server";
import { nationFlagEmoji } from "@/lib/nationFlags";
import { COURSE_KINDS, STAGE_TYPE_LABELS, type StageType } from "@/lib/velo/courses";
import {
  COURSE_CALENDAR_HEADERS,
  COURSE_RIDERS_HEADERS,
  COURSE_STAGES_HEADERS,
  COURSE_TEAMS_HEADERS,
} from "@/lib/velo/imports";
import { CsvImportPanel } from "../_components/CsvImportPanel";
import { createVeloCourse, importVeloCalendar } from "./actions";
import { CourseImports } from "./CourseImports";

export const dynamic = "force-dynamic";

const inputClass = "rounded border border-border bg-bg px-2 py-1.5 text-sm";

const KIND_LABELS: Record<string, string> = {
  one_day: "Classique",
  stage_race: "Course par étapes",
  grand_tour: "Grand Tour",
  bonus_event: "Événement bonus",
};

/**
 * VéloPronos — courses de la saison active et imports CSV (calendrier, étapes, coureurs et cotes,
 * équipes). Nécessite les migrations 0044 et 0045.
 */
export default async function VeloAdminPage() {
  const admin = createAdminClient();
  const { data: season } = await admin.from("seasons").select("id, label").eq("status", "active").maybeSingle();
  if (!season) {
    return <p className="text-sm text-text-dim">Crée et active une saison (onglet Calendrier & résultats) avant d'importer les courses.</p>;
  }

  const { data: courses, error } = await admin
    .from("stages")
    .select("id, name, location, kind, country_code, starts_on, ends_on, coefficient, counts_in_standings, rest_days, races(id, format, stage_number), stage_riders(athlete_id)")
    .eq("season_id", season.id)
    .order("starts_on");

  if (error) {
    return (
      <p className="text-sm text-red">
        Lecture des courses impossible : {error.message}. Les migrations 0044 et 0045 sont-elles passées dans Supabase ?
      </p>
    );
  }

  const list = (courses ?? []) as any[];

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Courses vélo — {season.label}</h2>
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-text-dim">
              <tr>
                <th className="px-3 py-2">Course</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Dates</th>
                <th className="px-3 py-2">Étapes</th>
                <th className="px-3 py-2">Engagés</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => {
                const byType = new Map<string, number>();
                for (const r of c.races ?? []) byType.set(r.format, (byType.get(r.format) ?? 0) + 1);
                return (
                  <tr key={c.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      {nationFlagEmoji(c.country_code)} {c.name ?? c.location}
                      {c.coefficient === 2 && <span className="ml-2 text-xs text-gold">×2</span>}
                      {c.counts_in_standings === false && <span className="ml-2 text-xs text-text-dim">hors classement</span>}
                    </td>
                    <td className="px-3 py-2 text-text-dim">{KIND_LABELS[c.kind] ?? c.kind}</td>
                    <td className="px-3 py-2 text-text-dim">
                      {c.starts_on === c.ends_on ? c.starts_on : `${c.starts_on} → ${c.ends_on}`}
                      {c.rest_days?.length > 0 && <span className="ml-1 text-xs">({c.rest_days.length} repos)</span>}
                    </td>
                    <td className="px-3 py-2 text-text-dim">
                      {(c.races ?? []).length}
                      {byType.size > 0 && (
                        <span className="ml-1 text-xs">
                          ({Array.from(byType, ([t, n]) => `${n} ${STAGE_TYPE_LABELS[t as StageType] ?? t}`).join(", ")})
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-text-dim">{(c.stage_riders ?? []).length || "—"}</td>
                  </tr>
                );
              })}
              {list.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-text-dim">
                    Aucune course : importe le calendrier ci-dessous.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold">1. Calendrier de la saison</h3>
        <CsvImportPanel
          title="Calendrier (export de l'ancienne app)"
          description="Une ligne par course. Les courses sont retrouvées par leur nom : réimporter met à jour sans dupliquer. Une classique reçoit son étape unique (11 h, type Baroudeurs) à corriger ensuite. Monuments et Mondiaux comptent ×2."
          headers={COURSE_CALENDAR_HEADERS}
          onImport={importVeloCalendar.bind(null, season.id)}
        />
        <details className="rounded-xl border border-border bg-card p-4">
          <summary className="cursor-pointer text-xs font-semibold text-text-dim">Créer une course à la main (ex. course de test)</summary>
          <form action={createVeloCourse} className="mt-3 flex flex-wrap items-center gap-2">
            <input type="hidden" name="season_id" value={season.id} />
            <input name="name" required placeholder="Nom (ex. Tour de France 2026 (test))" className={`${inputClass} w-72`} />
            <select name="kind" defaultValue="grand_tour" className={inputClass}>
              {COURSE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </select>
            <input name="country_code" defaultValue="FRA" placeholder="Pays (FRA)" className={`${inputClass} w-20`} />
            <input name="starts_on" type="date" required className={inputClass} />
            <input name="ends_on" type="date" className={inputClass} />
            <label className="flex items-center gap-1 text-xs text-text-dim">
              <input type="checkbox" name="counts_in_standings" /> compte au classement de la saison
            </label>
            <button type="submit" className="rounded bg-ice px-4 py-1.5 text-sm font-bold text-on-ice">
              Créer
            </button>
          </form>
        </details>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold">2. Étapes, coureurs et cotes d'une course</h3>
        <CourseImports
          courses={list.map((c) => ({ id: c.id, label: `${c.name ?? c.location} (${c.starts_on})` }))}
          stagesHeaders={COURSE_STAGES_HEADERS}
          ridersHeaders={COURSE_RIDERS_HEADERS}
          teamsHeaders={COURSE_TEAMS_HEADERS}
        />
      </section>
    </div>
  );
}
