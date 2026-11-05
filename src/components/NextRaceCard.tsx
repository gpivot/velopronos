import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Countdown } from "@/components/Countdown";
import { PredictedBadge } from "@/components/PredictedBadge";
import { nationFlagEmoji } from "@/lib/nationFlags";
import { DISPLAY_TIME_ZONE } from "@/lib/displayTimeZone";
import { raceTitle } from "@/lib/raceLabel";

export interface NextRace {
  id: string;
  format: string;
  stage_number?: number | null;
  sex: string | null;
  locks_at: string;
  stages: { location: string; country_code: string };
  /** Le joueur connecté a déjà déposé un pronostic sur cette course. */
  predicted: boolean;
  /** Jour d'ouverture des pronostics de l'étape ("2027-01-02") s'ils sont encore fermés. */
  opensOn: string | null;
}

/** Encart « À suivre » de l'accueil : la prochaine course, avec compte à rebours jusqu'au départ. */
export async function NextRaceCard({ race, nowMs, locale }: { race: NextRace; nowMs: number; locale: string }) {
  const [t, tFormat, tSex, tRace, tCourses] = await Promise.all([
    getTranslations("Home"),
    getTranslations("RaceFormat"),
    getTranslations("Sex"),
    getTranslations("Race"),
    getTranslations("Courses"),
  ]);

  return (
    <div className="flex flex-col gap-2">
      <div className="font-display text-xs font-bold uppercase tracking-wider text-text-dim">{t("nextRaceTitle")}</div>
      <Link
        href={`/courses/${race.id}`}
        className="flex items-center gap-3.5 rounded-2xl border border-border bg-card px-4 py-3.5"
      >
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-ice-soft text-lg">
          {nationFlagEmoji(race.stages.country_code)}
        </div>
        <div className="flex flex-1 flex-col gap-0.5">
          <div className="text-sm font-semibold">{race.stages.location}</div>
          <div className="text-xs text-text-dim">
            {raceTitle(race, tFormat, tRace)}
          </div>
          {race.predicted ? (
            <PredictedBadge label={tRace("predicted")} />
          ) : race.opensOn ? (
            <span className="mt-1 w-fit whitespace-nowrap rounded-full border border-border px-3 py-1 font-display text-[11px] font-bold text-text-dim">
              {tCourses("opensOn", {
                date: new Date(`${race.opensOn}T12:00:00Z`).toLocaleDateString(locale, { timeZone: DISPLAY_TIME_ZONE, day: "numeric", month: "short" }),
              })}
            </span>
          ) : (
            <span className="mt-1 w-fit rounded-full bg-ice px-3 py-1 font-display text-[12px] font-bold text-on-ice">
              {t("toPlayButton")}
            </span>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 self-stretch justify-between">
          <div className="whitespace-nowrap text-xs text-text-dim">
            {new Date(race.locks_at).toLocaleDateString(locale, { timeZone: DISPLAY_TIME_ZONE, day: "numeric", month: "short" })}
          </div>
          <Countdown target={race.locks_at} serverNow={nowMs} />
        </div>
      </Link>
    </div>
  );
}
