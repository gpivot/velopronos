import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { nationFlagEmoji } from "@/lib/nationFlags";
import { raceTitle } from "@/lib/raceLabel";
import type { SeasonJokers } from "@/lib/seasonView";

/**
 * Classement, encadré « Mon classement » : jokers de fin de saison. Avant leur activation par l'admin, un aperçu (« si la
 * saison s'arrêtait aujourd'hui ») ; ensuite, les résultats effacés et leur effet sur le total.
 */
export function JokersCard({ jokers }: { jokers: SeasonJokers }) {
  const t = useTranslations("Courses");
  const tFormat = useTranslations("RaceFormat");
  const tRace = useTranslations("Race");
  const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

  return (
    <details className="group border-t border-border pt-3">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-[12px] text-text-dim">
        <span>🃏</span>
        <span className="flex-1">{t("jokersDiscover")}</span>
        <span className="inline-block transition-transform group-open:rotate-90">›</span>
      </summary>
      <div className="flex flex-col gap-2 pt-3">
        <p className="text-[12px] leading-relaxed text-text-dim">{t("jokersHelp")}</p>
        <div className="text-[12px] text-text-dim">
          {jokers.applied ? t("jokersApplied") : t("jokersPreview")} :{" "}
          <span className={`font-bold ${jokers.delta < 0 ? "text-red" : "text-ice"}`}>{t("jokersDelta", { points: signed(jokers.delta) })}</span>
        </div>
        {jokers.erased.length === 0 ? (
          <div className="text-[12px] text-text-dim">{t("jokersNone")}</div>
        ) : (
          jokers.erased.map((line) => {
            return (
              <Link
                key={line.raceId}
                href={`/courses/${line.raceId}`}
                className="flex items-center gap-2.5 rounded-xl bg-card2 px-3 py-2 text-[13px]"
              >
                <span>{nationFlagEmoji(line.countryCode)}</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-semibold">
                    {raceTitle(line, tFormat, tRace)}
                  </span>
                  <span className="truncate text-[11px] text-text-dim">{line.location}</span>
                </span>
                <span className="whitespace-nowrap text-[12px] font-bold text-text-dim">
                  {line.played ? t("jokersPoints", { points: Math.round(line.points * 10) / 10 }) : t("jokersNotPlayed")}
                </span>
              </Link>
            );
          })
        )}
      </div>
    </details>
  );
}
