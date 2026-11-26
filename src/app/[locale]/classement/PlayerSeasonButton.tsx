"use client";

import { useRef, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CloseIcon } from "@/components/icons";
import { StreakCard } from "@/components/StreakCard";
import { BonusCardsList } from "@/components/BonusCardsList";
import { PlayerBadgesRow } from "@/components/PlayerBadgesRow";
import { CalendarAccordion } from "../courses/CalendarAccordion";
import { getPlayerRaceDetails, getPlayerSeason, type PlayerRaceDetail, type PlayerSeason } from "./actions";
import { PlayerRaceBars } from "./PlayerRaceBars";
import { PlayerChoicesAccordion } from "./PlayerChoicesAccordion";

/** Étapes détaillées par paquets (chacune demande plusieurs lectures ; l'action en accepte 25). */
const DETAIL_BATCH = 25;
/** Étape sans détail à montrer (rien de lisible) : on arrête d'afficher « Chargement… ». */
const EMPTY_DETAIL: PlayerRaceDetail = { picks: [], extras: [], pepite: null };

/** Classement « Par étapes » : le pop-up se limite à cette étape (demande de Guillaume, 04/11/2026). */
export interface PlayerStageScope {
  stageId: string;
  rank: number;
  points: number;
  /** En tête de l'étape : dossard rouge. */
  leader: boolean;
  /** Classement d'une seule étape de la course (rang et points de cette étape). */
  singleRace: boolean;
  /** Cette étape (classement d'une seule étape) : la fiche ne montre qu'elle. */
  raceId?: string | null;
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
  const tCards = useTranslations("BonusCards");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<PlayerSeason | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  // Détail des étapes terminées (points par coureur, porteur d'eau) : absent tant que pas chargé.
  const [details, setDetails] = useState<Record<string, PlayerRaceDetail | null>>({});
  const requestedRef = useRef<Set<string>>(new Set());

  // Courses hors classement (×0, ex. course de test) : sans intérêt dans la fiche d'un joueur.
  const rankedStages = data?.stages.filter((s) => s.counts_in_standings !== false) ?? [];

  const loadDetails = async (ids: string[]) => {
    const raceIds = ids.filter((id) => !requestedRef.current.has(id));
    if (raceIds.length === 0) return;
    raceIds.forEach((id) => requestedRef.current.add(id));
    setDetails((prev) => ({ ...prev, ...Object.fromEntries(raceIds.map((id) => [id, prev[id] ?? null])) }));
    try {
      const batches = Array.from({ length: Math.ceil(raceIds.length / DETAIL_BATCH) }, (_, i) =>
        raceIds.slice(i * DETAIL_BATCH, (i + 1) * DETAIL_BATCH)
      );
      const loaded = await Promise.all(batches.map((batch) => getPlayerRaceDetails(userId, batch)));
      setDetails((prev) => Object.assign({ ...prev }, Object.fromEntries(raceIds.map((id) => [id, EMPTY_DETAIL])), ...loaded));
    } catch {
      // Sans détail, l'étape garde son total.
      setDetails((prev) => ({ ...prev, ...Object.fromEntries(raceIds.map((id) => [id, EMPTY_DETAIL])) }));
    }
  };

  const show = async () => {
    setOpen(true);
    if (data) return;
    setState("loading");
    try {
      const result = await getPlayerSeason(userId);
      setData(result);
      setState(result ? "idle" : "error");
      // Classement d'une seule étape : son détail tout de suite (ailleurs, à l'ouverture de chaque étape).
      if (result && stage?.raceId) void loadDetails([stage.raceId]);
    } catch {
      setState("error");
    }
  };

  const raceDetail = (raceId: string) => <RaceDetail detail={details[raceId]} loaded={raceId in details} />;

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

            {/* [&>*]:shrink-0 : sans ça, les encadrés « overflow-hidden » (accordéons) s'écrasent à 0 px quand la liste déborde. */}
            <div className="flex flex-col gap-3 overflow-y-auto [&>*]:shrink-0">
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
                    // Filtre sur une course : ses étapes seulement ; sur une étape : elle seule, dépliée.
                    stages={data.stages
                      .filter((s) => s.id === stage.stageId)
                      .map((s) => (stage.raceId ? { ...s, races: s.races.filter((r) => r.id === stage.raceId) } : s))}
                    defaultOpenStageId={stage.stageId}
                    locale={locale}
                    readOnly
                    renderRaceDetail={raceDetail}
                    onRaceOpen={(raceId) => void loadDetails([raceId])}
                    openRaceIds={stage.raceId ? [stage.raceId] : []}
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
                    {data.cards && data.cards.cards.length > 0 && (
                      <div className="flex flex-col gap-1.5 border-t border-border pt-2.5">
                        <div className="font-display text-[11px] font-bold uppercase tracking-wider text-text-dim">
                          🃏 {tCards("title")}
                        </div>
                        <BonusCardsList cards={data.cards.cards} compact />
                      </div>
                    )}
                  </div>
                  <PlayerChoicesAccordion choices={data.choices} pepites={data.pepites ?? []} />
                  {data.streak != null && <StreakCard current={data.streak} />}
                  <div className="text-[11px] text-text-dim">{t("playerHiddenHint")}</div>
                  {/* Classement Saison : toutes les courses de la saison, dans l'ordre du calendrier (Guillaume, 26/11/2026). */}
                  <CalendarAccordion
                    stages={rankedStages}
                    defaultOpenStageId={data.defaultOpenStageId}
                    locale={locale}
                    readOnly
                    renderRaceDetail={raceDetail}
                    onRaceOpen={(raceId) => void loadDetails([raceId])}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function RaceDetail({ detail, loaded }: { detail: PlayerRaceDetail | null | undefined; loaded: boolean }) {
  const t = useTranslations("Classement");
  if (detail) return <PlayerRaceBars detail={detail} />;
  if (loaded && detail === null) return <div className="text-[11px] text-text-dim">{t("playerLoading")}</div>;
  return null;
}
