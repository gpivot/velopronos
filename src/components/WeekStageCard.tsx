import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ChevronDownIcon, ChevronRightIcon } from "@/components/icons";
import { Countdown } from "@/components/Countdown";
import { ResultBody } from "@/components/LastResultCard";
import { formatPoints } from "@/components/PredictionBreakdown";
import { nationFlagEmoji } from "@/lib/nationFlags";
import { DISPLAY_TIME_ZONE } from "@/lib/displayTimeZone";
import { raceTitle } from "@/lib/raceLabel";
import type { WeekStage, WeekStageRace } from "@/lib/weekStage";
import type { LastResult } from "@/lib/lastResult";
import { SPECIAL_RULE_ICONS, isBonusRule } from "@/lib/specialRules";
import { courseLook, isMultiStage } from "@/lib/velo/courseLook";

/**
 * Encart « L'étape de la semaine » de l'accueil : bandeau de l'étape (drapeau, lieu, dates), puis
 * toutes ses courses avec leur statut, chacune dépliable sur le résultat (course notée) ou le
 * pronostic du joueur. La course du moment (cf. pickWeekFeature) est dépliée d'office.
 * Étapes et courses spéciales signalées comme dans Ma saison : bandeau doré « Championnats du
 * monde » (coefficient 2), bandeau rouge des courses malus, doré de la Fête nationale, « Bonus ×2 ».
 */
export async function WeekStageCard({
  stage,
  results,
  nowMs,
  locale,
}: {
  stage: WeekStage;
  /** Résultats des courses notées, par course. */
  results: Record<string, LastResult>;
  nowMs: number;
  locale: string;
}) {
  const [t, tFormat, tSex, tRace, tCourses, tChampions] = await Promise.all([
    getTranslations("Home"),
    getTranslations("RaceFormat"),
    getTranslations("Sex"),
    getTranslations("Race"),
    getTranslations("Courses"),
    getTranslations("Champions"),
  ]);
  const day = (date: string) =>
    new Date(`${date.slice(0, 10)}T12:00:00Z`).toLocaleDateString(locale, { timeZone: DISPLAY_TIME_ZONE, day: "numeric", month: "short" });

  // Coefficient 2 : Monument (ocre) ou Championnats du monde (or), comme dans Ma saison.
  const isChampionship = stage.coefficient === 2 && stage.countsInStandings;
  const isWorlds = isChampionship && stage.look === "worlds";
  // Course hors classement : bandeau grisé, sans mention (demande de Guillaume du 05/11/2026).
  const isOffStandings = !stage.countsInStandings;
  const isOneDay = !isMultiStage(stage.look);

  return (
    <div className="flex flex-col gap-2">
      <div className="font-display text-xs font-bold uppercase tracking-wider text-text-dim">{t("weekStageTitle")}</div>
      <div className={`overflow-hidden rounded-2xl border bg-card ${
          isOffStandings ? "border-dashed border-text-dim/40" : isWorlds ? "border-champ/70" : isChampionship ? "border-gold/60" : "border-ice/50"
        }`}>
        <Link
          href={`/courses?etape=${stage.id}`}
          className={`flex items-center gap-2 px-4 py-2.5 font-display text-[13px] font-bold uppercase tracking-wide ${
            isOffStandings ? "bg-text-dim/20 text-text-dim" : isWorlds ? "bg-champ text-bg" : isChampionship ? "bg-gold text-bg" : "bg-ice text-on-ice"
          }`}
        >
          <span className="text-base">{stage.look === "bonus" ? "🏆" : nationFlagEmoji(stage.countryCode)}</span>
          <span className="flex min-w-0 flex-1 flex-col">
            {isChampionship && !isWorlds && (
              <span className="text-[10px] leading-tight tracking-wider opacity-80">{tCourses("lookMonument")}</span>
            )}
            <span className="truncate">{stage.location}</span>
          </span>
          {isChampionship && (
            <span className="whitespace-nowrap rounded-full bg-bg/15 px-2 py-0.5 text-[10px]">{t("coefficientBadge")}</span>
          )}
          <span className="whitespace-nowrap font-semibold normal-case">
            {isOneDay || stage.startsOn === stage.endsOn ? day(stage.startsOn) : `${day(stage.startsOn)} – ${day(stage.endsOn)}`}
          </span>
        </Link>

        {stage.look === "bonus" ? (
          // WE des Champions : écran à part (1 coureur par pays, sans cote).
          <Link href={`/champions/${stage.id}`} className="flex items-center gap-3 px-4 py-3">
            <span className="text-lg">🏆</span>
            <span className="flex flex-1 flex-col">
              <span className="text-sm font-semibold">{tChampions("link")}</span>
              <span className="text-xs text-text-dim">{tChampions("link_hint")}</span>
            </span>
            <ChevronRightIcon className="h-4 w-4 flex-shrink-0 text-text-dim" />
          </Link>
        ) : (
          stage.races.length === 0 && <div className="px-4 py-3 text-[13px] text-text-dim">{tCourses("noRacesInStage")}</div>
        )}

        {stage.races.map((race) => {
          const result = results[race.id] ?? null;
          const points = result?.prediction?.points ?? result?.pepite?.points ?? null;
          const bonus = isBonusRule(race.specialRule);
          return (
            <details key={race.id} open={race.id === stage.openRaceId} className="group border-t border-border first-of-type:border-t-0">
              <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                {race.specialRule && (
                  // Course malus : bandeau rouge avec le picto du malus ; Fête nationale : bandeau doré.
                  <div
                    className={`flex items-center gap-1.5 px-4 py-1 font-display text-[11px] font-bold uppercase tracking-wide ${
                      bonus ? "bg-gold text-bg" : "bg-red text-white"
                    }`}
                  >
                    <span>{SPECIAL_RULE_ICONS[race.specialRule] ?? "⚠️"}</span>
                    {tCourses(bonus ? "specialBonusBanner" : "specialRaceBanner", { name: tFormat(`specialRule_${race.specialRule}`) })}
                  </div>
                )}
                <div className="flex items-center gap-3 px-4 py-3">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="truncate text-sm font-semibold">
                    {raceTitle(race, tFormat, tRace)}
                  </div>
                  <div className="text-xs text-text-dim first-letter:uppercase">
                    {new Date(race.locksAt).toLocaleString(locale, {
                      timeZone: DISPLAY_TIME_ZONE,
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                  {race.bonusX2 && (
                    <div className="w-fit rounded-full bg-gold-soft px-2 py-0.5 font-display text-[10px] font-bold uppercase text-gold">
                      ⚡ {tRace("bonusX2Badge")}
                    </div>
                  )}
                </div>
                {race.displayStatus === "finished" && points != null && (
                  <div className={`whitespace-nowrap font-display text-sm font-extrabold ${points < 0 ? "text-red" : "text-gold"}`}>
                    {result?.pepite && <span title={result.pepite.name}>💧 </span>}
                    {formatPoints(points)}
                  </div>
                )}
                <StatusPill status={race.displayStatus} label={tRace(`status_${race.displayStatus}`)} />
                <ChevronDownIcon className="h-4 w-4 flex-shrink-0 text-text-dim transition-transform group-open:rotate-180" />
                </div>
              </summary>

              {race.displayStatus === "finished" ? (
                result ? (
                  <div className="border-t border-border bg-bg/40">
                    <ResultBody result={result} compact />
                  </div>
                ) : null
              ) : (
                <div className="flex flex-col gap-2 border-t border-border bg-bg/40 px-4 py-3">
                  <div className="font-display text-[11px] font-bold uppercase tracking-wider text-text-dim">{tRace("myPredictionTitle")}</div>
                  {race.picks ? (
                    <div className="flex flex-col gap-1">
                      {race.picks.map((pick) => (
                        <div key={pick.key} className="flex items-center gap-2 text-[13px]">
                          <span>{nationFlagEmoji(pick.nationCode)}</span>
                          <span className="truncate font-semibold">{pick.name}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[13px] text-text-dim">{t("weekStageNoPrediction")}</div>
                  )}
                  <div className="flex items-center justify-between gap-3 pt-1">
                    {race.displayStatus === "upcoming" ? (
                      <>
                        <Link
                          href={`/courses/${race.id}`}
                          className={`rounded-full px-3.5 py-1.5 font-display text-[12px] font-bold ${
                            race.picks ? "border border-border text-ice" : "bg-ice text-on-ice"
                          }`}
                        >
                          {race.picks ? t("editPredictionButton") : t("toPlayButton")}
                        </Link>
                        <Countdown target={race.locksAt} serverNow={nowMs} />
                      </>
                    ) : (
                      <Link href={`/courses/${race.id}`} className="flex items-center gap-1 font-display text-[13px] font-bold text-ice">
                        {t("lastResultSeeRace")}
                        <ChevronRightIcon className="h-3.5 w-3.5" />
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </details>
          );
        })}
      </div>
    </div>
  );
}

const STATUS_STYLES: Record<WeekStageRace["displayStatus"], string> = {
  upcoming: "border border-border text-text-dim",
  ongoing: "bg-red/15 text-red",
  finished: "bg-ice-soft text-ice",
};

function StatusPill({ status, label }: { status: WeekStageRace["displayStatus"]; label: string }) {
  return (
    <div className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 font-display text-[11px] font-bold ${STATUS_STYLES[status]}`}>
      {status === "ongoing" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red" />}
      {label}
    </div>
  );
}

/** Pas d'étape cette semaine : les biathlètes se reposent. */
export async function RestWeekCard() {
  const t = await getTranslations("Home");
  return (
    <div className="flex flex-col gap-2">
      <div className="font-display text-xs font-bold uppercase tracking-wider text-text-dim">{t("weekStageTitle")}</div>
      <div className="flex items-center gap-3.5 rounded-2xl border border-border bg-card px-4 py-4">
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-ice-soft text-2xl">🏖️</div>
        <div className="text-[13px] font-semibold leading-snug text-frost">{t("restWeek")}</div>
      </div>
    </div>
  );
}

export interface NextStage {
  id: string;
  location: string;
  name?: string | null;
  kind?: string | null;
  category?: string | null;
  coefficient?: number | null;
  country_code: string;
  starts_on: string;
  ends_on: string;
}

/** Petit encart « Prochaine étape » : ouvre Ma saison sur la liste des courses de cette étape. */
export async function NextStageCard({ stage, locale }: { stage: NextStage; locale: string }) {
  const t = await getTranslations("Home");
  const look = courseLook(stage);
  const day = (date: string) =>
    new Date(`${date.slice(0, 10)}T12:00:00Z`).toLocaleDateString(locale, { timeZone: DISPLAY_TIME_ZONE, day: "numeric", month: "short" });
  return (
    <div className="flex flex-col gap-2">
      <div className="font-display text-xs font-bold uppercase tracking-wider text-text-dim">{t("nextStageTitle")}</div>
      <Link
        href={`/courses?etape=${stage.id}`}
        className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3"
      >
        <span className="text-lg">{look === "bonus" ? "🏆" : nationFlagEmoji(stage.country_code)}</span>
        <span className="flex-1 truncate text-sm font-semibold">{stage.name ?? stage.location}</span>
        <span className="whitespace-nowrap text-xs text-text-dim">
          {!isMultiStage(look) || stage.starts_on === stage.ends_on ? day(stage.starts_on) : `${day(stage.starts_on)} – ${day(stage.ends_on)}`}
        </span>
        <ChevronRightIcon className="h-4 w-4 flex-shrink-0 text-text-dim" />
      </Link>
    </div>
  );
}
