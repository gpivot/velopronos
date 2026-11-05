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
  location: string;
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

  return (
    <div className="flex flex-col gap-2.5">
      {stages.map((stage) => {
        const isOpen = stage.id === openStageId;
        // Coefficient 2 = Mondiaux (ou JO) : encart doré pour le distinguer des étapes de Coupe du monde.
        const isChampionship = stage.coefficient === 2;
        // Étape hors classement (×0) : encart grisé, en pointillés.
        const isOffStandings = stage.counts_in_standings === false;
        const toPlayCount = readOnly || stage.opensOn ? 0 : stage.races.filter((r) => r.displayStatus === "upcoming" && !r.predicted).length;
        return (
          <div
            key={stage.id}
            ref={stage.id === scrollToStageId ? scrollIntoViewOnMount : undefined}
            className={`overflow-hidden rounded-2xl border ${
              isOffStandings
                ? "border-dashed border-text-dim/40 bg-text-dim/10"
                : isChampionship
                  ? "border-gold/60 bg-gradient-to-br from-gold/25 to-card shadow-[0_0_24px_-8px_oklch(0.84_0.15_90/0.5)]"
                  : "border-border bg-card"
            }`}
          >
            <button
              onClick={() => setOpenStageId(isOpen ? null : stage.id)}
              className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left"
            >
              <div
                className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-lg ${
                  isOffStandings ? "bg-text-dim/15 grayscale" : isChampionship ? "bg-gold/20" : "bg-ice-soft"
                }`}
              >
                {nationFlagEmoji(stage.country_code)}
              </div>
              <div className="flex flex-1 flex-col gap-0.5">
                {isChampionship && !isOffStandings && (
                  <div className="font-display text-[10px] font-bold uppercase tracking-wider text-gold">
                    {t("worldChampionships")}
                  </div>
                )}
                {isOffStandings && (
                  <div className="font-display text-[10px] font-bold uppercase tracking-wider text-text-dim">
                    {t("offStandingsBadge")}
                  </div>
                )}
                <div className={`text-sm font-semibold ${isOffStandings ? "text-text-dim" : isChampionship ? "text-gold" : ""}`}>
                  {stage.location}
                </div>
                <div className="text-xs text-text-dim">
                  {new Date(stage.starts_on).toLocaleDateString(locale, { timeZone: DISPLAY_TIME_ZONE, day: "numeric", month: "short" })}
                  {" – "}
                  {new Date(stage.ends_on).toLocaleDateString(locale, { timeZone: DISPLAY_TIME_ZONE, day: "numeric", month: "short" })}
                </div>
              </div>
              {isOffStandings && (
                <div className="whitespace-nowrap rounded-full border border-text-dim/40 px-2.5 py-1 font-display text-[11px] font-bold text-text-dim">
                  ×0
                </div>
              )}
              {stage.coefficient === 2 && !isOffStandings && (
                <div className="whitespace-nowrap rounded-full bg-gold-soft px-2.5 py-1 font-display text-[11px] font-bold text-gold">
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
                  isOffStandings ? "border-dashed border-text-dim/30" : isChampionship ? "border-gold/30" : "border-border"
                }`}
              >
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
                {stage.races.length === 0 ? (
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
