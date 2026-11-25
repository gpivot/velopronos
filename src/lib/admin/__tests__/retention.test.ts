import { describe, expect, it } from "vitest";
import { buildRetention, countRecentSignIns, type RetentionRace } from "../retention";

const race = (id: string, locksAt: string): RetentionRace => ({
  id,
  label: id,
  stageId: "s1",
  stageLocation: "Östersund",
  locksAt,
  offStandings: false,
});

describe("buildRetention", () => {
  it("compte les pronostiqueurs distincts par course, triés par date, sans les invités", () => {
    const races = [race("r2", "2026-11-30T12:00:00Z"), race("r1", "2026-11-29T12:00:00Z"), race("r3", "2026-12-01T12:00:00Z")];
    const predictions = [
      { user_id: "a", race_id: "r1" },
      { user_id: "b", race_id: "r1" },
      { user_id: "guest", race_id: "r1" },
      { user_id: "a", race_id: "r2" },
      { user_id: "c", race_id: "r2" },
      { user_id: "a", race_id: "autre-saison" },
    ];
    const result = buildRetention(races, predictions, new Set(["guest"]));
    expect(result.points.map((p) => [p.id, p.players])).toEqual([
      ["r1", 2],
      ["r2", 2],
      ["r3", 0],
    ]);
    expect(result.peak).toBe(2);
    expect(result.distinctPlayers).toBe(3);
  });
});

describe("countRecentSignIns", () => {
  it("ne compte que les comptes connectés dans la période, hors invités", () => {
    const now = new Date("2026-11-24T20:00:00Z");
    const users = [
      { last_sign_in_at: "2026-11-24T10:00:00Z" },
      { last_sign_in_at: "2026-11-20T10:00:00Z" },
      { last_sign_in_at: "2026-10-01T10:00:00Z" },
      { last_sign_in_at: null },
      { last_sign_in_at: "2026-11-24T19:00:00Z", is_anonymous: true },
    ];
    expect(countRecentSignIns(users, now, 1)).toBe(1);
    expect(countRecentSignIns(users, now, 7)).toBe(2);
    expect(countRecentSignIns(users, now, 30)).toBe(2);
  });
});
