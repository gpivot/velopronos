import { describe, expect, it } from "vitest";
import { raceTitle, stageRoute } from "../raceLabel";

const tFormat = (k: string) => ({ sprint: "Sprint", clm: "Contre-la-montre" })[k] ?? k;
const tRace = (k: string, v?: Record<string, string | number>) =>
  k === "stageNumber" ? `Étape ${v?.number}` : k === "prologue" ? "Prologue" : `${v?.stage} · ${v?.type}`;

describe("raceTitle / stageRoute", () => {
  it("numérote les étapes, pas les classiques", () => {
    expect(raceTitle({ format: "sprint", stage_number: 4 }, tFormat, tRace)).toBe("Étape 4 · Sprint");
    expect(raceTitle({ format: "clm", stageNumber: 0 }, tFormat, tRace)).toBe("Prologue · Contre-la-montre");
    expect(raceTitle({ format: "sprint", stage_number: null }, tFormat, tRace)).toBe("Sprint");
  });

  it("résume le parcours", () => {
    expect(stageRoute({ start_city: "Lille", end_city: "Roubaix", distance_km: 182.4 })).toBe("Lille → Roubaix · 182.4 km");
    expect(stageRoute({ start_city: "Nice", end_city: "Nice", distance_km: null })).toBe("Nice");
    expect(stageRoute({})).toBe("");
  });
});
