import { describe, expect, it } from "vitest";
import { computeJerseyPoints } from "../velo/jerseyScoring";

describe("points des maillots", () => {
  const podium = ["A", "B", "C"];
  it("cote × 5 / 2 / 1 sur le podium final", () => {
    expect(computeJerseyPoints("general", "A", podium, 12)).toBe(60);
    expect(computeJerseyPoints("points", "B", podium, 12)).toBe(24);
    expect(computeJerseyPoints("montagne", "C", podium, 12)).toBe(12);
    expect(computeJerseyPoints("jeune", "Z", podium, 12)).toBe(0);
    expect(computeJerseyPoints("equipe", "A", podium, null)).toBe(5);
  });
  it("super combatif : +200 au vainqueur seulement", () => {
    expect(computeJerseyPoints("combatif", "A", podium, 40)).toBe(200);
    expect(computeJerseyPoints("combatif", "B", podium, 40)).toBe(0);
  });
});
