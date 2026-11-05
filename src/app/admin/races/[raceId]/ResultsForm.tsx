"use client";

import { useRef, useState } from "react";
import { loadAiResults, loadIbuResults, submitResults, updateCombatif, type AiImportState, type SubmitResultsState } from "./actions";
import type { ResultEntryInput } from "@/lib/admin/raceResults";
import {
  ATHLETE_RESULTS_HEADERS,
  NATION_RESULTS_HEADERS,
  buildResultsCsv,
  parseResultsCsv,
  parseTimeGap,
  type ResultsCsvCandidate,
} from "@/lib/admin/resultsCsv";
import { formatShootings, parseShootings, shootingCount, totalMisses } from "@/lib/shootings";

export interface CandidateRow extends ResultsCsvCandidate {
  id: string;
  name: string;
  subtitle: string;
  odds: number;
  existingResult?: {
    rank: number | null;
    timeGapSeconds: number | null;
    penaltyLaps: number;
    shootings: number[] | null;
    skiRank: number | null;
    isGachette: boolean;
  };
}

interface RowState {
  rank: string;
  timeGapSeconds: string;
  shootings: string;
  penaltyLaps: string;
  /** Rang au temps de ski (carte Fusée : 1er, 2e, 3e). */
  skiRank: string;
  isGachette: boolean;
}

function initialRowState(candidate: CandidateRow): RowState {
  const r = candidate.existingResult;
  return {
    rank: r?.rank != null ? String(r.rank) : "",
    timeGapSeconds: r?.timeGapSeconds != null ? String(r.timeGapSeconds) : "",
    shootings: formatShootings(r?.shootings),
    penaltyLaps: r?.penaltyLaps ? String(r.penaltyLaps) : "",
    skiRank: r?.skiRank != null ? String(r.skiRank) : "",
    isGachette: r?.isGachette ?? false,
  };
}

export function ResultsForm({
  raceId,
  mode,
  format,
  specialRule,
  candidates,
}: {
  raceId: string;
  /** team : CLM par équipes (VéloPronos), une ligne par équipe. */
  mode: "athlete" | "nation" | "team";
  format: string;
  specialRule: string | null;
  candidates: CandidateRow[];
}) {
  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(candidates.map((c) => [c.id, initialRowState(c)]))
  );
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResultsState | null>(null);
  const [csvReport, setCsvReport] = useState<{ ok: boolean; message: string; warnings: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAthleteMode = mode === "athlete";
  const isTeamMode = mode === "team";
  const csvMode = mode === "team" ? "nation" : mode;
  // VéloPronos : ni écart (cote poursuite), ni tir, ni tour de péna, ni cartes Fusée / Gâchette.
  const showTimeGap = false;
  const showShootings = false;
  const showPenaltyLaps = false;
  const showFusee = false;
  const showGachette = false;
  void specialRule;

  function updateRow(id: string, patch: Partial<RowState>) {
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  const [ibuLoading, setIbuLoading] = useState(false);
  const [ibuRaceId, setIbuRaceId] = useState("");

  const [aiLoading, setAiLoading] = useState(false);
  const [aiUrl, setAiUrl] = useState("");
  const [aiOutcome, setAiOutcome] = useState<AiImportState | null>(null);
  const [combatifSaved, setCombatifSaved] = useState(false);

  async function handleAi() {
    setAiLoading(true);
    setCsvReport(null);
    setAiOutcome(null);
    setCombatifSaved(false);
    try {
      const outcome = await loadAiResults(raceId, aiUrl || undefined);
      setAiOutcome(outcome);
      if (outcome.ok && outcome.csv) applyCsv(outcome.csv, `${outcome.message} `, outcome.warnings);
      else setCsvReport({ ok: false, message: outcome.message, warnings: outcome.warnings });
    } catch (err) {
      setCsvReport({ ok: false, message: err instanceof Error ? err.message : "Erreur IA inconnue.", warnings: [] });
    } finally {
      setAiLoading(false);
    }
  }

  async function saveCombatif(athleteId: string) {
    const formData = new FormData();
    formData.set("race_id", raceId);
    formData.set("combatif_athlete_id", athleteId);
    await updateCombatif(formData);
    setCombatifSaved(true);
  }

  /** Le CSV (fichier ou IBU) remplace la saisie à l'écran ; rien n'est enregistré avant le clic sur le bouton. */
  function applyCsv(csvText: string, source: string, extraWarnings: string[] = []) {
    try {
      const parsed = parseResultsCsv(csvText, csvMode, candidates);
      const empty: RowState = { rank: "", timeGapSeconds: "", shootings: "", penaltyLaps: "", skiRank: "", isGachette: false };
      setRows(Object.fromEntries(candidates.map((c) => [c.id, parsed.rows[c.id] ?? empty])));
      setResult(null);
      setCsvReport({
        ok: true,
        message: `${source}${parsed.matched} ligne(s) reprise(s). Vérifie le tableau puis enregistre pour calculer les points.`,
        warnings: [...extraWarnings, ...parsed.warnings],
      });
    } catch (err) {
      setCsvReport({ ok: false, message: err instanceof Error ? err.message : "CSV illisible.", warnings: [] });
    }
  }

  async function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) applyCsv(await file.text(), "CSV : ");
  }

  async function handleIbu() {
    setIbuLoading(true);
    setCsvReport(null);
    try {
      const outcome = await loadIbuResults(raceId, ibuRaceId || undefined);
      if (outcome.ok && outcome.csv) applyCsv(outcome.csv, `${outcome.message} `, outcome.warnings);
      else setCsvReport({ ok: false, message: outcome.message, warnings: [] });
    } catch (err) {
      setCsvReport({ ok: false, message: err instanceof Error ? err.message : "Erreur IBU inconnue.", warnings: [] });
    } finally {
      setIbuLoading(false);
    }
  }

  function downloadCsv() {
    const blob = new Blob([buildResultsCsv(csvMode, candidates, rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `resultats-${raceId}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);

    const entries: ResultEntryInput[] = Object.entries(rows)
      .filter(([, row]) => row.rank.trim() !== "")
      .map(([id, row]) => ({
        athleteId: isAthleteMode ? id : undefined,
        nationCode: mode === "nation" ? id : undefined,
        teamId: isTeamMode ? id : undefined,
        rank: Number(row.rank),
        // Virgule ou point acceptés (« 34,5 », « +1:02,3 »).
        timeGapSeconds: parseTimeGap(row.timeGapSeconds) ?? undefined,
        shootings: parseShootings(row.shootings, shootingCount(format)) ?? undefined,
        penaltyLaps: row.penaltyLaps.trim() !== "" ? Number(row.penaltyLaps) : undefined,
        skiRank: Number(row.skiRank) > 0 ? Number(row.skiRank) : null,
        isGachette: row.isGachette,
      }));

    const outcome = await submitResults(raceId, entries);
    setSubmitting(false);
    setResult(outcome);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <SubmitBar submitting={submitting} result={result} />

      {mode !== "nation" && (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
          <div className="text-sm font-semibold">Récupérer les résultats avec l&apos;IA</div>
          <p className="text-xs text-text-dim">
            L&apos;IA cherche le Top 10 {isTeamMode ? "des équipes" : "et le combatif du jour"} sur le site officiel de la course, puis
            ProCyclingStats et L&apos;Équipe, et signale les places où les sources divergent. Le tableau est pré-rempli : relis-le
            avant d&apos;enregistrer. Compte une à deux minutes.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              type="url"
              value={aiUrl}
              onChange={(e) => setAiUrl(e.target.value)}
              placeholder="Page officielle des résultats (facultatif)"
              className="min-w-0 flex-1 rounded border border-border bg-bg px-2 py-1.5 text-sm"
            />
            <button
              type="button"
              onClick={handleAi}
              disabled={aiLoading}
              className="rounded bg-ice px-4 py-1.5 text-sm font-bold text-on-ice disabled:opacity-60"
            >
              {aiLoading ? "Recherche en cours..." : "Récupérer les résultats"}
            </button>
          </div>
          {aiOutcome?.combatif && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span>
                Combatif du jour selon l&apos;IA : <strong>{aiOutcome.combatif.name}</strong>
              </span>
              {aiOutcome.combatif.athleteId ? (
                combatifSaved ? (
                  <span className="text-ice">enregistré.</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => saveCombatif(aiOutcome.combatif!.athleteId!)}
                    className="rounded border border-border px-2 py-0.5 text-text-dim hover:text-ice"
                  >
                    L&apos;enregistrer comme combatif
                  </button>
                )
              ) : (
                <span className="text-gold">introuvable parmi les engagés, à choisir à la main.</span>
              )}
            </div>
          )}
          {aiOutcome && aiOutcome.sources.length > 0 && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-dim">
              Sources :
              {aiOutcome.sources.map((s, i) => (
                <a key={i} href={s.url} target="_blank" rel="noreferrer" className="underline hover:text-ice">
                  {s.name || s.url}
                </a>
              ))}
            </div>
          )}
          {isTeamMode && csvReport && <CsvReport report={csvReport} />}
        </div>
      )}

      {!isTeamMode && (
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
        <div className="text-sm font-semibold">Importer les résultats en CSV</div>
        <p className="text-xs text-text-dim">
          {isAthleteMode
            ? "Une ligne par coureur classé (le Top 10 suffit ; plus loin pour les étapes Crevaison et Crise de foie). Nom et Prénom (ou une colonne Athlète avec le nom complet) sont retrouvés sans tenir compte des accents ni de la casse ; Nation départage les homonymes. Les autres colonnes sont ignorées. Abandon ou non-partant : laisser le rang vide."
            : "Une ligne par nation classée, Nation en code à 3 lettres (NOR) ou en toutes lettres, Tirs = fautes de l'équipe au couché et au debout (« 2+5 »)."}{" "}
          Le CSV remplit le tableau ci-dessous : rien n&apos;est enregistré avant ta validation.
        </p>
        <code className="overflow-x-auto whitespace-nowrap rounded bg-bg px-2 py-1.5 text-[11px] text-text-dim">
          {(isAthleteMode ? ATHLETE_RESULTS_HEADERS : NATION_RESULTS_HEADERS).join(";")}
        </code>
        <div className="flex flex-wrap gap-2">
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleCsvFile} className="hidden" />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded border border-border px-4 py-1.5 text-sm text-text-dim hover:text-ice"
          >
            Importer un CSV
          </button>
          <button type="button" onClick={downloadCsv} className="rounded border border-border px-4 py-1.5 text-sm text-text-dim hover:text-ice">
            Télécharger le modèle (avec la saisie en cours)
          </button>
        </div>
        {csvReport && <CsvReport report={csvReport} />}
      </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-text-dim">
              <th className="px-3 py-2">{isAthleteMode ? "Coureur" : isTeamMode ? "Équipe" : "Nation"}</th>
              <th className="px-3 py-2">Cote</th>
              <th className="px-3 py-2">Rang</th>
              {showTimeGap && <th className="px-3 py-2">Écart (s)</th>}
              {showShootings && (
                <th className="px-3 py-2" title={`Fautes au tir, tir par tir (${shootingCount(format)} tirs), ex. ${shootingCount(format) === 2 ? "0+1" : "0+1+0+2"}`}>
                  Tirs
                </th>
              )}
              {showPenaltyLaps && <th className="px-3 py-2" title="Vide : nombre de fautes au tir">Tours de péna</th>}
              {showFusee && (
                <th className="px-3 py-2" title="Rang au temps de ski : 1, 2 ou 3 (carte Fusée : 100 / 50 / 20 pts)">
                  Rang ski
                </th>
              )}
              {showGachette && <th className="px-3 py-2">Gâchette</th>}
            </tr>
          </thead>
          <tbody>
            {candidates.map((candidate) => {
              const row = rows[candidate.id];
              return (
                <tr key={candidate.id} className="border-b border-border/50">
                  <td className="px-3 py-2">
                    {candidate.name} <span className="text-text-dim">({candidate.subtitle})</span>
                  </td>
                  <td className="px-3 py-2 text-text-dim">×{candidate.odds}</td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={1}
                      value={row.rank}
                      onChange={(e) => updateRow(candidate.id, { rank: e.target.value })}
                      className="w-16 rounded border border-border bg-card px-2 py-1"
                    />
                  </td>
                  {showTimeGap && (
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.timeGapSeconds}
                        onChange={(e) => updateRow(candidate.id, { timeGapSeconds: e.target.value })}
                        className="w-20 rounded border border-border bg-card px-2 py-1"
                      />
                    </td>
                  )}
                  {showShootings && <td className="px-3 py-2">
                    <input
                      type="text"
                      value={row.shootings}
                      placeholder={shootingCount(format) === 2 ? "0+0" : "0+0+0+0"}
                      onChange={(e) => updateRow(candidate.id, { shootings: e.target.value })}
                      className={`w-24 rounded border bg-card px-2 py-1 ${
                        row.shootings.trim() !== "" && !parseShootings(row.shootings) ? "border-red" : "border-border"
                      }`}
                    />
                  </td>}
                  {showPenaltyLaps && (
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        value={row.penaltyLaps}
                        placeholder={String(totalMisses(parseShootings(row.shootings)) ?? "")}
                        onChange={(e) => updateRow(candidate.id, { penaltyLaps: e.target.value })}
                        className="w-16 rounded border border-border bg-card px-2 py-1"
                      />
                    </td>
                  )}
                  {showFusee && (
                    <td className="px-3 py-2 text-center">
                      <input
                        type="number"
                        min={1}
                        value={row.skiRank}
                        onChange={(e) => updateRow(candidate.id, { skiRank: e.target.value })}
                        className="w-14 rounded border border-border bg-card px-2 py-1"
                      />
                    </td>
                  )}
                  {showGachette && (
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={row.isGachette}
                        onChange={(e) => updateRow(candidate.id, { isGachette: e.target.checked })}
                      />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <SubmitBar submitting={submitting} result={result} />
    </form>
  );
}

/** Bouton de calcul et message de retour, affichés en haut et en bas du tableau. */
function SubmitBar({ submitting, result }: { submitting: boolean; result: SubmitResultsState | null }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="submit"
        disabled={submitting}
        className="rounded-xl bg-ice px-5 py-2.5 text-sm font-bold text-on-ice disabled:opacity-60"
      >
        {submitting ? "Calcul en cours..." : "Enregistrer et calculer les scores"}
      </button>
      {result && <div className={result.status === "error" ? "text-sm text-red" : "text-sm text-ice"}>{result.message}</div>}
    </div>
  );
}

/** Retour d'un import (fichier CSV ou IA) : message et avertissements. */
function CsvReport({ report }: { report: { ok: boolean; message: string; warnings: string[] } }) {
  return (
    <div className="flex flex-col gap-1 text-xs">
      <div className={report.ok ? "text-ice" : "text-red"}>{report.message}</div>
      {report.warnings.length > 0 && (
        <ul className="list-disc pl-4 text-gold">
          {report.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
