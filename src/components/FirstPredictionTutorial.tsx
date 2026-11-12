"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

const STORAGE_KEY = "bp:first-prediction-tutorial";

export interface TutorialStep {
  title: string;
  body: string;
  /** Mini-écran ou tableau, préparé côté serveur (mêmes mini-écrans que l'accueil visiteur). */
  visual: React.ReactNode;
  /** Légende des pastilles numérotées du mini-écran. */
  pins?: string[];
}

/**
 * Premier pronostic d'un invité (bouton « Je joue », demande de Guillaume du 11/11/2026) : 3
 * pop-ups à valider avant de choisir ses coureurs (choisir 3 coureurs, cote et multiplicateur,
 * calcul des points). Vu une fois par navigateur ; « Passer » le referme aussi.
 */
export function FirstPredictionTutorial({ steps }: { steps: TutorialStep[] }) {
  const t = useTranslations("Tutorial");
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setOpen(true);
    } catch {
      setOpen(true);
    }
  }, []);

  if (!open || steps.length === 0) return null;
  const step = steps[index];
  const last = index === steps.length - 1;

  function finish() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {}
    setOpen(false);
  }

  return (
    <div
      data-guest-popup
      role="dialog"
      aria-modal="true"
      aria-label={step.title}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-4"
    >
      <div className="flex max-h-[92dvh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-t-2xl border border-border bg-bg p-5 sm:rounded-2xl">
        <div className="flex items-center justify-between">
          <div className="font-display text-[11px] font-bold uppercase tracking-wider text-text-dim">
            {t("stepOf", { step: index + 1, total: steps.length })}
          </div>
          <button type="button" onClick={finish} className="text-xs text-text-dim underline">
            {t("skip")}
          </button>
        </div>
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue to-teal font-display text-base font-extrabold text-white">
            {index + 1}
          </span>
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-lg font-extrabold leading-tight">{step.title}</h2>
            <p className="text-[13px] leading-relaxed text-text-dim">{step.body}</p>
          </div>
        </div>
        <div>{step.visual}</div>
        {step.pins && (
          <ol className="flex flex-col gap-2">
            {step.pins.map((pin, i) => (
              <li key={i} className="flex gap-2.5 text-[12.5px] leading-snug text-frost">
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-gold font-display text-[10px] font-extrabold text-on-gold">
                  {i + 1}
                </span>
                {pin}
              </li>
            ))}
          </ol>
        )}
        <div className="flex items-center gap-3">
          <div className="flex flex-1 gap-1.5">
            {steps.map((_, i) => (
              <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= index ? "bg-ice" : "bg-border"}`} />
            ))}
          </div>
          {index > 0 && (
            <button type="button" onClick={() => setIndex(index - 1)} className="rounded-xl border border-border px-4 py-2.5 font-display text-sm font-bold text-frost">
              {t("previous")}
            </button>
          )}
          <button
            type="button"
            onClick={() => (last ? finish() : setIndex(index + 1))}
            className="rounded-xl bg-ice px-5 py-2.5 font-display text-sm font-bold text-on-ice"
          >
            {last ? t("start") : t("next")}
          </button>
        </div>
      </div>
    </div>
  );
}
