"use client";

import { useTranslations } from "next-intl";
import { nationFlagEmoji } from "@/lib/nationFlags";
import type { PlayerRaceDetail } from "./actions";

const round = (points: number) => Math.round(points * 10) / 10;
const signed = (points: number) => `${points > 0 ? "+" : ""}${round(points)}`;

/**
 * Fiche d'un joueur (Classement), étape terminée : ses coureurs (ou ses équipes sur un CLM par
 * équipes) les uns sous les autres, avec leur place et une barre proportionnelle aux points rapportés ;
 * le porteur d'eau révélé sur l'étape en turquoise ; les bonus en pastilles (variante « barres
 * compactes » de Biathlonpronos, Guillaume, 26/11/2026).
 */
export function PlayerRaceBars({ detail }: { detail: PlayerRaceDetail }) {
  const t = useTranslations("Home");
  const max = Math.max(1, ...detail.picks.map((p) => p.points ?? 0), detail.pepite?.points ?? 0);
  const width = (points: number | null) => `${Math.max(0, Math.min(100, ((points ?? 0) / max) * 100))}%`;
  const rankLabel = (rank: number | null) => (rank == null ? t("lastResultUnranked") : t("pepiteRevealRank", { rank }));

  return (
    <div className="flex flex-col gap-1.5">
      {detail.picks.map((pick) => (
        <div key={pick.key} className="grid grid-cols-[2rem_1fr_3.25rem] items-center gap-2 text-[12.5px]">
          <div className={`font-display text-xs font-bold ${pick.rank != null && pick.rank <= 10 ? "text-ice" : "text-text-dim"}`}>
            {rankLabel(pick.rank)}
          </div>
          <div className="relative flex h-6 items-center overflow-hidden rounded-lg bg-text-dim/10 px-2">
            <div
              className="absolute inset-y-0 left-0 rounded-lg bg-gradient-to-r from-gold/40 to-gold/15"
              style={{ width: width(pick.points) }}
            />
            <span className="relative truncate font-semibold">
              {pick.nationCode ? <>{nationFlagEmoji(pick.nationCode)}&nbsp; </> : null}{pick.name}
            </span>
          </div>
          <div
            className={`whitespace-nowrap text-right font-display font-bold ${
              pick.points ? (pick.points > 0 ? "text-gold" : "text-red") : "text-text-dim"
            }`}
          >
            {pick.points == null ? "–" : pick.points ? signed(pick.points) : "0"}
          </div>
        </div>
      ))}
      {detail.pepite && (
        <div className="grid grid-cols-[2rem_1fr_3.25rem] items-center gap-2 text-[12.5px]">
          <div className="font-display text-xs font-bold text-ice">{rankLabel(detail.pepite.rank)}</div>
          <div className="relative flex h-6 items-center overflow-hidden rounded-lg bg-text-dim/10 px-2">
            <div
              className="absolute inset-y-0 left-0 rounded-lg bg-gradient-to-r from-ice/45 to-ice/15"
              style={{ width: width(detail.pepite.points) }}
            />
            <span className="relative truncate font-semibold">
              💧 {nationFlagEmoji(detail.pepite.nationCode)}&nbsp; {detail.pepite.name}
              <span className="text-[11px] font-bold text-ice"> · {t("playerPepiteTag")}</span>
            </span>
          </div>
          <div className="whitespace-nowrap text-right font-display font-bold text-ice">{signed(detail.pepite.points)}</div>
        </div>
      )}
      {detail.extras.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pl-10 pt-0.5">
          {detail.extras.map((extra) => (
            <span
              key={extra.labelKey}
              className={`rounded-full px-2.5 py-0.5 font-display text-[11px] font-bold ${
                extra.points < 0 ? "bg-red/15 text-red" : "bg-green/15 text-green"
              }`}
            >
              {t(extra.labelKey)} {signed(extra.points)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
