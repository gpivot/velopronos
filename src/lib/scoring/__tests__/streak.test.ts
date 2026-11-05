import { describe, expect, it } from "vitest";
import { computeCourseStreaks, computeSeasonStreaks, updateStreak } from "../streak";

describe("updateStreak", () => {
  it("incrémente la série quand la course rapporte des points", () => {
    expect(updateStreak(3, 42)).toEqual({ currentStreak: 4, cardEarned: false });
  });

  it("remet la série à zéro quand la course ne rapporte aucun point", () => {
    expect(updateStreak(7, 0)).toEqual({ currentStreak: 0, cardEarned: false });
    expect(updateStreak(7, -30)).toEqual({ currentStreak: 0, cardEarned: false });
  });

  it("attribue une carte bonus à la 5e étape consécutive (VéloPronos) et repart de zéro", () => {
    expect(updateStreak(4, 10)).toEqual({ currentStreak: 0, cardEarned: true });
  });
});

describe("computeSeasonStreaks", () => {
  it("rejoue les courses dans l'ordre et ignore les joueurs sans prono", () => {
    const races = Array.from({ length: 12 }, (_, i) => `r${i}`);
    const pointsByRace = new Map(
      races.map((raceId, i) => [
        raceId,
        new Map([
          ["alice", 5],
          ...(i === 3 ? [["bob", 0] as [string, number]] : i < 3 ? [["bob", 2] as [string, number]] : []),
        ]),
      ])
    );
    const streaks = computeSeasonStreaks(races, pointsByRace);
    expect(streaks.get("alice")).toEqual({ currentStreak: 2, cardsEarned: 2 });
    expect(streaks.get("bob")).toEqual({ currentStreak: 0, cardsEarned: 0 });
  });

  it("une correction qui retire des points casse la série à partir de cette course", () => {
    const races = ["r1", "r2", "r3"];
    const before = computeSeasonStreaks(races, new Map(races.map((r) => [r, new Map([["u", 3]])])));
    const corrected = computeSeasonStreaks(
      races,
      new Map(races.map((r) => [r, new Map([["u", r === "r2" ? 0 : 3]])]))
    );
    expect(before.get("u")?.currentStreak).toBe(3);
    expect(corrected.get("u")?.currentStreak).toBe(1);
  });
});

describe("computeCourseStreaks", () => {
  it("une étape oubliée casse la série dans la course", () => {
    const races = ["e1", "e2", "e3", "e4", "e5", "e6"];
    const pointsByRace = new Map(
      races.map((raceId, i) => [raceId, new Map([["alice", 5], ...(i === 2 ? [] : [["bob", 5] as [string, number]])])])
    );
    const streaks = computeCourseStreaks(races, pointsByRace);
    expect(streaks.get("alice")).toEqual({ currentStreak: 1, cardsEarned: 1 });
    expect(streaks.get("bob")).toEqual({ currentStreak: 3, cardsEarned: 0 });
  });
});
