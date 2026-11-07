import { describe, expect, it } from "vitest";
import { isStartlistDue, matchTeam, planStartlist, startlistSlot } from "../velo/startlistSync";
import { buildStartlistPrompt, parseStartlistAnswer } from "../velo/aiStartlist";

describe("créneaux des startlists", () => {
  it("17 h et 7 h, heure de Paris", () => {
    expect(startlistSlot(new Date("2027-03-15T16:05:00Z"))).toBe("evening"); // 17 h 05 CET
    expect(startlistSlot(new Date("2027-07-04T05:10:00Z"))).toBe("morning"); // 7 h 10 CEST
    expect(startlistSlot(new Date("2027-03-15T12:00:00Z"))).toBeNull();
  });

  const msr = { kind: "one_day", starts_on: "2027-03-20", firstLocksAt: "2027-03-20T09:30:00Z", startlist_auto: true };

  it("du lundi 17 h jusqu'au départ, et le matin du départ seulement à 7 h", () => {
    expect(isStartlistDue(msr, new Date("2027-03-15T16:00:00Z"), "evening")).toBe(true); // lundi 17 h
    expect(isStartlistDue(msr, new Date("2027-03-14T16:00:00Z"), "evening")).toBe(false); // dimanche d'avant
    expect(isStartlistDue(msr, new Date("2027-03-17T06:00:00Z"), "morning")).toBe(false); // mercredi 7 h
    expect(isStartlistDue(msr, new Date("2027-03-20T06:00:00Z"), "morning")).toBe(true); // samedi 7 h
    expect(isStartlistDue(msr, new Date("2027-03-20T16:00:00Z"), "evening")).toBe(false); // après le départ
  });

  it("jamais pour le WE des Champions, une course sans étape ou en mode manuel", () => {
    const now = new Date("2027-03-15T16:00:00Z");
    expect(isStartlistDue({ ...msr, kind: "bonus_event" }, now, "evening")).toBe(false);
    expect(isStartlistDue({ ...msr, firstLocksAt: null }, now, "evening")).toBe(false);
    expect(isStartlistDue({ ...msr, startlist_auto: false }, now, "evening")).toBe(false);
  });
});

describe("rapprochement de la startlist", () => {
  const athletes = [
    { id: "a", first_name: "Tadej", last_name: "Pogačar", nation_code: "SLO" },
    { id: "b", first_name: "Mathieu", last_name: "van der Poel", nation_code: "NED" },
    { id: "c", first_name: "Julian", last_name: "Alaphilippe", nation_code: "FRA" },
  ];
  it("retrouve les coureurs sans accents, signale les inconnus et calcule les retraits", () => {
    const plan = planStartlist(
      [
        { firstName: "Tadej", lastName: "Pogacar", nation: "SLO", team: "UAE", bib: 1 },
        { firstName: "Mathieu", lastName: "Van Der Poel", nation: "NED", team: "Alpecin", bib: 11 },
        { firstName: "Paul", lastName: "Seixas", nation: "FRA", team: "Decathlon", bib: null },
      ],
      athletes,
      ["a", "c"]
    );
    expect(plan.entries.map((e) => [e.athleteId, e.bib])).toEqual([
      ["a", 1],
      ["b", 11],
    ]);
    expect(plan.unknown.map((r) => r.lastName)).toEqual(["Seixas"]);
    expect(plan.removed).toEqual(["c"]);
  });

  it("retrouve l'équipe par son nom ou son code", () => {
    const teams = [
      { id: "t1", code: "UAD", name: "UAE Team Emirates XRG" },
      { id: "t2", code: "ADC", name: "Alpecin-Deceuninck" },
    ];
    expect(matchTeam("UAE Team Emirates XRG", teams)).toBe("t1");
    expect(matchTeam("ADC", teams)).toBe("t2");
    expect(matchTeam("Alpecin-Deceuninck Development", teams)).toBe("t2");
    expect(matchTeam("Inconnue", teams)).toBeNull();
  });
});

describe("réponse de l'IA", () => {
  it("met le site prioritaire en tête", () => {
    const prompt = buildStartlistPrompt({ courseName: "Paris-Roubaix", startsOn: "2027-04-11", prioritySite: "firstcycling.com" });
    expect(prompt.indexOf("firstcycling.com")).toBeLessThan(prompt.indexOf("procyclingstats.com"));
  });

  it("lit la liste et ignore les doublons ; pas publiée = liste vide", () => {
    const answer = parseStartlistAnswer(
      'Voici :\n```json\n{"status":"provisional","riders":[{"first_name":"Tadej","last_name":"Pogačar","nation":"slo","team":"UAE","bib":1},{"first_name":"Tadej","last_name":"Pogačar","nation":"SLO","team":"UAE","bib":1},{"first_name":"X","last_name":""}],"sources":[{"name":"PCS","url":"https://pcs"}],"notes":[]}\n```'
    );
    expect(answer.status).toBe("provisional");
    expect(answer.riders).toEqual([{ firstName: "Tadej", lastName: "Pogačar", nation: "SLO", team: "UAE", bib: 1 }]);
    expect(parseStartlistAnswer('{"status":"not_found","riders":[{"last_name":"A"}]}').riders).toEqual([]);
  });
});
