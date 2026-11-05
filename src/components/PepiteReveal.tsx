import { useTranslations } from "next-intl";
import { nationFlagEmoji } from "@/lib/nationFlags";
import { formatPoints } from "@/components/PredictionBreakdown";
import type { LastResult } from "@/lib/lastResult";

/**
 * Révélation de la Pépite cachée dans le résultat d'une course (accueil, étape de la semaine,
 * page de la course) : sa place, son nom et les points qu'elle ajoute au score de la course.
 */
export function PepiteReveal({ pepite }: { pepite: NonNullable<LastResult["pepite"]> }) {
  const t = useTranslations("Home");
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-ice/60 bg-ice-soft px-3.5 py-3">
      <div className="flex items-center gap-2 font-display text-[13px] font-bold text-ice">
        <span className="text-base">💧</span>
        {t("pepiteRevealTitle")}
      </div>
      <div className="flex items-center gap-2.5">
        <div className="whitespace-nowrap font-display text-base font-extrabold text-frost">{t("pepiteRevealRank", { rank: pepite.rank })}</div>
        <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[15px] font-bold">
          <span>{nationFlagEmoji(pepite.nationCode)}</span>
          <span className="truncate">{pepite.name}</span>
        </div>
        <div className="whitespace-nowrap font-display text-lg font-extrabold text-ice">{formatPoints(pepite.points)}</div>
      </div>
      <div className="text-[11px] leading-snug text-text-dim">{t("pepiteRevealHint")}</div>
    </div>
  );
}
