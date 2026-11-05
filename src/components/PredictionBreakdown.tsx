import { useTranslations } from "next-intl";
import { nationFlagEmoji } from "@/lib/nationFlags";
import type { LastResultExtra, LastResultPick } from "@/lib/lastResult";
import { ShootingDots } from "./ShootingDots";

const COMBINATION_KINDS: LastResultExtra["kind"][] = ["top3", "top5", "top10", "pronoParfait"];

export function formatPoints(points: number) {
  // Arrondi au dixième : les cotes décimales multipliées donnent des flottants (2.1 × 3 = 6.300000000000001).
  const rounded = Math.round(points * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded} pts`;
}

/** Pictos Fusée (top 3 du temps de ski, avec le rang si 2e ou 3e) et Gâchette (sans-faute au tir). */
export function FuseeGachetteBadges({ skiRank, gachette }: { skiRank: number | null; gachette: boolean }) {
  const t = useTranslations("Home");
  const fusee = skiRank != null && skiRank >= 1 && skiRank <= 3;
  if (!fusee && !gachette) return null;
  return (
    <>
      {fusee && (
        <span title={t("fuseeLabel", { rank: skiRank })} aria-label={t("fuseeLabel", { rank: skiRank })} className="text-[13px]">
          🚀{skiRank! > 1 && <sup className="text-[9px] font-bold text-text-dim">{skiRank}</sup>}
        </span>
      )}
      {gachette && (
        <span title={t("gachetteLabel")} aria-label={t("gachetteLabel")} className="text-[13px]">
          🎯
        </span>
      )}
    </>
  );
}

/**
 * Détail d'un pronostic noté : chaque choix avec sa place, ses pictos
 * Fusée/Gâchette et ses points (dans l'ordre d'arrivée), puis les bonus et
 * malus de course (Top 3/5/10, Prono parfait…). Accueil, page d'une course et pop-up d'un
 * joueur (composant synchrone : utilisable côté serveur comme côté client).
 */
export function PredictionBreakdown({
  picks,
  extras,
  showLegend = true,
  showCalc = false,
}: {
  picks: LastResultPick[];
  extras: LastResultExtra[];
  /** Détail du calcul sous chaque nom (« cote 8 × 25 ») : page de la course seulement. */
  showCalc?: boolean;
  /** Légende Fusée/Gâchette sous les choix (masquée sur l'accueil). */
  showLegend?: boolean;
}) {
  const t = useTranslations("Home");
  const hasFuseeGachette =
    showLegend && picks.some((p) => (p.skiRank != null && p.skiRank <= 3) || p.gachette || p.cardBonus);
  // Bonus de combinaison mis en avant en bandeau vert au-dessus des choix ; les autres restent en bas.
  const combination = extras.find((e) => COMBINATION_KINDS.includes(e.kind) && e.points > 0);
  const otherExtras = extras.filter((e) => e !== combination);

  return (
    <>
      {combination && (
        <div className="flex items-center gap-2 rounded-xl border border-green/40 bg-green/10 px-3 py-2.5 text-[13px]">
          <span>{combination.kind === "pronoParfait" ? "⭐" : "🏅"}</span>
          <span className="font-display font-bold text-green">
            {combination.kind === "pronoParfait" ? t("lastResultExtra_pronoParfait") : t("comboBonusLabel")}
          </span>
          {combination.kind !== "pronoParfait" && (
            <span className="rounded-full bg-green/15 px-2 py-0.5 font-display text-[11px] font-bold text-green">
              {t(`comboTier_${combination.kind}`)}
            </span>
          )}
          <span className="ml-auto whitespace-nowrap font-display font-bold text-green">{formatPoints(combination.points)}</span>
        </div>
      )}

      {picks.map((pick) => {
        const negative = pick.points != null && pick.points < 0;
        return (
          <div
            key={pick.key}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-[13px] ${
              negative ? "border-red/50 bg-red/10" : "border-transparent bg-card2"
            } ${pick.points == null ? "opacity-60" : ""}`}
          >
            <div className="w-7 flex-shrink-0 font-display font-bold text-text-dim">
              {pick.rank != null ? `${pick.rank}.` : t("lastResultUnranked")}
            </div>
            <div className="text-sm">{nationFlagEmoji(pick.nationCode)}</div>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex min-w-0 items-center gap-1 truncate font-semibold">
                <span className="truncate">{pick.name}</span>
                {pick.caFarte && <span className="text-[11px] text-ice">×3</span>}
                {pick.nationalDay && <span className="rounded bg-gold-soft px-1 font-display text-[10px] font-bold text-gold">×2</span>}
                <FuseeGachetteBadges skiRank={pick.skiRank} gachette={pick.gachette} />
              </div>
              {showCalc && <CalcDetail odds={pick.odds} rankMultiplier={pick.rankMultiplier} cardBonus={pick.cardBonus} />}
              {pick.penalty && <PenaltyLine penalty={pick.penalty} />}
            </div>
            <ShootingDots shootings={pick.shootings} />
            <div
              className={`whitespace-nowrap font-display font-bold ${
                pick.points == null
                  ? "text-[11px] font-semibold text-text-dim"
                  : negative
                    ? "text-red"
                    : pick.points > 0
                      ? "text-gold"
                      : "text-text-dim"
              }`}
            >
              {pick.points == null ? t("lastResultNotCounted") : formatPoints(pick.points)}
            </div>
          </div>
        );
      })}

      {otherExtras.map((extra) => (
        <div key={extra.kind} className="flex items-center gap-2 px-3 text-[12px] text-text-dim">
          <div className="flex-1">
            {extra.kind === "pepite" && "💧 "}
            {t(`lastResultExtra_${extra.kind}`)}
          </div>
          <div className={`font-display font-bold ${extra.points < 0 ? "text-red" : "text-gold"}`}>{formatPoints(extra.points)}</div>
        </div>
      ))}

      {hasFuseeGachette && <FuseeGachetteLegend />}
    </>
  );
}

export function FuseeGachetteLegend() {
  const t = useTranslations("Home");
  return <div className="px-3 text-[11px] text-text-dim">{t("fuseeGachetteLegend")}</div>;
}

/** Détail du calcul d'une ligne : « cote 8 × 25 », plus les cartes Fusée/Gâchette du joueur (page de la course). */
export function CalcDetail({
  odds,
  rankMultiplier,
  cardBonus = null,
}: {
  odds: number | null;
  rankMultiplier: number | null;
  cardBonus?: LastResultPick["cardBonus"];
}) {
  const t = useTranslations("Race");
  if (odds == null) return null;
  const parts = [rankMultiplier != null ? t("calcDetail", { odds, multiplier: rankMultiplier }) : t("calcOddsOnly", { odds })];
  if (cardBonus?.fusee) parts.push(`🚀 ${cardBonus.fusee}`);
  if (cardBonus?.gachette) parts.push(`🎯 ${cardBonus.gachette}`);
  return <div className="truncate text-[11px] font-normal text-text-dim">{parts.join(" + ")}</div>;
}

/** Tour de péna : malus de l'athlète, séparé de ses points, en rouge sur une 2e ligne. */
export function PenaltyLine({ penalty }: { penalty: { laps: number; points: number } }) {
  const t = useTranslations("Race");
  return (
    <div className="text-[11px] font-semibold text-red">
      🔁 {t("penaltyLapsMalus", { count: penalty.laps, points: formatPoints(penalty.points) })}
    </div>
  );
}
