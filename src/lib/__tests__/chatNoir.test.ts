import { describe, expect, it } from "vitest";
import { chatNoirDeadline } from "../velo/chatNoir";

// Étapes à 13 h (heure de Paris en juillet = UTC+2), avec les jours de repos donnés.
function tour(restAfter: number[], count = 21) {
  const races = [];
  let day = 1;
  for (let n = 1; n <= count; n++) {
    races.push({ stage_number: n, locks_at: new Date(Date.UTC(2027, 6, day, 11)).toISOString() });
    day += restAfter.includes(n) ? 2 : 1;
  }
  return races;
}

describe("limite du Chat noir", () => {
  it("Grand Tour classique : repos après l'étape 9, limite au départ de l'étape 10", () => {
    const races = tour([9, 15]);
    expect(chatNoirDeadline(races)).toBe(races[9].locks_at);
  });

  it("Tour 2027 : repos à J4 ignoré, on attend le suivant", () => {
    const races = tour([3, 10, 16]);
    expect(chatNoirDeadline(races)).toBe(races[10].locks_at);
  });

  it("repos juste après l'étape 8 : limite au départ de l'étape 9", () => {
    const races = tour([8]);
    expect(chatNoirDeadline(races)).toBe(races[8].locks_at);
  });

  it("sans jour de repos : départ de l'étape 10", () => {
    const races = tour([]);
    expect(chatNoirDeadline(races)).toBe(races[9].locks_at);
    expect(chatNoirDeadline(tour([], 7))).toBeNull();
  });
});
