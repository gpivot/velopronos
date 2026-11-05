import { describe, expect, it } from "vitest";
import { rankedIds, searchCandidates, slotsFromRanks, trimSlots } from "../resultSlots";

describe("lignes du résultat", () => {
  it("place chaque rang sur sa ligne, décale les ex aequo et ajoute des lignes après le Top 10", () => {
    const slots = slotsFromRanks([
      { id: "b", rank: 2 },
      { id: "a", rank: 1 },
      { id: "c", rank: 2 },
      { id: "d", rank: 34 },
      { id: "a", rank: 5 },
    ]);
    expect(slots.slice(0, 4)).toEqual(["a", "b", "c", null]);
    expect(slots).toHaveLength(34);
    expect(slots[33]).toBe("d");
    expect(rankedIds(slots)).toEqual([
      { id: "a", rank: 1 },
      { id: "b", rank: 2 },
      { id: "c", rank: 3 },
      { id: "d", rank: 34 },
    ]);
  });

  it("garde au moins 10 lignes et retire les lignes vides en trop", () => {
    expect(slotsFromRanks([])).toHaveLength(10);
    expect(trimSlots([...Array(10).fill(null), "x", null, null])).toHaveLength(11);
    expect(trimSlots(Array(12).fill(null))).toHaveLength(10);
  });
});

describe("recherche de coureur", () => {
  const riders = [
    { id: "1", name: "Tadej Pogačar" },
    { id: "2", name: "Mathieu van der Poel", extra: ["NED"] },
    { id: "3", name: "Primož Roglič" },
    { id: "4", name: "Jonas Vingegaard" },
  ];

  it("trouve par le début du prénom ou du nom, sans accents", () => {
    expect(searchCandidates("pog", riders, new Set()).map((r) => r.id)).toEqual(["1"]);
    expect(searchCandidates("rogl", riders, new Set()).map((r) => r.id)).toEqual(["3"]);
    expect(searchCandidates("van der p", riders, new Set()).map((r) => r.id)).toEqual(["2"]);
    expect(searchCandidates("J", riders, new Set()).map((r) => r.id)).toEqual(["4"]);
  });

  it("n'offre plus un coureur déjà placé sur une autre ligne", () => {
    expect(searchCandidates("", riders, new Set(["1", "2"])).map((r) => r.id)).toEqual(["3", "4"]);
    expect(searchCandidates("pog", riders, new Set(["1"]))).toEqual([]);
  });
});
