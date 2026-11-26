import { describe, expect, it } from "vitest";
import { computePickShares, shouldShowPickShares } from "../pickShares";

describe("computePickShares", () => {
  it("compte chaque joueur une fois par choix et ignore les pronostics vides", () => {
    const shares = computePickShares([
      { athlete_ids: ["a", "b", "c"] },
      { athlete_ids: ["a", "d", "e"] },
      { athlete_ids: ["a", "b", "f", "g"] },
      { athlete_ids: [] },
    ]);
    expect(shares.total).toBe(3);
    expect(shares.percents.a).toBe(100);
    expect(shares.percents.b).toBe(67);
    expect(shares.percents.d).toBe(33);
    expect(shares.percents.z).toBeUndefined();
  });

  it("gère les équipes et les nations", () => {
    const shares = computePickShares([{ team_ids: ["t1", "t2"] }, { team_ids: ["t1"] }, { nation_code: "FRA" }, { nation_code: null }]);
    expect(shares.total).toBe(3);
    expect(shares.percents.t1).toBe(67);
    expect(shares.percents.FRA).toBe(33);
  });
});

describe("shouldShowPickShares", () => {
  it("attend 20 pronostics avant le départ", () => {
    expect(shouldShowPickShares(19, "upcoming")).toBe(false);
    expect(shouldShowPickShares(20, "upcoming")).toBe(true);
  });
  it("s'affiche toujours après le départ, sauf sans aucun pronostic", () => {
    expect(shouldShowPickShares(1, "ongoing")).toBe(true);
    expect(shouldShowPickShares(3, "finished")).toBe(true);
    expect(shouldShowPickShares(0, "finished")).toBe(false);
  });
});
