"use client";

import { useMemo, useRef, useState } from "react";
import { loadAiResults, submitResults, updateCombatif, type AiImportState, type SubmitResultsState } from "./actions";
import type { ResultEntryInput } from "@/lib/admin/raceResults";
import { buildResultsCsv, parseResultsCsv, type ParsedResultRow, type ResultsCsvCandidate } from "@/lib/admin/resultsCsv";
import { TOP_SLOTS, rankedIds, searchCandidates, slotsFromRanks, trimSlots, type Slots } from "@/lib/admin/resultSlots";

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

type Report = { ok: boolean; message: string; warnings: string[] };

function initialSlots(candidates: CandidateRow[]): Slots {
  return slotsFromRanks(
    candidates.flatMap((c) => (c.existingResult?.rank != null ? [{ id: c.id, rank: c.existingResult.rank }] : []))
  );
}

/**
 * Résultat d'une étape (VéloPronos) : le Top 10, place par place, chaque ligne avec une recherche
 * du coureur (ou de l'équipe) par les premières lettres ; un coureur placé n'est plus proposé
 * ailleurs. Sur une étape Crevaison, des lignes s'ajoutent après le Top 10 (la place de chaque
 * coureur pronostiqué compte). Pré-remplissable par l'IA ou un CSV ; rien n'est enregistré avant
 * le clic sur le bouton.
 */
export function ResultsForm({
  raceId,
  mode,
  specialRule,
  candidates,
}: {
  raceId: string;
  /** team : CLM par équipes, une ligne par équipe. */
  mode: "athlete" | "nation" | "team";
  format: string;
  specialRule: string | null;
  candidates: CandidateRow[];
}) {
  const [slots, setSlots] = useState<Slots>(() => initialSlots(candidates));
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResultsState | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAthleteMode = mode === "athlete";
  const isTeamMode = mode === "team";
  const csvMode = isAthleteMode ? "athlete" : "nation";
  // Étape Crevaison : −position de chaque coureur pronostiqué hors Top 10, il faut donc la suite.
  const allowsExtraRows = isAthleteMode && specialRule === "brouillard";
  const byId = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);

  function setSlot(index: number, id: string | null) {
    setSlots((prev) => prev.map((v, i) => (i === index ? id : v)));
    setResult(null);
  }

  /** Le CSV (fichier ou IA) remplace la saisie à l'écran. */
  function applyCsv(csvText: string, source: string, extraWarnings: string[] = []) {
    try {
      const parsed = parseResultsCsv(csvText, csvMode, candidates);
      const ranked = Object.entries(parsed.rows).map(([id, row]) => ({ id, rank: Number(row.rank) }));
      const outsideTop = ranked.filter((r) => r.rank > TOP_SLOTS);
      const kept = allowsExtraRows ? ranked : ranked.filter((r) => r.rank <= TOP_SLOTS);
      setSlots(trimSlots(slotsFromRanks(kept)));
      setResult(null);
      setReport({
        ok: true,
        message: `${source}${kept.length} place(s) reprise(s). Vérifie le classement puis enregistre pour calculer les points.`,
        warnings: [
          ...extraWarnings,
          ...parsed.warnings,
          ...(!allowsExtraRows && outsideTop.length > 0 ? [`${outsideTop.length} ligne(s) au-delà du Top 10 ignorée(s).`] : []),
        ],
      });
    } catch (err) {
      setReport({ ok: false, message: err instanceof Error ? err.message : "CSV illisible.", warnings: [] });
    }
  }

  async function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) applyCsv(await file.text(), "CSV : ");
  }

  function downloadCsv() {
    const rows: Record<string, ParsedResultRow> = Object.fromEntries(
      rankedIds(slots).map(({ id, rank }) => [
        id,
        { rank: String(rank), timeGapSeconds: "", shootings: "", penaltyLaps: "", skiRank: "", isGachette: false },
      ])
    );
    const blob = new Blob([buildResultsCsv(csvMode, candidates, rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `resultats-${raceId}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const [aiLoading, setAiLoading] = useState(false);
  const [aiUrl, setAiUrl] = useState("");
  const [aiOutcome, setAiOutcome] = useState<AiImportState | null>(null);
  const [combatifSaved, setCombatifSaved] = useState(false);

  async function handleAi() {
    setAiLoading(true);
    setReport(null);
    setAiOutcome(null);
    setCombatifSaved(false);
    try {
      const outcome = await loadAiResults(raceId, aiUrl || undefined);
      setAiOutcome(outcome);
      if (outcome.ok && outcome.csv) applyCsv(outcome.csv, `${outcome.message} `, outcome.warnings);
      else setReport({ ok: false, message: outcome.message, warnings: outcome.warnings });
    } catch (err) {
      setReport({ ok: false, message: err instanceof Error ? err.message : "Erreur IA inconnue.", warnings: [] });
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    const entries: ResultEntryInput[] = rankedIds(slots).map(({ id, rank }) => ({
      athleteId: isAthleteMode ? id : undefined,
      nationCode: mode === "nation" ? id : undefined,
      teamId: isTeamMode ? id : undefined,
      rank,
      skiRank: null,
      isGachette: false,
    }));
    const outcome = await submitResults(raceId, entries);
    setSubmitting(false);
    setResult(outcome);
  }

  const filled = slots.filter(Boolean).length;
  const usedIds = new Set(slots.filter((id): id is string => id != null));

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
        <div className="text-sm font-semibold">Récupérer les résultats avec l&apos;IA</div>
        <p className="text-xs text-text-dim">
          L&apos;IA cherche le Top 10 {isTeamMode ? "des équipes" : "et le combatif du jour"}
          {allowsExtraRows ? ", et la place des coureurs pronostiqués au-delà (étape Crevaison)" : ""}, en croisant le site
          officiel de la course, ProCyclingStats et L&apos;Équipe. Les places où les sources divergent sont signalées. Compte une
          à deux minutes.
        </p>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold">Lien des résultats (organisateur ou autre source sûre), facultatif</span>
          <input
            type="url"
            value={aiUrl}
            onChange={(e) => setAiUrl(e.target.value)}
            placeholder="https://www.letour.fr/fr/classements/etape-4"
            className="rounded border border-border bg-bg px-2 py-1.5 text-sm"
          />
          <span className="text-text-dim">Si tu en as un, l&apos;IA lit cette page en premier et la fait primer sur les autres sources.</span>
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleAi}
            disabled={aiLoading}
            className="rounded bg-ice px-4 py-1.5 text-sm font-bold text-on-ice disabled:opacity-60"
          >
            {aiLoading ? "Recherche en cours..." : "Récupérer les résultats"}
          </button>
          {!isTeamMode && (
            <>
              <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleCsvFile} className="hidden" />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded border border-border px-4 py-1.5 text-sm text-text-dim hover:text-ice"
                title="Colonnes Rang ; Nom ; Prénom (ou Athlète) ; Nation"
              >
                Importer un CSV
              </button>
              <button type="button" onClick={downloadCsv} className="rounded border border-border px-4 py-1.5 text-sm text-text-dim hover:text-ice">
                Télécharger en CSV
              </button>
            </>
          )}
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
        {report && <ReportBox report={report} />}
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-sm font-semibold">Classement de l&apos;étape</div>
          <div className="text-xs text-text-dim">
            {filled} / {slots.length} place(s) remplie(s)
          </div>
        </div>
        <p className="text-xs text-text-dim">
          Tape les premières lettres du {isTeamMode ? "nom de l'équipe" : "prénom ou du nom du coureur"} puis choisis-le dans la
          liste. {isTeamMode ? "Une équipe placée" : "Un coureur placé"} n&apos;est plus proposé sur les autres lignes.
          {allowsExtraRows ? " Étape Crevaison : ajoute des lignes après le Top 10 pour les coureurs pronostiqués plus loin." : ""}
        </p>
        <ol className="flex flex-col gap-1.5">
          {slots.map((id, index) => (
            <li key={index} className="flex items-center gap-2">
              <span className={`w-8 flex-shrink-0 text-right text-sm font-bold ${index < TOP_SLOTS ? "" : "text-text-dim"}`}>{index + 1}</span>
              <SlotPicker
                value={id ? byId.get(id) ?? null : null}
                candidates={candidates}
                usedIds={usedIds}
                placeholder={isTeamMode ? "Équipe…" : "Coureur…"}
                onChange={(next) => setSlot(index, next)}
              />
              {allowsExtraRows && index >= TOP_SLOTS && index === slots.length - 1 && (
                <button
                  type="button"
                  onClick={() => setSlots((prev) => prev.slice(0, -1))}
                  className="flex-shrink-0 text-xs text-text-dim hover:text-red"
                  title="Retirer la ligne"
                >
                  Retirer
                </button>
              )}
            </li>
          ))}
        </ol>
        {allowsExtraRows && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSlots((prev) => [...prev, null])}
              className="rounded border border-border px-3 py-1 text-xs text-text-dim hover:text-ice"
            >
              + Ajouter une ligne
            </button>
            <button
              type="button"
              onClick={() => setSlots((prev) => [...prev, ...Array(10).fill(null)])}
              className="rounded border border-border px-3 py-1 text-xs text-text-dim hover:text-ice"
            >
              + 10 lignes
            </button>
          </div>
        )}
      </div>

      <SubmitBar submitting={submitting} result={result} />
    </form>
  );
}

/** Une place du classement : recherche par les premières lettres, ou le coureur choisi. */
function SlotPicker({
  value,
  candidates,
  usedIds,
  placeholder,
  onChange,
}: {
  value: CandidateRow | null;
  candidates: CandidateRow[];
  usedIds: Set<string>;
  placeholder: string;
  onChange: (id: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const options = useMemo(
    () =>
      open
        ? searchCandidates(
            query,
            candidates.map((c) => ({ ...c, extra: [c.subtitle] })),
            usedIds
          )
        : [],
    [open, query, candidates, usedIds]
  );

  if (value) {
    return (
      <div className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded border border-border bg-bg px-2 py-1.5 text-sm">
        <span className="truncate">
          {value.name} <span className="text-text-dim">({value.subtitle}) · ×{value.odds}</span>
        </span>
        <button type="button" onClick={() => onChange(null)} className="flex-shrink-0 text-text-dim hover:text-red" title="Vider la ligne">
          ✕
        </button>
      </div>
    );
  }

  function choose(id: string) {
    onChange(id);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="relative min-w-0 flex-1">
      <input
        type="text"
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() =>
          setTimeout(() => {
            // Une saisie non choisie dans la liste ne reste pas affichée comme si la place était remplie.
            setOpen(false);
            setQuery("");
          }, 150)
        }
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, options.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (options[highlight]) choose(options[highlight].id);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className="w-full rounded border border-border bg-bg px-2 py-1.5 text-sm"
      />
      {open && options.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded border border-border bg-card shadow-lg">
          {options.map((c, i) => (
            <li key={c.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(c.id)}
                className={`flex w-full justify-between gap-2 px-2 py-1.5 text-left text-sm ${i === highlight ? "bg-bg text-ice" : ""}`}
              >
                <span className="truncate">
                  {c.name} <span className="text-text-dim">({c.subtitle})</span>
                </span>
                <span className="flex-shrink-0 text-text-dim">×{c.odds}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && query.trim() !== "" && options.length === 0 && (
        <div className="absolute z-10 mt-1 w-full rounded border border-border bg-card px-2 py-1.5 text-xs text-text-dim shadow-lg">
          Aucun résultat (ou déjà placé).
        </div>
      )}
    </div>
  );
}

/** Retour d'un import (fichier CSV ou IA) : message et avertissements. */
function ReportBox({ report }: { report: Report }) {
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

/** Bouton de calcul et message de retour. */
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
