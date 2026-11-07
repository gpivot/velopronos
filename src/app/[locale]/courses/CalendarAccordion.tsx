"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ChevronDownIcon } from "@/components/icons";
import { PredictedBadge } from "@/components/PredictedBadge";
import { nationFlagEmoji } from "@/lib/nationFlags";
import type { RaceDisplayStatus } from "@/lib/raceStatus";
import { DISPLAY_TIME_ZONE } from "@/lib/displayTimeZone";
import { raceTitle, stageRoute } from "@/lib/raceLabel";
import { SPECIAL_RULE_ICONS, isBonusRule } from "@/lib/specialRules";
import { COURSE_FILTERS, FLAG_STRIPES, courseLook, isMultiStage, matchesCourseFilter, type CourseFilter } from "@/lib/velo/courseLook";

export interface CalendarRace {
  id: string;
  format: string;
  sex: string | null;
  locks_at: string;
  displayStatus: RaceDisplayStatus;
  /** Le joueur connecté a déjà déposé un pronostic sur cette course. */
  predicted: boolean;
  /** Biathlètes (ou nation) pronostiqués, à la place de l'ancien onglet « Ma saison ». */
  names: string | null;
  bonusX2: boolean;
  /** Points marqués une fois la course notée. */
  points: number | null;
  /** Course malus (tour_de_pena, brouillard, tes_colle). */
  special_rule: string | null;
  /** VéloPronos : numéro (0 = prologue, null = classique), villes et distance. */
  stage_number?: number | null;
  start_city?: string | null;
  end_city?: string | null;
  distance_km?: number | null;
}

export interface CalendarStage {
  id: string;
  /** Nom de la course. */
  location: string;
  /** VéloPronos : type et catégorie de la course, couleur du maillot de leader. */
  kind?: string | null;
  category?: string | null;
  jerseyColor?: string | null;
  country_code: string;
  starts_on: string;
  ends_on: string;
  coefficient: 1 | 2;
  /** false : étape « Autre (×0) », hors classement de la saison (affichée grisée). */
  counts_in_standings?: boolean;
  /** Jour d'ouverture des pronostics ("2027-01-02") tant qu'ils sont fermés (7 jours avant l'étape), null sinon. */
  opensOn: string | null;
  /** VéloPronos : nombre de maillots pronostiqués sur la course, et choisis par le joueur. */
  jerseys?: number;
  jerseysPicked?: number;
  /** WE des Champions : pronostics posés sur le nombre de championnats. */
  champions?: { done: number; total: number };
  /** Grand Tour : porteur d'eau du joueur (choisi ou pas, révélé ou pas). Absent sinon. */
  waterCarrier?: { name: string | null; nationCode: string | null; revealed: boolean; locked: boolean } | null;
  races: CalendarRace[];
}

const STATUS_STYLES: Record<RaceDisplayStatus, string> = {
  upcoming: "border border-border text-text-dim",
  ongoing: "bg-gold-soft text-gold",
  finished: "bg-ice-soft text-ice",
};

export function CalendarAccordion({
  stages,
  defaultOpenStageId,
  scrollToStageId = null,
  locale,
  readOnly = false,
}: {
  stages: CalendarStage[];
  defaultOpenStageId: string | null;
  /** Étape demandée par l'accueil : la page défile jusqu'à elle. */
  scrollToStageId?: string | null;
  locale: string;
  /** Saison d'un autre joueur (pop-up du Classement) : pas de « À jouer ». */
  readOnly?: boolean;
}) {
  const [openStageId, setOpenStageId] = useState<string | null>(defaultOpenStageId);
  const t = useTranslations("Courses");
  const tFormat = useTranslations("RaceFormat");
  const tRace = useTranslations("Race");
  const tJerseys = useTranslations("Jerseys");
  const tChampions = useTranslations("Champions");

  const [filter, setFilter] = useState<CourseFilter>("all");
  const looks = new Map(stages.map((stage) => [stage.id, courseLook(stage)]));
  // Filtres proposés : seulement les types présents dans la saison.
  const filters = COURSE_FILTERS.filter((f) => f === "all" || stages.some((st) => matchesCourseFilter(looks.get(st.id)!, f, st.counts_in_standings !== false)));
  const shown = stages.filter((stage) => matchesCourseFilter(looks.get(stage.id)!, filter, stage.counts_in_standings !== false));
  const day = (date: string) =>
    new Date(`${date.slice(0, 10)}T12:00:00Z`).toLocaleDateString(locale, { timeZone: DISPLAY_TIME_ZONE, day: "numeric", month: "short" });

  return (
    <div className="flex flex-col gap-2.5">
      {filters.length > 2 && (
        <div className="-mx-5 flex gap-1.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
          {filters.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 font-display text-[12px] font-bold ${
                filter === f ? "bg-ice text-on-ice" : "border border-border bg-card text-text-dim"
              }`}
            >
              {t(`filter_${f}`)}
            </button>
          ))}
        </div>
      )}
      {shown.map((stage) => {
        const isOpen = stage.id === openStageId;
        const look = looks.get(stage.id)!;
        const multiStage = isMultiStage(look);
        const isWorlds = look === "worlds";
        const isMonument = look === "monument";
        // Course hors classement (×0) : contour en pointillés, mention seulement une fois dépliée.
        const isOffStandings = stage.counts_in_standings === false;
        const toPlayCount = readOnly || stage.opensOn ? 0 : stage.races.filter((r) => r.displayStatus === "upcoming" && !r.predicted).length;
        // Course par étapes : prochaine étape sur laquelle parier (la 1re avant le départ).
        const nextRace = multiStage ? stage.races.find((r) => r.displayStatus === "upcoming") : undefined;
        const stripes = look === "grand_tour" ? FLAG_STRIPES[stage.country_code] ?? (stage.jerseyColor ? [stage.jerseyColor] : null) : null;
        const accent = look === "grand_tour" ? stage.jerseyColor ?? null : null;
        // Nombre d'étapes affiché seulement une fois les étapes importées.
        const stagesCount = stage.races.length > 0 ? ` · ${t("stagesCount", { count: stage.races.length })}` : "";
        // Mondiaux : pas de mention en majuscules, le nom de la course suffit (demande de Guillaume).
        const eyebrow =
          look === "grand_tour"
            ? `${t("lookGrandTour")}${stagesCount}`
            : look === "stage_race"
              ? `${t("lookStageRace")}${stagesCount}`
              : isMonument
                ? t("lookMonument")
                : null;
        return (
          <div
            key={stage.id}
            ref={stage.id === scrollToStageId ? scrollIntoViewOnMount : undefined}
            style={accent ? { borderColor: accent, boxShadow: `0 0 28px -12px ${accent}` } : undefined}
            className={`relative overflow-hidden ${
              multiStage ? "rounded-[1.75rem] border-2" : "rounded-2xl border"
            } ${
              isOffStandings
                ? "border-dashed border-text-dim/40 bg-card"
                : look === "grand_tour"
                  ? "border-ice/60 bg-gradient-to-br from-ice/10 to-card"
                  : look === "stage_race"
                    ? "border-ice/40 bg-card"
                    : isWorlds
                      ? "border-champ/70 bg-gradient-to-br from-champ/25 to-card shadow-[0_0_24px_-8px_oklch(var(--c-champ)/0.6)]"
                      : isMonument
                        ? "border-gold/60 bg-gradient-to-br from-gold/20 to-card"
                        : "border-border bg-card"
            }`}
          >
            {stripes && (
              // Grand Tour : liseré aux couleurs du pays dans le coin, pour en faire un événement.
              <div aria-hidden className="pointer-events-none absolute -right-11 top-2 w-28 rotate-45 shadow-md">
                {stripes.map((color, i) => (
                  <div key={i} className="h-[5px]" style={{ backgroundColor: color }} />
                ))}
              </div>
            )}
            <button
              onClick={() => setOpenStageId(isOpen ? null : stage.id)}
              className={`flex w-full items-center gap-3.5 px-4 text-left ${multiStage ? "py-5" : "py-3.5"}`}
            >
              <div
                className={`flex flex-shrink-0 items-center justify-center rounded-xl ${multiStage ? "h-12 w-12 text-2xl" : "h-10 w-10 text-lg"} ${
                  isWorlds ? "bg-champ/20" : isMonument ? "bg-gold/20" : "bg-ice-soft"
                }`}
              >
                {/* Week-end des Champions : pas de drapeau, c'est un mode de pari à part. */}
                {look === "bonus" ? "🏆" : nationFlagEmoji(stage.country_code)}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                {eyebrow && (
                  <div
                    className={`font-display text-[10px] font-bold uppercase tracking-wider ${
                      isWorlds ? "text-champ" : isMonument ? "text-gold" : "text-ice"
                    }`}
                  >
                    {eyebrow}
                  </div>
                )}
                <div
                  className={`font-semibold ${multiStage ? "text-base font-bold" : "text-sm"} ${
                    isWorlds ? "text-champ" : isMonument ? "text-gold" : ""
                  }`}
                >
                  {stage.location}
                </div>
                <div className="text-xs text-text-dim">
                  {multiStage && stage.starts_on !== stage.ends_on
                    ? `${day(stage.starts_on)} – ${day(stage.ends_on)}`
                    : day(stage.starts_on)}
                </div>
                {nextRace && (
                  <div className="mt-1 truncate text-xs text-frost">
                    {t(stage.races[0]?.id === nextRace.id ? "firstStage" : "nextStage", {
                      title: raceTitle(nextRace, tFormat, tRace),
                      date: day(new Date(nextRace.locks_at).toLocaleDateString("sv-SE", { timeZone: DISPLAY_TIME_ZONE })),
                    })}
                  </div>
                )}
              </div>
              {stage.coefficient === 2 && !isOffStandings && (
                <div
                  className={`whitespace-nowrap rounded-full px-2.5 py-1 font-display text-[11px] font-bold ${
                    isWorlds ? "bg-champ/20 text-champ" : "bg-gold-soft text-gold"
                  }`}
                >
                  {t("coefficientBadge")}
                </div>
              )}
              {toPlayCount > 0 && (
                <div className="whitespace-nowrap rounded-full bg-ice-soft px-2.5 py-1 font-display text-[11px] font-bold text-ice">
                  {t("toPlayCount", { count: toPlayCount })}
                </div>
              )}
              <ChevronDownIcon
                className={`h-4 w-4 flex-shrink-0 text-text-dim transition-transform ${isOpen ? "rotate-180" : ""}`}
              />
            </button>

            {isOpen && (
              <div
                className={`flex flex-col gap-2 border-t px-3 py-3 ${
                  isOffStandings ? "border-dashed border-text-dim/30" : isWorlds ? "border-champ/30" : isMonument ? "border-gold/30" : "border-border"
                }`}
              >
                {isOffStandings && <div className="px-1.5 text-[11px] italic text-text-dim">{t("offStandingsNote")}</div>}
                {!readOnly && (stage.jerseys ?? 0) > 0 && (
                  <Link
                    href={`/maillots/${stage.id}`}
                    className="flex items-center gap-3 rounded-xl border border-gold/50 bg-gold-soft px-3.5 py-3"
                  >
                    <span className="text-lg">🟡</span>
                    <span className="flex flex-1 flex-col">
                      <span className="text-sm font-semibold">{tJerseys("linkLabel")}</span>
                      <span className="text-xs text-text-dim">
                        {tJerseys("linkCount", { chosen: stage.jerseysPicked ?? 0, total: stage.jerseys ?? 0 })}
                      </span>
                    </span>
                  </Link>
                )}
                {!readOnly && stage.waterCarrier && (
                  // Porteur d'eau : propre à chaque Grand Tour, choisi sur la page des maillots.
                  <Link
                    href={`/maillots/${stage.id}`}
                    className="flex items-center gap-3 rounded-xl border border-ice/40 bg-ice-soft px-3.5 py-3"
                  >
                    <span className="text-lg">💧</span>
                    <span className="flex flex-1 flex-col">
                      <span className="text-sm font-semibold">{tJerseys("waterCarrierTitle")}</span>
                      <span className="text-xs text-text-dim">
                        {stage.waterCarrier.name
                          ? `${stage.waterCarrier.nationCode ? `${nationFlagEmoji(stage.waterCarrier.nationCode)} ` : ""}${stage.waterCarrier.name} · ${
                              stage.waterCarrier.revealed ? tJerseys("waterCarrierRevealed") : tJerseys("waterCarrierHidden")
                            }`
                          : stage.waterCarrier.locked
                            ? tJerseys("notChosen")
                            : tJerseys("waterCarrierChoose")}
                      </span>
                    </span>
                  </Link>
                )}
                {look === "bonus" && (
                  // WE des Champions : écran à part, 1 coureur par pays, sans cote.
                  <Link
                    href={`/champions/${stage.id}`}
                    className="flex items-center gap-3 rounded-xl border border-gold/50 bg-gold-soft px-3.5 py-3"
                  >
                    <span className="text-lg">🏆</span>
                    <span className="flex flex-1 flex-col">
                      <span className="text-sm font-semibold">{tChampions(readOnly ? "title" : "link")}</span>
                      <span className="text-xs text-text-dim">
                        {!readOnly && stage.champions && stage.champions.total > 0
                          ? tChampions("progress", { done: stage.champions.done, total: stage.champions.total })
                          : tChampions("link_hint")}
                      </span>
                    </span>
                    {!readOnly && stage.champions && stage.champions.total > stage.champions.done && !stage.opensOn && stage.ends_on >= new Date().toISOString().slice(0, 10) && (
                      <span className="whitespace-nowrap rounded-full bg-ice px-3 py-1 font-display text-[11px] font-bold text-on-ice">
                        {tChampions("complete")}
                      </span>
                    )}
                  </Link>
                )}
                {look === "bonus" && stage.races.length === 0 ? null : stage.races.length === 0 ? (
                  <div className="px-1.5 py-2 text-[12px] text-text-dim">{t("noRacesInStage")}</div>
                ) : (
                  stage.races.map((race) => {
                    const link = (
                      <Link
                        href={`/courses/${race.id}`}
                        className="flex items-center gap-3 rounded-xl border border-border bg-bg px-3.5 py-3"
                      >
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <div className="text-sm font-semibold">
                            {raceTitle(race, tFormat, tRace)}
                          </div>
                          {stageRoute(race) && <div className="truncate text-xs text-text-dim">{stageRoute(race)}</div>}
                          <div className="text-xs text-text-dim">
                            {new Date(race.locks_at).toLocaleDateString(locale, { timeZone: DISPLAY_TIME_ZONE, day: "numeric", month: "short" })}
                            {" · "}
                            {new Date(race.locks_at).toLocaleTimeString(locale, { timeZone: DISPLAY_TIME_ZONE, hour: "2-digit", minute: "2-digit" })}
                          </div>
                          {race.names && <div className="truncate text-xs text-frost">{race.names}</div>}
                          {race.predicted && race.displayStatus === "upcoming" && <PredictedBadge label={tRace("predicted")} />}
                          {race.bonusX2 && (
                            <div className="w-fit rounded-full bg-gold-soft px-2 py-0.5 font-display text-[10px] font-bold uppercase text-gold">
                              ⚡ {tRace("bonusX2Badge")}
                            </div>
                          )}
                          {!readOnly && race.displayStatus === "upcoming" && !race.predicted && stage.opensOn && (
                            <span className="mt-1 w-fit whitespace-nowrap rounded-full border border-border px-3 py-1 font-display text-[11px] font-bold text-text-dim">
                              {t("opensOn", {
                                date: new Date(`${stage.opensOn}T12:00:00Z`).toLocaleDateString(locale, {
                                  timeZone: DISPLAY_TIME_ZONE,
                                  day: "numeric",
                                  month: "short",
                                }),
                              })}
                            </span>
                          )}
                          {!readOnly && race.displayStatus === "upcoming" && !race.predicted && !stage.opensOn && (
                            // Toute la ligne mène à la page de pronostic : simple pastille, pas un second lien.
                            <span className="mt-1 w-fit rounded-full bg-ice px-3 py-1 font-display text-[12px] font-bold text-on-ice">
                              {t("toPlayButton")}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-shrink-0 flex-col items-end gap-1">
                          <div
                            className={`whitespace-nowrap rounded-full px-2.5 py-1 font-display text-[11px] font-bold ${STATUS_STYLES[race.displayStatus]}`}
                          >
                            {tRace(`status_${race.displayStatus}`)}
                          </div>
                          {race.displayStatus === "finished" && race.points != null && (
                            <div className="whitespace-nowrap font-display text-sm font-bold text-ice">
                              {Math.round(race.points * 10) / 10} pts
                            </div>
                          )}
                        </div>
                      </Link>
                    );
                    if (!race.special_rule) return <div key={race.id}>{link}</div>;
                    // Course malus : bandeau et contour rouges, avec le picto du malus (modèle VéloPronos).
                    // Course bonus (Fête nationale) : même bandeau, en doré.
                    const bonus = isBonusRule(race.special_rule);
                    return (
                      <div key={race.id} className={`overflow-hidden rounded-xl border-2 ${bonus ? "border-gold bg-gold" : "border-red bg-red"}`}>
                        <div className={`flex items-center gap-1.5 px-3 py-1 font-display text-[11px] font-bold uppercase tracking-wide ${bonus ? "text-bg" : "text-white"}`}>
                          <span>{SPECIAL_RULE_ICONS[race.special_rule] ?? "⚠️"}</span>
                          {t(bonus ? "specialBonusBanner" : "specialRaceBanner", { name: tFormat(`specialRule_${race.special_rule}`) })}
                        </div>
                        <div className="[&>a]:rounded-none [&>a]:border-0">{link}</div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function scrollIntoViewOnMount(element: HTMLDivElement | null) {
  element?.scrollIntoView({ block: "start" });
}
