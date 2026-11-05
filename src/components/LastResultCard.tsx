import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ChevronRightIcon } from "@/components/icons";
import { nationFlagEmoji } from "@/lib/nationFlags";
import { DISPLAY_TIME_ZONE } from "@/lib/displayTimeZone";
import { raceTitle } from "@/lib/raceLabel";
import type { LastResult, LastResultExtra, LastResultPick } from "@/lib/lastResult";
import { PepiteReveal } from "@/components/PepiteReveal";
import { FuseeGachetteBadges, PenaltyLine, PredictionBreakdown, formatPoints } from "@/components/PredictionBreakdown";

const MEDALS = ["🥇", "🥈", "🥉"];

/**
 * Encart « Dernier résultat » de l'accueil, façon VéloPronos ; « Derniers
 * résultats » quand plusieurs courses ont été notées le même jour.
 */
export async function LastResultCard({ results, locale }: { results: LastResult[]; locale: string }) {
  const t = await getTranslations("Home");
  return (
    <div className="flex flex-col gap-2">
      <div className="font-display text-xs font-bold uppercase tracking-wider text-text-dim">
        {results.length > 1 ? t("lastResultsTitle") : t("lastResultTitle")}
      </div>
      {results.map((result) => (
        <SingleResultCard key={result.raceId} result={result} locale={locale} />
      ))}
    </div>
  );
}

export async function SingleResultCard({ result, locale }: { result: LastResult; locale: string }) {
  const [t, tFormat, tRace] = await Promise.all([
    getTranslations("Home"),
    getTranslations("RaceFormat"),
    getTranslations("Race"),
  ]);
  const prediction = result.prediction;

  return (
    <div className="overflow-hidden rounded-2xl border border-ice/50 bg-card">
      <div className="flex items-center gap-2 bg-ice px-4 py-2 font-display text-[12px] font-bold uppercase tracking-wide text-on-ice">
        <span className="text-sm">{nationFlagEmoji(result.countryCode)}</span>
        <span className="flex-1 truncate">{result.location}</span>
        <span className="whitespace-nowrap font-semibold normal-case">
          {new Date(result.locksAt).toLocaleDateString(locale, { timeZone: DISPLAY_TIME_ZONE, day: "numeric", month: "short" })}
        </span>
      </div>

      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <div className="flex-1 text-sm font-semibold">
          {raceTitle(result, tFormat, tRace)}
        </div>
        {result.coefficient === 2 && result.countsInStandings !== false && (
          <div className="whitespace-nowrap rounded-full bg-gold-soft px-2 py-0.5 font-display text-[10px] font-bold text-gold">
            {t("coefficientBadge")}
          </div>
        )}
        {result.countsInStandings === false && (
          <div className="whitespace-nowrap rounded-full border border-dashed border-text-dim/40 px-2 py-0.5 font-display text-[10px] font-bold text-text-dim">
            ×0 · {t("offStandingsBadge")}
          </div>
        )}
        {prediction ? (
          <div className={`font-display text-base font-extrabold ${prediction.points < 0 ? "text-red" : "text-gold"}`}>
            {formatPoints(prediction.points)}
          </div>
        ) : (
          result.pepite && <div className="font-display text-base font-extrabold text-gold">{formatPoints(result.pepite.points)}</div>
        )}
      </div>

      <ResultBody result={result} />
    </div>
  );
}

/** Détail d'un résultat (place du joueur, ×2/carte, choix, podium) : encart « Dernier résultat » et étape de la semaine. */
export async function ResultBody({
  result,
  compact = false,
}: {
  result: LastResult;
  /** Étape de la semaine : sans podium, choix en lignes serrées façon podium (pas d'encadrés). */
  compact?: boolean;
}) {
  const [t, tCards] = await Promise.all([getTranslations("Home"), getTranslations("BonusCards")]);
  const prediction = result.prediction;
  const isWinner = prediction?.playerRank === 1 && prediction.points > 0;
  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <Link
        href={`/courses/${result.raceId}`}
        className="flex items-center justify-center gap-1 font-display text-[13px] font-bold text-ice"
      >
        {t("lastResultSeeRace")}
        <ChevronRightIcon className="h-3.5 w-3.5" />
      </Link>

      {result.pepite && <PepiteReveal pepite={result.pepite} />}

      {prediction ? (
        <>
          {prediction.playerRank && prediction.playerCount > 0 && (
            <div className="text-center font-display text-[14px] font-bold text-gold">
              {isWinner ? `🍾 ${t("lastResultWinner")}` : t("lastResultPlayerRank", { rank: prediction.playerRank, count: prediction.playerCount })}
            </div>
          )}

          {(prediction.multiplier || prediction.card) && (
            <div className="flex flex-wrap justify-center gap-1.5">
              {/* Le ×2 n'est pas compté dans les points de chaque ligne : ce qu'il rapporte est ici. */}
              {prediction.multiplier && (
                <div className="rounded-full bg-gold-soft px-2.5 py-0.5 font-display text-[11px] font-bold text-gold">
                  {prediction.multiplier.kind === "bonusX2" && "⚡ "}
                  {t(`lastResultMultiplier_${prediction.multiplier.kind}`, { points: formatPoints(prediction.multiplier.gain) })}
                </div>
              )}
              {prediction.card && (
                <div className="rounded-full bg-ice-soft px-2.5 py-0.5 font-display text-[11px] font-bold text-ice">
                  🃏 {tCards(`name_${prediction.card}`)}
                </div>
              )}
            </div>
          )}

          {compact ? (
            <CompactPicks picks={prediction.picks} extras={prediction.extras} />
          ) : (
            <PredictionBreakdown picks={prediction.picks} extras={prediction.extras} showLegend={false} />
          )}
        </>
      ) : (
        <div className="text-center text-[13px] text-text-dim">{t("lastResultNoPrediction")}</div>
      )}

      {!compact && result.podium.length > 0 && (
        <div className="mt-1 flex flex-col gap-1 border-t border-border pt-2.5">
          <div className="font-display text-[11px] font-bold uppercase tracking-wider text-text-dim">{t("lastResultPodium")}</div>
          {result.podium.map((row) => (
            <div key={`${row.rank}-${row.name}`} className="flex items-center gap-2 text-[13px]">
              <span>{MEDALS[row.rank - 1]}</span>
              <span>{nationFlagEmoji(row.nationCode)}</span>
              <span className="truncate font-semibold">{row.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Choix du joueur en lignes serrées (place, drapeau, nom, pictos, points), comme le podium. */
async function CompactPicks({ picks, extras }: { picks: LastResultPick[]; extras: LastResultExtra[] }) {
  const t = await getTranslations("Home");
  return (
    <div className="flex flex-col gap-1">
      {picks.map((pick) => (
        <div key={pick.key} className={`flex items-center gap-2 text-[13px] ${pick.points == null ? "opacity-60" : ""}`}>
          <span className="w-7 flex-shrink-0 font-display font-bold text-text-dim">
            {pick.rank != null ? `${pick.rank}.` : t("lastResultUnranked")}
          </span>
          <span>{nationFlagEmoji(pick.nationCode)}</span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex min-w-0 items-center gap-1 font-semibold">
              <span className="truncate">{pick.name}</span>
              {pick.caFarte && <span className="text-[11px] text-ice">×3</span>}
              {pick.nationalDay && <span className="rounded bg-gold-soft px-1 font-display text-[10px] font-bold text-gold">×2</span>}
              <FuseeGachetteBadges skiRank={pick.skiRank} gachette={pick.gachette} />
            </span>
            {pick.penalty && <PenaltyLine penalty={pick.penalty} />}
          </span>
          <span
            className={`whitespace-nowrap font-display text-[12px] font-bold ${
              pick.points == null ? "font-semibold text-text-dim" : pick.points < 0 ? "text-red" : pick.points > 0 ? "text-gold" : "text-text-dim"
            }`}
          >
            {pick.points == null ? t("lastResultNotCounted") : formatPoints(pick.points)}
          </span>
        </div>
      ))}
      {extras.map((extra) => (
        <div key={extra.kind} className="flex items-center gap-2 text-[12px] text-text-dim">
          <span className="w-7 flex-shrink-0 text-center">{extra.kind === "pronoParfait" ? "⭐" : extra.kind === "pepite" ? "💧" : extra.points < 0 ? "⚠️" : "🏅"}</span>
          <span className="flex-1">{t(`lastResultExtra_${extra.kind}`)}</span>
          <span className={`whitespace-nowrap font-display text-[12px] font-bold ${extra.points < 0 ? "text-red" : "text-green"}`}>
            {formatPoints(extra.points)}
          </span>
        </div>
      ))}
    </div>
  );
}
