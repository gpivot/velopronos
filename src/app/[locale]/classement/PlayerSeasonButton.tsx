"use client";

import { useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CloseIcon } from "@/components/icons";
import { StreakCard } from "@/components/StreakCard";
import { BonusCardsList } from "@/components/BonusCardsList";
import { PlayerBadgesRow } from "@/components/PlayerBadgesRow";
import { nationFlagEmoji } from "@/lib/nationFlags";
import { CalendarAccordion } from "../courses/CalendarAccordion";
import { getPlayerSeason, type PlayerSeason } from "./actions";

/** Classement « Par étapes » : le pop-up se limite à cette étape (demande de Guillaume, 04/11/2026). */
export interface PlayerStageScope {
  stageId: string;
  rank: number;
  points: number;
  /** En tête de l'étape : dossard rouge. */
  leader: boolean;
  /** Classement d'une seule course de l'étape (rang et points de cette course). */
  singleRace: boolean;
}

/**
 * Ligne du Classement cliquable : ouvre un pop-up avec la page « Ma saison » du joueur
 * (pronostics de saison repliés, puis ses pronostics d'étapes), en lecture seule.
 * Avec `stage` (classement par étapes), seuls ses pronostics, ses points et sa place sur
 * cette étape sont montrés.
 */
export function PlayerSeasonButton({
  userId,
  className,
  children,
  stage = null,
}: {
  userId: string;
  className: string;
  children: ReactNode;
  stage?: PlayerStageScope | null;
}) {
  const t = useTranslations("Classement");
  const tHome = useTranslations("Home");
  const tSex = useTranslations("Sex");
  const tCards = useTranslations("BonusCards");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<PlayerSeason | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  const show = async () => {
    setOpen(true);
    if (data) return;
    setState("loading");
    try {
      const result = await getPlayerSeason(userId);
      setData(result);
      setState(result ? "idle" : "error");
    } catch {
      setState("error");
    }
  };

  return (
    <>
      <button type="button" onClick={show} className={`w-full text-left ${className}`}>
        {children}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={data?.pseudo ?? t("playerTitle")}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[90dvh] w-full max-w-md flex-col gap-3 overflow-hidden rounded-t-2xl border border-border bg-bg p-4 sm:rounded-2xl"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <div className="truncate font-display text-base font-bold">{data?.pseudo ?? t("playerTitle")}</div>
                {data &&
                  (stage ? (
                    stage.leader && <PlayerBadgesRow badges={undefined} stageLeader />
                  ) : (
                    <PlayerBadgesRow badges={data.badges} leader={data.leader} />
                  ))}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("close")}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-text-dim"
              >
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex flex-col gap-3 overflow-y-auto">
              {state === "loading" && <div className="py-6 text-center text-[13px] text-text-dim">{t("playerLoading")}</div>}
              {state === "error" && <div className="py-6 text-center text-[13px] text-text-dim">{t("playerError")}</div>}
              {data && stage && (
                <>
                  <div className="flex items-end justify-between rounded-2xl border border-border bg-gradient-to-br from-card2 to-card p-4">
                    <div>
                      <div className="font-display text-xl font-extrabold text-frost">#{stage.rank}</div>
                      <div className="text-xs text-text-dim">{t(stage.singleRace ? "playerRaceRankLabel" : "playerStageRankLabel")}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-display text-xl font-extrabold text-ice">{Math.round(stage.points * 10) / 10} pts</div>
                      <div className="text-xs text-text-dim">{tHome("pointsLabel")}</div>
                    </div>
                  </div>
                  <div className="text-[11px] text-text-dim">{t("playerHiddenHint")}</div>
                  <CalendarAccordion
                    stages={data.stages.filter((s) => s.id === stage.stageId)}
                    defaultOpenStageId={stage.stageId}
                    locale={locale}
                    readOnly
                  />
                </>
              )}
              {data && !stage && (
                <>
                  <div className="flex flex-col gap-2 rounded-2xl border border-border bg-gradient-to-br from-card2 to-card p-4">
                    <div className="flex items-end justify-between">
                      <div>
                        <div className="font-display text-xl font-extrabold text-frost">{data.rank ? `#${data.rank}` : "–"}</div>
                        <div className="text-xs text-text-dim">{tHome("rankLabel")}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-display text-xl font-extrabold text-ice">{Math.round(data.points * 10) / 10} pts</div>
                        <div className="text-xs text-text-dim">{tHome("pointsLabel")}</div>
                      </div>
                    </div>
                    {/* Porteur d'eau révélé : son nom en haut du pop-up (invisible tant qu'il ne l'est pas). */}
                    {data.pepites
                      ?.filter((p) => p.revealed && p.name)
                      .map((p) => (
                        <div key={p.stageId} className="flex items-center gap-2 border-t border-border pt-2.5 text-[13px] text-text-dim">
                          <span className="text-base">💧</span>
                          {t("playerPepiteRevealed", { course: p.courseName })}
                          <span className="font-semibold text-ice">
                            {p.nationCode && `${nationFlagEmoji(p.nationCode)} `}
                            {p.name}
                          </span>
                        </div>
                      ))}
                    {data.cards && data.cards.cards.length > 0 && (
                      <div className="flex flex-col gap-1.5 border-t border-border pt-2.5">
                        <div className="font-display text-[11px] font-bold uppercase tracking-wider text-text-dim">
                          🃏 {tCards("title")}
                        </div>
                        <BonusCardsList cards={data.cards.cards} compact />
                      </div>
                    )}
                    {data.favoriteTeam && (
                      <div className="flex items-center gap-2 text-[13px] text-text-dim">
                        <span className="text-base">{nationFlagEmoji(data.favoriteTeam.nationCode)}</span>
                        {t("playerFavoriteTeam")}
                        <span className="font-semibold text-frost">
                          {data.favoriteTeam.name} {tSex(data.favoriteTeam.sex)}
                        </span>
                      </div>
                    )}
                  </div>
                  {data.streak != null && <StreakCard current={data.streak} />}
                  <div className="text-[11px] text-text-dim">{t("playerHiddenHint")}</div>
                  <CalendarAccordion stages={data.stages} defaultOpenStageId={data.defaultOpenStageId} locale={locale} readOnly />
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
