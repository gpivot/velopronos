import { describe, expect, it } from "vitest";
import { computeIndividualRaceScore } from "../individualRace";

// CLM par équipes (VéloPronos) : 3 équipes notées comme 3 coureurs (scoreTeamPredictions).
const teamResults = ["T1", "T2", "T3", "T4"].map((id, i) => ({ athleteId: id, rank: i + 1, penaltyLaps: 0, skiRank: null, isFusee: false, isGachette: false }));
const base = {
  results: teamResults,
  oddsByAthleteId: { T1: 2, T2: 3, T3: 5, T4: 8 },
  athleteTeamByAthleteId: {},
  specialRule: null,
  stageCoefficient: 1 as const,
  bonusX2Active: false,
  card: { type: "none" as const },
  favoriteTeam: null,
  raceCountryCode: "FRA",
  nationalDayTeam: null,
  raceFormat: "clm_equipes",
  stageCards: { fusee: false, gachette: false },
};

describe("CLM par équipes", () => {
  it("rang × cote et prono parfait pour le bon podium", () => {
    const perfect = computeIndividualRaceScore({ ...base, predictedAthleteIds: ["T1", "T2", "T3"] });
    const other = computeIndividualRaceScore({ ...base, predictedAthleteIds: ["T1", "T2", "T4"] });
    expect(perfect.total).toBeGreaterThan(other.total);
    expect(other.total).toBeGreaterThan(0);
  });

  it("compte le bonus Musette (Top 5 ici)", () => {
    const score = computeIndividualRaceScore({ ...base, predictedAthleteIds: ["T1", "T2", "T4"] });
    // 25×2 + 18×3 + 10×8 = 184, + 50 (Top 5)
    expect(score.total).toBe(234);
  });
});
