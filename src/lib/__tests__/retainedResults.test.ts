import { describe, expect, it } from "vitest";
import { retainedTotal } from "../velo/retainedResults";
import type { CourseKind } from "../velo/courses";

const kinds = new Map<string, CourseKind>([
  ["tdf", "grand_tour"],
  ["giro", "grand_tour"],
  ["pn", "stage_race"],
  ["tirreno", "stage_race"],
  ["dauphine", "stage_race"],
  ["bonus", "bonus_event"],
  ...Array.from({ length: 10 }, (_, i) => [`c${i}`, "one_day"] as [string, CourseKind]),
]);

describe("résultats retenus (VéloPronos)", () => {
  it("garde tous les Grands Tours et événements bonus", () => {
    const r = retainedTotal(
      [
        { courseId: "tdf", points: 50 },
        { courseId: "tdf", points: 20 },
        { courseId: "giro", points: 10 },
        { courseId: "bonus", points: 5 },
      ],
      kinds
    );
    expect(r).toEqual({ points: 85, droppedCourseIds: [] });
  });

  it("garde les 2 meilleures courses par étapes (somme des étapes et maillots)", () => {
    const r = retainedTotal(
      [
        { courseId: "pn", points: 10 },
        { courseId: "pn", points: 15 },
        { courseId: "tirreno", points: 20 },
        { courseId: "dauphine", points: 30 },
      ],
      kinds
    );
    expect(r).toEqual({ points: 55, droppedCourseIds: ["tirreno"] });
  });

  it("garde les 8 meilleures classiques et les lignes sans course", () => {
    const lines = Array.from({ length: 10 }, (_, i) => ({ courseId: `c${i}`, points: i + 1 }));
    const r = retainedTotal([...lines, { courseId: null, points: 3 }], kinds);
    expect(r.points).toBe(3 + (3 + 4 + 5 + 6 + 7 + 8 + 9 + 10));
    expect(r.droppedCourseIds.sort()).toEqual(["c0", "c1"]);
  });
});
