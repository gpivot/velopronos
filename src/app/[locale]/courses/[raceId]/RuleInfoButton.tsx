"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { CloseIcon } from "@/components/icons";
import { RELAY_FORMATS } from "@/lib/raceFormats";

/** Lignes d'explication propres à chaque format, en plus des règles communes (clés RuleInfo.*). */
const FORMAT_LINES: Record<string, string[]> = {
  sprint: ["individual", "fusee", "gachette"],
  individuel: ["individual", "fusee", "gachette"],
  poursuite: ["individual", "pursuitStart", "fusee", "gachette"],
  mass_start: ["individual", "fusee", "gachette"],
};

/** Bouton « ? » de la page d'une course : rappel simple de la règle du format. */
export function RuleInfoButton({ format, small = false }: { format: string; small?: boolean }) {
  const t = useTranslations("RuleInfo");
  const [open, setOpen] = useState(false);
  const isRelay = RELAY_FORMATS.includes(format);
  const lines = isRelay ? ["relay"] : [...(FORMAT_LINES[format] ?? ["individual"]), "grilled"];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("open")}
        className={`flex flex-shrink-0 items-center justify-center rounded-full border border-border bg-card font-display font-extrabold text-ice ${
          small ? "h-6 w-6 text-xs" : "h-8 w-8 text-sm"
        }`}
      >
        ?
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("title")}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-md flex-col gap-3 rounded-2xl border border-border bg-card p-5 text-left"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="font-display text-base font-bold">{t("title")}</div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("close")}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-text-dim"
              >
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
            </div>
            <ul className="flex flex-col gap-2 text-[13px] leading-relaxed text-frost">
              {[...lines, "x2"].map((key) => (
                <li key={key} className="flex gap-2">
                  <span className="text-ice">•</span>
                  <span>{t(key)}</span>
                </li>
              ))}
            </ul>
            <Link href="/regles" className="font-display text-[13px] font-bold text-ice">
              {t("seeRules")}
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
