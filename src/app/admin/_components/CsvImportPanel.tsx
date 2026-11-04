"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export interface CsvActionResult {
  ok: boolean;
  message: string;
  errors: string[];
  warnings: string[];
}

/**
 * Import d'un CSV par une Server Action + lien de téléchargement du fichier en cours. Les en-têtes
 * attendus sont affichés pour pouvoir préparer (ou faire générer) le fichier sans ouvrir la doc.
 */
export function CsvImportPanel({
  title,
  description,
  headers,
  downloadHref,
  downloadLabel = "Télécharger le CSV en cours",
  confirmMessage,
  onImport,
}: {
  title: string;
  description: React.ReactNode;
  headers: readonly string[];
  /** Absent : pas de lien de téléchargement. */
  downloadHref?: string;
  downloadLabel?: string;
  /** Demandé avant d'importer, pour un import qui remplace les données existantes. */
  confirmMessage?: string;
  onImport: (csvText: string) => Promise<CsvActionResult>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CsvActionResult | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (confirmMessage && !window.confirm(confirmMessage)) {
      e.target.value = "";
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const outcome = await onImport(await file.text());
      setResult(outcome);
      if (outcome.ok) router.refresh();
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : "Erreur inconnue.", errors: [], warnings: [] });
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="text-sm font-semibold">{title}</div>
      <div className="text-xs text-text-dim">{description}</div>
      <code className="overflow-x-auto whitespace-nowrap rounded bg-bg px-2 py-1.5 text-[11px] text-text-dim">
        {headers.join(";")}
      </code>
      <div className="flex flex-wrap items-center gap-2">
        <input ref={inputRef} type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={loading}
          className="rounded bg-ice px-4 py-1.5 text-sm font-bold text-on-ice disabled:opacity-60"
        >
          {loading ? "Import en cours..." : "Importer un CSV"}
        </button>
        {downloadHref && (
          <a href={downloadHref} className="rounded border border-border px-4 py-1.5 text-sm text-text-dim hover:text-ice">
            {downloadLabel}
          </a>
        )}
      </div>

      {result && (
        <div className="flex flex-col gap-1 text-xs">
          <div className={result.ok ? "text-ice" : "text-red"}>{result.message}</div>
          {result.errors.length > 0 && (
            <ul className="list-disc pl-4 text-red">
              {result.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
          {result.warnings.length > 0 && (
            <ul className="list-disc pl-4 text-gold">
              {result.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
