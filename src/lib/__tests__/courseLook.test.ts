import { describe, expect, it } from "vitest";
import { courseLook, matchesCourseFilter } from "../velo/courseLook";

describe("courseLook", () => {
  it("distingue les types de course", () => {
    expect(courseLook({ kind: "grand_tour", category: "grand_tour", coefficient: 1 })).toBe("grand_tour");
    expect(courseLook({ kind: "stage_race", category: "stage_race", coefficient: 1 })).toBe("stage_race");
    expect(courseLook({ kind: "one_day", category: "monument", coefficient: 2 })).toBe("monument");
    expect(courseLook({ kind: "one_day", category: "world_champs", coefficient: 2 })).toBe("worlds");
    expect(courseLook({ kind: "bonus_event", category: "national_championships", coefficient: 1 })).toBe("bonus");
    expect(courseLook({ kind: "one_day", category: "world_tour", coefficient: 1 })).toBe("one_day");
    expect(courseLook({ kind: "one_day", category: null, coefficient: 2 })).toBe("monument");
  });

  it("filtre les courses", () => {
    expect(matchesCourseFilter("monument", "one_day")).toBe(true);
    expect(matchesCourseFilter("worlds", "championships")).toBe(true);
    expect(matchesCourseFilter("bonus", "championships")).toBe(true);
    expect(matchesCourseFilter("stage_race", "grand_tour")).toBe(false);
    expect(matchesCourseFilter("grand_tour", "all")).toBe(true);
  });
});
