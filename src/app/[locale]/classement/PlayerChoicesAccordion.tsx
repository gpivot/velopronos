"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ChevronDownIcon } from "@/components/icons";
import { nationFlagEmoji } from "@/lib/nationFlags";
import type { HiddenPepite } from "@/lib/seasonView";
import type { PlayerChoices } from "./actions";

/**
 * Fiche d'un joueur (Classement) : « Ses choix », replié par défaut. Version vélo de l'accordéon
 * « Pronostics de saison » de Biathlonpronos (26/11/2026) : équipe de cœur et nation favorite, puis,
 * course par course, ses maillots (visibles au départ de la 1re étape, quand il ne peut plus les
 * changer), l'équipe choisie pour un Grand Tour et son porteur d'eau une fois révélé.
 */
export function PlayerChoicesAccordion({ choices, pepites }: { choices: PlayerChoices; pepites: HiddenPepite[] }) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("Classement");
  const tJerseys = useTranslations("Jerseys");
  // Porteurs d'eau : seulement ceux déjà révélés (les autres ne quittent jamais le serveur).
  const revealed = pepites.filter((p) => p.revealed && p.name);
  const courseIds = Array.from(new Set([...choices.courses.map((c) => c.stageId), ...revealed.map((p) => p.stageId)]));

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gold-soft text-lg">🟡</div>
        <div className="flex flex-1 flex-col gap-0.5">
          <div className="text-sm font-semibold">{t("playerChoicesTitle")}</div>
          <div className="text-xs text-text-dim">{t("playerChoicesSubtitle")}</div>
        </div>
        <ChevronDownIcon className={`h-4 w-4 flex-shrink-0 text-text-dim transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="flex flex-col gap-2 border-t border-border px-3 py-3">
          <Row label={<>❤️ {t("playerHeartTeam")}</>} value={choices.heartTeam} empty={t("playerNoChoice")} />
          <Row
            label={<>{choices.nation ? nationFlagEmoji(choices.nation.code) : "🏳️"} {t("playerFavoriteNation")}</>}
            value={choices.nation?.name ?? null}
            empty={t("playerNoChoice")}
          />
          {courseIds.map((stageId) => {
            const course = choices.courses.find((c) => c.stageId === stageId);
            const carrier = revealed.find((p) => p.stageId === stageId);
            return (
              <div key={stageId} className="flex flex-col gap-1.5 rounded-xl border border-border bg-bg px-3.5 py-2.5">
                <div className="font-display text-[11px] font-bold uppercase tracking-wider text-ice">{course?.courseName ?? carrier?.courseName}</div>
                {course?.jerseys.map((j) => (
                  <div key={j.jersey} className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="text-text-dim">{tJerseys(`jersey_${j.jersey}`)}</span>
                    <span className="flex min-w-0 items-center gap-1.5 font-semibold text-frost">
                      {j.nationCode && <span>{nationFlagEmoji(j.nationCode)}</span>}
                      <span className="truncate">{j.name}</span>
                      {j.points != null && j.points > 0 && <span className="whitespace-nowrap text-[11px] font-bold text-gold">+{Math.round(j.points)}</span>}
                    </span>
                  </div>
                ))}
                {course?.grandTourTeam && (
                  <div className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="text-text-dim">❤️ {t("playerGrandTourTeam")}</span>
                    <span className="truncate font-semibold text-frost">{course.grandTourTeam}</span>
                  </div>
                )}
                {carrier && (
                  <div className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="text-text-dim">💧 {t("playerWaterCarrier")}</span>
                    <span className="flex min-w-0 items-center gap-1.5 font-semibold text-ice">
                      {carrier.nationCode && <span>{nationFlagEmoji(carrier.nationCode)}</span>}
                      <span className="truncate">{carrier.name}</span>
                    </span>
                  </div>
                )}
              </div>
            );
          })}
          <div className="px-1 text-[11px] leading-snug text-text-dim">{t("playerChoicesHint")}</div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, empty }: { label: ReactNode; value: string | null; empty: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-bg px-3.5 py-2.5 text-[13px]">
      <span className="text-text-dim">{label}</span>
      <span className={`truncate font-semibold ${value ? "text-frost" : "text-text-dim"}`}>{value ?? empty}</span>
    </div>
  );
}
