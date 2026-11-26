import { describe, expect, it } from "vitest";
import { computePepiteBonus, computeSeasonPredictionScore, isPepiteEligible, isPepiteEligibleOdds } from "../seasonPredictions";

describe("computeSeasonPredictionScore", () => {
  it("applique le barème large du gros globe (1re à 5e)", () => {
    expect(computeSeasonPredictionScore("gros_globe_f", 1, 10)).toBe(100); // 10 × 10
    expect(computeSeasonPredictionScore("gros_globe_f", 5, 10)).toBe(10); // 10 × 1
  });

  it("applique le barème réduit (podium uniquement) pour jeune/nation", () => {
    expect(computeSeasonPredictionScore("meilleur_jeune_h", 1, 10)).toBe(50); // 10 × 5
    expect(computeSeasonPredictionScore("meilleure_nation_h", 3, 10)).toBe(10); // 10 × 1
  });

  it("ne rapporte rien hors barème ou sans classement", () => {
    expect(computeSeasonPredictionScore("meilleure_nation_f", 4, 10)).toBe(0);
    expect(computeSeasonPredictionScore("gros_globe_h", null, 10)).toBe(0);
  });
});

describe("isPepiteEligible", () => {
  it("exige une cote d'au moins 30 au moment du choix", () => {
    expect(isPepiteEligible(30)).toBe(true);
    expect(isPepiteEligible(29)).toBe(false);
  });
});

describe("isPepiteEligibleOdds", () => {
  it("exige que toutes les cotes du biathlète soient d'au moins 30", () => {
    expect(isPepiteEligibleOdds([30, 45, 60, 135])).toBe(true);
    // Ponsiluoma : sprint 30 mais poursuite 15 → pas une Pépite.
    expect(isPepiteEligibleOdds([30, 15, 25, 30, 135])).toBe(false);
    expect(isPepiteEligibleOdds([])).toBe(false);
  });
});

describe("computePepiteBonus", () => {
  it("applique le barème de base (cote × multiplicateur de rang) au 1er Top 10", () => {
    expect(computePepiteBonus(35, 1)).toBe(875); // 35 × 25
    expect(computePepiteBonus(35, 10)).toBe(35); // 35 × 1
    expect(computePepiteBonus(35, 1, 2)).toBe(1750); // bonus ×2 perso ou course ×2 : doublé
  });

  it("ne rapporte rien hors Top 10", () => {
    expect(computePepiteBonus(35, 11)).toBe(0);
  });
});
