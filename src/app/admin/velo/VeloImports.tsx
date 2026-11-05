import { COURSE_KINDS, COURSE_KIND_LABELS } from "@/lib/velo/courses";
import {
  COURSE_CALENDAR_HEADERS,
  COURSE_RIDERS_HEADERS,
  COURSE_STAGES_HEADERS,
  COURSE_TEAMS_HEADERS,
} from "@/lib/velo/imports";
import { CsvImportPanel } from "../_components/CsvImportPanel";
import { createVeloCourse, importVeloCalendar } from "./actions";
import { CourseImports } from "./CourseImports";

const inputClass = "rounded border border-border bg-bg px-2 py-1.5 text-sm";
const KIND_LABELS = COURSE_KIND_LABELS;

/** Imports vélo de l'onglet Calendrier : calendrier de la saison, course à la main, puis par course. */
export function VeloImports({ seasonId, courses }: { seasonId: string; courses: Array<{ id: string; label: string }> }) {
  return (
    <>
      <section className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold">1. Calendrier de la saison</h3>
        <CsvImportPanel
          title="Calendrier (export de l'ancienne app)"
          description="Une ligne par course. Les courses sont retrouvées par leur nom : réimporter met à jour sans dupliquer. Une classique reçoit son étape unique (11 h, type Baroudeurs) à corriger ensuite. Monuments et Mondiaux comptent ×2."
          headers={COURSE_CALENDAR_HEADERS}
          onImport={importVeloCalendar.bind(null, seasonId)}
        />
        <details className="rounded-xl border border-border bg-card p-4">
          <summary className="cursor-pointer text-xs font-semibold text-text-dim">Créer une course à la main (ex. course de test)</summary>
          <form action={createVeloCourse} className="mt-3 flex flex-wrap items-center gap-2">
            <input type="hidden" name="season_id" value={seasonId} />
            <input name="name" required placeholder="Nom (ex. Tour de France 2026 (test))" className={`${inputClass} w-72`} />
            <select name="kind" defaultValue="grand_tour" className={inputClass}>
              {COURSE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </select>
            <input name="country_code" defaultValue="FRA" placeholder="Pays (FRA)" className={`${inputClass} w-20`} />
            <input name="starts_on" type="date" required title="Début (ou date d'une course d'un jour)" className={inputClass} />
            <input name="ends_on" type="date" title="Fin (vide pour une course d'un jour)" className={inputClass} />
            <label className="flex items-center gap-1 text-xs text-text-dim">
              <input type="checkbox" name="off_standings" defaultChecked /> Autre (hors classement)
            </label>
            <button type="submit" className="rounded bg-ice px-4 py-1.5 text-sm font-bold text-on-ice">
              Créer
            </button>
          </form>
        </details>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold">2. Étapes, coureurs et cotes d’une course</h3>
        <CourseImports
          courses={courses}
          stagesHeaders={COURSE_STAGES_HEADERS}
          ridersHeaders={COURSE_RIDERS_HEADERS}
          teamsHeaders={COURSE_TEAMS_HEADERS}
        />
      </section>
    </>
  );
}
