import { COURSE_KINDS, COURSE_KIND_LABELS } from "@/lib/velo/courses";
import {
  COURSE_CALENDAR_HEADERS,
  COURSE_RIDERS_HEADERS,
  COURSE_STAGES_HEADERS,
  COURSE_TEAMS_HEADERS,
  SEASON_RIDERS_HEADERS,
} from "@/lib/velo/imports";
import { CsvImportPanel } from "../_components/CsvImportPanel";
import { createVeloCourse, importVeloCalendar, importVeloSeasonRiders } from "./actions";
import { CourseImports } from "./CourseImports";

const inputClass = "rounded border border-border bg-bg px-2 py-1.5 text-sm";
const KIND_LABELS = COURSE_KIND_LABELS;

/** Imports d'une saison (page de la saison) : calendrier, course à la main, coureurs de la saison. */
export function SeasonImports({ seasonId }: { seasonId: string }) {
  return (
    <>
      <section className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold">1. Calendrier de la saison</h3>
        <CsvImportPanel
          title="Calendrier (export de l'ancienne app)"
          description="Une ligne par course. Les courses sont retrouvées par leur nom : réimporter met à jour sans dupliquer. Une classique reçoit son étape unique (11 h, type Classique pour un monument, Baroudeurs sinon) à corriger ensuite. Monuments et Mondiaux comptent ×2."
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
        <h3 className="text-lg font-semibold">2. Coureurs de la saison</h3>
        <CsvImportPanel
          title="Liste des coureurs de la saison et leurs cotes par profil"
          description="Une ligne par coureur : équipe, nation et une cote par profil (sprint, montagne, CLM, baroudeur, classique). Réimporter met à jour sans dupliquer ; une cellule vide ne touche pas à la cote existante. Chaque course reprend ces cotes pour ses engagés qui n'ont pas de cote propre (une étape Classique prend la colonne cote_classique). Les maillots se cotent course par course."
          headers={SEASON_RIDERS_HEADERS}
          onImport={importVeloSeasonRiders.bind(null, seasonId)}
        />
      </section>

    </>
  );
}

/** Imports d'une course (page de la course) : étapes, coureurs et cotes, équipes. */
export function CourseImportsSection({ course }: { course: { id: string; label: string } }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Étapes, coureurs et cotes de la course</h2>
      <CourseImports courses={[course]} stagesHeaders={COURSE_STAGES_HEADERS} ridersHeaders={COURSE_RIDERS_HEADERS} teamsHeaders={COURSE_TEAMS_HEADERS} />
    </section>
  );
}
