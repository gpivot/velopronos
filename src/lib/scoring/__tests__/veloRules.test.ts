import { describe, expect, it } from "vitest";
import { computeIndividualRaceScore } from "../individualRace";

const results = ["A", "B", "C", "D"].map((id, i) => ({ athleteId: id, rank: i + 1, penaltyLaps: 0, skiRank: null, isFusee: false, isGachette: false }));
const base = {
  predictedAthleteIds: ["A", "B", "D"],
  results,
  oddsByAthleteId: { A: 2, B: 3, C: 5, D: 8 },
  athleteTeamByAthleteId: {},
  specialRule: null,
  stageCoefficient: 1 as const,
  bonusX2Active: false,
  card: { type: "none" as const },
  favoriteTeam: null,
  raceCountryCode: "FRA",
  nationalDayTeam: null,
  raceFormat: "sprint",
};

describe("règles vélo (base44)", () => {
  it("le ×2 perso double aussi la Musette et le combatif du jour", () => {
    // Coureurs : 25×2 + 18×3 + 10×8 = 184 ; Musette Top 5 = 50 ; combatif = 50.
    const simple = computeIndividualRaceScore({ ...base, veloRules: true, combatifBonus: 50 });
    const doubled = computeIndividualRaceScore({ ...base, veloRules: true, combatifBonus: 50, bonusX2Active: true });
    expect(simple.total).toBe(284);
    expect(doubled.total).toBe(568);
    expect(doubled.breakdown.combatifBonus).toBe(100);
  });

  it("sans les règles vélo, la Musette n'est pas doublée (biathlon)", () => {
    const doubled = computeIndividualRaceScore({ ...base, bonusX2Active: true });
    expect(doubled.total).toBe(184 * 2 + 50);
  });

  it("course ×2 (monument) : Musette doublée aussi", () => {
    const monument = computeIndividualRaceScore({ ...base, veloRules: true, stageCoefficient: 2 });
    expect(monument.total).toBe((184 + 50) * 2);
  });
});
