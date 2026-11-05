import { describe, expect, it } from "vitest";
import { championsScore, championshipStatus, parseChampionsScale, rankChampions, summarizeChampions } from "../velo/champions";

const c = (id: string, winner: string | null, locks = "2027-06-27T11:00:00Z") => ({ id, locks_at: locks, winner_athlete_id: winner });

describe("WE des Champions", () => {
  it("applique le palier atteint, pas 50 par bonne réponse", () => {
    expect(championsScore(0)).toBe(0);
    expect(championsScore(1)).toBe(50);
    expect(championsScore(6)).toBe(700);
    expect(championsScore(10)).toBe(2000);
    expect(championsScore(12)).toBe(2000);
    expect(championsScore(2, [0, 10, 30])).toBe(30);
  });

  it("lit un barème saisi dans l'admin", () => {
    expect(parseChampionsScale("0, 50, 120")).toEqual([0, 50, 120]);
    expect(parseChampionsScale("0 50 x")).toBeNull();
    expect(parseChampionsScale("5")).toBeNull();
  });

  it("calcule un score provisoire au fil des résultats", () => {
    const champs = [c("fr", "seixas"), c("be", "remco"), c("it", null), c("es", "ayuso")];
    const picks = new Map([
      ["fr", "seixas"],
      ["be", "wout"],
      ["it", "ciccone"],
      ["es", "ayuso"],
    ]);
    expect(summarizeChampions(champs, picks, [0, 50, 120, 220, 350], false)).toEqual({
      total: 4,
      known: 3,
      correct: 2,
      score: 120,
      provisional: true,
    });
  });

  it("donne le statut d'un championnat", () => {
    const now = new Date("2027-06-27T12:00:00Z");
    expect(championshipStatus(c("fr", null, "2027-06-27T13:00:00Z"), now)).toBe("open");
    expect(championshipStatus(c("fr", null, "2027-06-27T11:00:00Z"), now)).toBe("locked");
    expect(championshipStatus(c("fr", "x"), now)).toBe("completed");
    expect(championshipStatus(c("fr", null, "2027-06-27T13:00:00Z"), now, true)).toBe("locked");
  });

  it("classe les joueurs, ex æquo sans départage", () => {
    const champs = [c("fr", "a"), c("be", "b")];
    const picks = new Map([
      ["u1", new Map([["fr", "a"], ["be", "b"]])],
      ["u2", new Map([["fr", "a"]])],
      ["u3", new Map([["be", "b"]])],
      ["u4", new Map([["fr", "z"]])],
    ]);
    const ranking = rankChampions(champs, picks, [0, 50, 120]);
    expect(ranking.map((r) => [r.userId, r.rank, r.score])).toEqual([
      ["u1", 1, 120],
      ["u2", 2, 50],
      ["u3", 2, 50],
      ["u4", 4, 0],
    ]);
  });
});
