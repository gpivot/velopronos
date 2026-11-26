import { describe, expect, it } from "vitest";
import { isAutoPseudo } from "../autoPseudo";

describe("isAutoPseudo", () => {
  it("repère le pseudo par défaut (début de l'e-mail)", () => {
    expect(isAutoPseudo("x7kq2m9abc", "x7kq2m9abc@privaterelay.appleid.com")).toBe(true);
    expect(isAutoPseudo("jean.dupont", "jean.dupont@gmail.com")).toBe(true);
    expect(isAutoPseudo("", "a@b.fr")).toBe(true);
    expect(isAutoPseudo("Invité", null)).toBe(true);
  });
  it("laisse un pseudo choisi", () => {
    expect(isAutoPseudo("Pogi", "jean.dupont@gmail.com")).toBe(false);
    expect(isAutoPseudo("Pogi", null)).toBe(false);
  });
});
