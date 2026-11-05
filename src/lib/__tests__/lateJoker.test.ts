import { describe, expect, it } from "vitest";
import { applyLateJoker, isLateJokerWindowOpen } from "../velo/lateJoker";

describe("joker retardataire", () => {
  it("divise les points par 2, arrondis à l'entier inférieur", () => {
    expect(applyLateJoker(301, true)).toBe(150);
    expect(applyLateJoker(-15, true)).toBe(-8);
    expect(applyLateJoker(301, false)).toBe(301);
  });

  it("ouvert du départ à 1 h après, tant que les résultats ne sont pas saisis", () => {
    const locksAt = "2027-07-03T12:00:00Z";
    expect(isLateJokerWindowOpen(locksAt, "upcoming", new Date("2027-07-03T11:59:00Z"))).toBe(false);
    expect(isLateJokerWindowOpen(locksAt, "upcoming", new Date("2027-07-03T12:00:00Z"))).toBe(true);
    expect(isLateJokerWindowOpen(locksAt, "live", new Date("2027-07-03T12:59:00Z"))).toBe(true);
    expect(isLateJokerWindowOpen(locksAt, "live", new Date("2027-07-03T13:00:00Z"))).toBe(false);
    expect(isLateJokerWindowOpen(locksAt, "finished", new Date("2027-07-03T12:30:00Z"))).toBe(false);
  });
});
