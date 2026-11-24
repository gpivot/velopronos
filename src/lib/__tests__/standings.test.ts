import { describe, expect, it } from "vitest";
import { buildStandings, isStageOngoing, pickDefaultStandingsStageId } from "../standings";

const race = (displayStatus: "upcoming" | "ongoing" | "finished") => ({ displayStatus });

describe("buildStandings", () => {
  const entries = [
    { userId: "a", pseudo: "Anna", points: 50 },
    { userId: "b", pseudo: "Bruno", points: 30 },
    { userId: "a", pseudo: "Anna", points: 20.25 },
    { userId: "c", pseudo: "Chloé", points: 70 },
  ];

  it("additionne les points et classe avec ex æquo", () => {
    const rows = buildStandings(entries, null, null);
    expect(rows.map((r) => [r.userId, r.points, r.rank])).toEqual([
      ["a", 70.3, 1],
      ["c", 70, 2],
      ["b", 30, 3],
    ]);
    expect(rows[0].picks).toBeNull();
  });

  it("garde les inscrits sans point à 0, ex æquo en dernier", () => {
    const rows = buildStandings([...entries, { userId: "d", pseudo: "David", points: 0 }, { userId: "a", pseudo: "Anna", points: 0 }, { userId: "e", pseudo: "Emma", points: 0 }], null, null);
    expect(rows.map((r) => [r.userId, r.points, r.rank])).toEqual([
      ["a", 70.3, 1],
      ["c", 70, 2],
      ["b", 30, 3],
      ["d", 0, 4],
      ["e", 0, 4],
    ]);
  });

  it("restreint aux membres d'une ligue, membres sans point à 0", () => {
    const rows = buildStandings(entries, [
      { userId: "b", pseudo: "Bruno" },
      { userId: "d", pseudo: "David" },
    ], null);
    expect(rows.map((r) => [r.userId, r.points, r.rank])).toEqual([
      ["b", 30, 1],
      ["d", 0, 2],
    ]);
  });

  it("ajoute les joueurs qui ont un pronostic sans point, hors ligue exclus", () => {
    const pick = { raceId: "r1", format: "sprint", sex: "F", names: "X, Y, Z" };
    const picks = new Map([
      ["e", { pseudo: "Emma", picks: [pick] }],
      ["b", { pseudo: "Bruno", picks: [pick] }],
    ]);
    const all = buildStandings(entries, null, picks);
    expect(all.map((r) => r.userId)).toEqual(["a", "c", "b", "e"]);
    expect(all.find((r) => r.userId === "e")?.picks).toEqual([pick]);
    expect(all.find((r) => r.userId === "a")?.picks).toEqual([]);

    const league = buildStandings(entries, [{ userId: "b", pseudo: "Bruno" }], picks);
    expect(league.map((r) => r.userId)).toEqual(["b"]);
  });
});

describe("isStageOngoing", () => {
  it("vrai seulement entre le départ de la première course et la notation de la dernière", () => {
    expect(isStageOngoing({ races: [race("upcoming"), race("upcoming")] as any })).toBe(false);
    expect(isStageOngoing({ races: [race("ongoing"), race("upcoming")] as any })).toBe(true);
    expect(isStageOngoing({ races: [race("finished"), race("upcoming")] as any })).toBe(true);
    expect(isStageOngoing({ races: [race("finished"), race("finished")] as any })).toBe(false);
  });
});

describe("pickDefaultStandingsStageId", () => {
  it("prend la dernière étape commencée, sinon la première", () => {
    const stages = [
      { id: "s1", races: [race("finished")] },
      { id: "s2", races: [race("ongoing"), race("upcoming")] },
      { id: "s3", races: [race("upcoming")] },
    ] as any;
    expect(pickDefaultStandingsStageId(stages)).toBe("s2");
    expect(pickDefaultStandingsStageId([stages[2]])).toBe("s3");
    expect(pickDefaultStandingsStageId([])).toBeNull();
  });
});
