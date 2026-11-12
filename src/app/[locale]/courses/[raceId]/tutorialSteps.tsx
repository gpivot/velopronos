import { getTranslations } from "next-intl/server";
import type { TutorialStep } from "@/components/FirstPredictionTutorial";
import { PickMockup, ScoreMockup } from "@/components/landing/Mockups";
import { RANK_MULTIPLIERS } from "@/lib/scoring/constants";

/** Les 3 pop-ups du premier pronostic : mêmes mini-écrans et légendes que l'accueil visiteur. */
export async function tutorialSteps(): Promise<TutorialStep[]> {
  const [t, tLanding] = await Promise.all([getTranslations("Tutorial"), getTranslations("Landing")]);
  return [
    {
      title: t("step1Title"),
      body: t("step1Body"),
      visual: <PickMockup />,
      pins: [tLanding("f1Pin1"), tLanding("f1Pin2"), tLanding("f1Pin3")],
    },
    {
      title: t("step2Title"),
      body: t("step2Body"),
      visual: (
        <div className="grid grid-cols-5 gap-1.5">
          {Object.entries(RANK_MULTIPLIERS).map(([rank, mult]) => (
            <div key={rank} className={`flex flex-col items-center rounded-xl border px-1 py-2 ${rank === "1" ? "border-gold/50 bg-gold-soft" : "border-border bg-card"}`}>
              <span className="font-display text-[11px] font-bold text-text-dim">{t("place", { rank: Number(rank) })}</span>
              <span className={`font-display text-base font-extrabold ${rank === "1" ? "text-gold" : "text-ice"}`}>×{mult}</span>
            </div>
          ))}
        </div>
      ),
      pins: undefined,
    },
    {
      title: t("step3Title"),
      body: t("step3Body"),
      visual: <ScoreMockup />,
      pins: [tLanding("f2Pin1"), tLanding("f2Pin2"), tLanding("f2Pin3")],
    },
  ];
}
