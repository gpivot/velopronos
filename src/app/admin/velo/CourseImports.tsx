"use client";

import { useState } from "react";
import { CsvImportPanel } from "../_components/CsvImportPanel";
import { importVeloRiders, importVeloStages, importVeloTeams } from "./actions";

const inputClass = "rounded border border-border bg-bg px-2 py-1.5 text-sm";

/** Imports propres à une course : étapes (avec décalage de dates), coureurs et cotes, équipes. */
export function CourseImports({
  courses,
  stagesHeaders,
  ridersHeaders,
  teamsHeaders,
}: {
  courses: Array<{ id: string; label: string }>;
  stagesHeaders: string[];
  ridersHeaders: string[];
  teamsHeaders: string[];
}) {
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [newStartDate, setNewStartDate] = useState("");
  if (courses.length === 0) return <p className="text-sm text-text-dim">Crée ou importe d’abord une course.</p>;

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-wrap items-center gap-2 text-sm">
        Course
        <select value={courseId} onChange={(e) => setCourseId(e.target.value)} className={inputClass}>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      <CsvImportPanel
        key={`stages-${courseId}`}
        title="Étapes de la course"
        description={
          <div className="flex flex-col gap-2">
            <span>
              Une ligne par étape, « R » en numéro pour un jour de repos. Heure de départ = heure de Paris. Types : Sprint,
              Montagne, Baroudeurs, CLM, CLME. Réimporter met à jour les étapes (retrouvées par leur numéro).
            </span>
            <label className="flex flex-wrap items-center gap-2">
              Décaler pour que la 1re étape tombe le (facultatif, course de test)
              <input type="date" value={newStartDate} onChange={(e) => setNewStartDate(e.target.value)} className={inputClass} />
            </label>
          </div>
        }
        headers={stagesHeaders}
        onImport={(csv) => importVeloStages(courseId, newStartDate || null, csv)}
      />

      <CsvImportPanel
        key={`riders-${courseId}`}
        title="Coureurs et cotes"
        description="Engagés de la course (dossard, équipe, nation) et leurs cotes par type d'étape et par maillot. Un coureur déjà connu dans la saison est retrouvé par son prénom et son nom. Une cellule vide ne modifie pas la cote existante ; le statut est ignoré."
        headers={ridersHeaders}
        onImport={(csv) => importVeloRiders(courseId, csv)}
      />

      <CsvImportPanel
        key={`teams-${courseId}`}
        title="Équipes (meilleure équipe et CLM par équipes)"
        description="Nom complet des équipes, cote « meilleure équipe » (cote_ME) et cote du contre-la-montre par équipes (CLME)."
        headers={teamsHeaders}
        onImport={(csv) => importVeloTeams(courseId, csv)}
      />
    </div>
  );
}
