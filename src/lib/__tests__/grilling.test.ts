import { describe, expect, it } from "vitest";
import { previousRaceForGrilling, type StageRace } from "../grilling";

const sprintF: StageRace = { id: "sf", format: "sprint", sex: "F", locks_at: "2026-12-05T10:00:00Z" };
const sprintH: StageRace = { id: "sh", format: "sprint", sex: "M", locks_at: "2026-12-05T13:00:00Z" };
const relayF: StageRace = { id: "rf", format: "relais_f", sex: "F", locks_at: "2026-12-06T10:00:00Z" };
const pursuitF: StageRace = { id: "pf", format: "poursuite", sex: "F", locks_at: "2026-12-07T12:15:00Z" };
const massF: StageRace = { id: "mf", format: "mass_start", sex: "F", locks_at: "2026-12-08T12:15:00Z" };
const stage = [pursuitF, sprintH, relayF, sprintF, massF];

describe("grillage (§2)", () => {
  it("première course de l'étape : rien de grillé", () => {
    expect(previousRaceForGrilling(sprintF, stage)).toBeNull();
  });

  it("la poursuite est grillée par le sprint du même sexe, pas par le relais ni les hommes", () => {
    expect(previousRaceForGrilling(pursuitF, stage)?.id).toBe("sf");
  });

  it("seule la course juste avant compte", () => {
    expect(previousRaceForGrilling(massF, stage)?.id).toBe("pf");
  });

  it("une course ne se grille jamais elle-même", () => {
    expect(previousRaceForGrilling(sprintF, [sprintF])).toBeNull();
  });
});
