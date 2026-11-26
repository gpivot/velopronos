"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { CloseIcon } from "@/components/icons";
import { PredictionBreakdown, formatPoints } from "@/components/PredictionBreakdown";
import { PepiteReveal } from "@/components/PepiteReveal";
import { getPlayerRaceResult, type PlayerRaceResult } from "./actions";

/** Ligne du classement des joueurs d'une course : ouvre un pop-up avec le pronostic détaillé du joueur. */
export function PlayerRaceButton({
  raceId,
  userId,
  className,
  children,
}: {
  raceId: string;
  userId: string;
  className: string;
  children: ReactNode;
}) {
  const t = useTranslations("Race");
  const tClassement = useTranslations("Classement");
  const tHome = useTranslations("Home");
  const tCards = useTranslations("BonusCards");
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<PlayerRaceResult | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  const show = async () => {
    setOpen(true);
    if (data) return;
    setState("loading");
    try {
      const result = await getPlayerRaceResult(raceId, userId);
      setData(result);
      setState(result ? "idle" : "error");
    } catch {
      setState("error");
    }
  };

  const prediction = data?.prediction ?? null;

  return (
    <>
      <button type="button" onClick={show} className={`w-full text-left ${className}`}>
        {children}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={data?.pseudo ?? tClassement("playerTitle")}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[90dvh] w-full max-w-md flex-col gap-3 overflow-hidden rounded-t-2xl border border-border bg-bg p-4 sm:rounded-2xl"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="font-display text-base font-bold">{data?.pseudo ?? tClassement("playerTitle")}</div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={tClassement("close")}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-text-dim"
              >
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex flex-col gap-2 overflow-y-auto">
              {state === "loading" && <div className="py-6 text-center text-[13px] text-text-dim">{tClassement("playerLoading")}</div>}
              {state === "error" && <div className="py-6 text-center text-[13px] text-text-dim">{tClassement("playerError")}</div>}
              {data && !prediction && !data.pepite && <div className="py-6 text-center text-[13px] text-text-dim">{t("playerNoPrediction")}</div>}
              {prediction && (
                <>
                  <div className="flex items-end justify-between gap-3 rounded-2xl border border-border bg-gradient-to-br from-card2 to-card p-4">
                    <div className="flex flex-col gap-1.5">
                      <div className="font-display text-xs font-bold uppercase tracking-wider text-text-dim">
                        {prediction.playerRank && prediction.playerCount > 0
                          ? tHome("lastResultPlayerRank", { rank: prediction.playerRank, count: prediction.playerCount })
                          : t("pointsEarnedLabel")}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {prediction.multiplier && (
                          <div className="w-fit rounded-full bg-gold-soft px-2.5 py-1 font-display text-[11px] font-bold text-gold">
                            {prediction.multiplier.kind === "bonusX2" && "⚡ "}
                            {t(prediction.multiplier.kind === "bonusX2" ? "bonusX2Gain" : "coefficientGain", {
                              points: formatPoints(prediction.multiplier.gain),
                            })}
                          </div>
                        )}
                        {prediction.card && (
                          <div className="w-fit rounded-full bg-ice-soft px-2.5 py-1 font-display text-[11px] font-bold text-ice">
                            🃏 {tCards(`name_${prediction.card}`)}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="font-display text-2xl font-extrabold text-ice">{Math.round(prediction.points * 10) / 10} pts</div>
                  </div>
                  <PredictionBreakdown picks={prediction.picks} extras={prediction.extras} showLegend={false} showCalc />
                </>
              )}
              {/* Porteur d'eau révélé sur cette étape : explique l'écart entre la somme des choix et le total. */}
              {data?.pepite && <PepiteReveal pepite={data.pepite} other={!data.isSelf} />}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
