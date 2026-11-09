import { describe, expect, it } from "vitest";
import { isPredictionOpen, predictionOpensAt, predictionOpensOn } from "../predictionWindow";

describe("ouverture des pronostics d'une course : lundi 17 h de la semaine de course", () => {
  it("prend le lundi de la semaine de la course", () => {
    expect(predictionOpensOn("2027-03-20")).toBe("2027-03-15"); // samedi (Milan-San Remo)
    expect(predictionOpensOn("2027-03-21")).toBe("2027-03-15"); // dimanche
    expect(predictionOpensOn("2027-03-17")).toBe("2027-03-15"); // mercredi
  });

  it("une course qui part un lundi ouvre le lundi précédent", () => {
    expect(predictionOpensOn("2027-03-15")).toBe("2027-03-08");
  });

  it("à 17 h heure de Paris, hiver comme été", () => {
    expect(predictionOpensAt("2027-03-20").toISOString()).toBe("2027-03-15T16:00:00.000Z");
    expect(predictionOpensAt("2027-07-03").toISOString()).toBe("2027-06-28T15:00:00.000Z");
    expect(isPredictionOpen("2027-03-20", new Date("2027-03-15T15:59:00Z"))).toBe(false);
    expect(isPredictionOpen("2027-03-20", new Date("2027-03-15T16:00:00Z"))).toBe(true);
  });
});
