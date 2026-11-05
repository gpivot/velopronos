import { describe, expect, it } from "vitest";
import {
  canPlayCard,
  cardsOnRace,
  computeEquipeBonus,
  isCardUnlocked,
  offeredCards,
  describeCard,
  canPlayStageCard,
  coveredRaceIds,
  playableStageIds,
  quatriemeChoixWindow,
  resolvePredictionCard,
  unclaimedCredits,
  type CardRace,
  type CardRow,
} from "../bonusCards";

// Une saison : sprints H/F, relais, poursuites H/F, puis une étape suivante.
const race = (id: string, format: string, sex: string | null, day: number, status = "upcoming"): CardRace => ({
  id,
  format,
  sex,
  locks_at: new Date(Date.UTC(2026, 11, day, 12)).toISOString(),
  status,
  stage_id: day <= 5 ? "etape1" : "etape2",
});
const races: CardRace[] = [
  race("sprintF", "sprint", "F", 1),
  race("sprintH", "sprint", "H", 2),
  race("relaisF", "relais_f", "F", 3),
  race("poursuiteF", "poursuite", "F", 4),
  race("poursuiteH", "poursuite", "H", 4),
  race("relaisMixte", "relais_mixte", null, 5),
  race("sprintF2", "sprint", "F", 8),
  race("sprintH2", "sprint", "H", 9),
];

// VéloPronos : un Grand Tour (étapes e1 à e5, CLM par équipes en e3) et une autre course.
const etape = (id: string, day: number, format = "sprint", stage_id = "tour"): CardRace => ({
  id,
  format,
  sex: "H",
  locks_at: new Date(Date.UTC(2027, 6, day, 12)).toISOString(),
  status: "upcoming",
  stage_id,
});
const tour: CardRace[] = [
  etape("e1", 1),
  etape("e2", 2, "montagne"),
  etape("e3", 3, "clm_equipes"),
  etape("e4", 4),
  etape("e5", 5, "clm"),
  etape("autre1", 6, "sprint", "autre"),
];

const card = (over: Partial<CardRow>): CardRow => ({ id: "c", card_type: "balle_de_pioche", status: "available", used_on_race_id: null, ...over });

describe("quatriemeChoixWindow (VéloPronos)", () => {
  it("couvre l'étape d'activation puis les 2 suivantes de la course, CLM par équipes exclu", () => {
    expect(quatriemeChoixWindow("e1", tour)).toEqual(["e1", "e2", "e4"]);
    expect(quatriemeChoixWindow("e2", tour)).toEqual(["e2", "e4", "e5"]);
  });

  it("ne déborde pas sur la course suivante et se raccourcit en fin de course", () => {
    expect(quatriemeChoixWindow("e4", tour)).toEqual(["e4", "e5"]);
    expect(quatriemeChoixWindow("e3", tour)).toEqual([]);
  });

  it("jamais sur un relais", () => {
    expect(quatriemeChoixWindow("relaisF", races)).toEqual([]);
  });
});

describe("cartes jouées", () => {
  const played = [card({ id: "q", status: "used", used_on_race_id: "sprintF" })];

  it("le 4e choix s'applique à toute sa fenêtre", () => {
    const quatre = [card({ id: "q", status: "used", used_on_race_id: "e1" })];
    expect(cardsOnRace("e4", quatre, tour).quatriemeChoix?.id).toBe("q");
    expect(cardsOnRace("e5", quatre, tour).quatriemeChoix).toBeNull();
  });

  it("le Boost se pose pendant un 4e choix, seulement dans la course de la carte, jamais sur un CLM par équipes", () => {
    const cards = [card({ id: "q", status: "used", used_on_race_id: "e1", course_id: "tour" }), card({ id: "f", card_type: "ca_farte", course_id: "tour" })];
    expect(canPlayCard("ca_farte", "e2", cards, tour)).toBe(true);
    expect(canPlayCard("ca_farte", "e3", cards, tour)).toBe(false);
    expect(canPlayCard("ca_farte", "autre1", cards, tour)).toBe(false);
  });

  it("refuse une carte qu'on n'a pas", () => {
    expect(canPlayCard("ca_farte", "sprintF", [], races)).toBe(false);
  });
});

describe("resolvePredictionCard", () => {
  const prediction = { athlete_ids: ["a", "b", "c", "d"], bonus_card_target_athlete_id: "b" };

  it("4 choix comptent seulement sous un 4e choix", () => {
    const played = [card({ status: "used", used_on_race_id: "sprintF" })];
    expect(resolvePredictionCard("sprintH", prediction, played, races)).toEqual({
      athleteIds: ["a", "b", "c", "d"],
      card: { type: "balle_de_pioche" },
    });
    expect(resolvePredictionCard("sprintF2", prediction, played, races)).toEqual({ athleteIds: ["a", "b", "c"], card: { type: "none" } });
  });

  it("Ça farte seulement sur la course où la carte a été jouée", () => {
    const played = [card({ card_type: "ca_farte", status: "used", used_on_race_id: "sprintF" })];
    expect(resolvePredictionCard("sprintF", prediction, played, races).card).toEqual({ type: "ca_farte", targetAthleteId: "b" });
    expect(resolvePredictionCard("sprintH", prediction, played, races).card).toEqual({ type: "none" });
  });
});

describe("describeCard", () => {
  const now = new Date(Date.UTC(2026, 11, 3));

  it("disponible, active puis utilisée", () => {
    expect(describeCard(card({}), races, now).state).toBe("available");
    expect(describeCard(card({ status: "used", used_on_race_id: "e1" }), tour, new Date(Date.UTC(2027, 6, 2, 13)))).toMatchObject({
      state: "active",
      windowSize: 3,
      windowStarted: 2,
    });
    const finished = races.map((r) => ({ ...r, status: "finished" }));
    expect(describeCard(card({ status: "used", used_on_race_id: "sprintF" }), finished, now).state).toBe("used");
    expect(describeCard(card({ card_type: "ca_farte", status: "used", used_on_race_id: "sprintF" }), finished, now).state).toBe("used");
  });

  it("crédits restants", () => {
    expect(unclaimedCredits(2, 1)).toBe(1);
    expect(unclaimedCredits(0, 1)).toBe(0);
  });
});

describe("4e choix activé automatiquement", () => {
  it("Ça farte se cumule avec le 4e choix, sur un des 4 choix", () => {
    const cards = [
      card({ id: "q", status: "used", used_on_race_id: "sprintF" }),
      card({ id: "f", card_type: "ca_farte", status: "used", used_on_race_id: "sprintH" }),
    ];
    const prediction = { athlete_ids: ["a", "b", "c", "d"], bonus_card_target_athlete_id: "d" };
    expect(resolvePredictionCard("sprintH", prediction, cards, races)).toEqual({
      athleteIds: ["a", "b", "c", "d"],
      card: { type: "balle_de_pioche", caFarteTargetAthleteId: "d" },
    });
    expect(resolvePredictionCard("poursuiteF", prediction, cards, races).card).toEqual({ type: "balle_de_pioche" });
  });

  it("Aspiration déjà posée l'emporte sur la course que le 4e choix couvre", () => {
    const cards = [
      card({ id: "a", card_type: "aspiration", status: "used", used_on_race_id: "sprintH" }),
      card({ id: "q", status: "used", used_on_race_id: "sprintF" }),
    ];
    const prediction = { athlete_ids: ["a", "b", "c", "d"], bonus_card_target_athlete_id: null };
    expect(resolvePredictionCard("sprintH", prediction, cards, races)).toEqual({ athleteIds: ["a", "b", "c"], card: { type: "aspiration" } });
  });
});

describe("cartes de la saison", () => {
  const stage = (starts_on: string, coefficient = 1, firstLocksAt: string | null = `${starts_on}T12:00:00Z`) => ({
    starts_on,
    coefficient,
    firstLocksAt,
  });
  const stages = [
    stage("2026-11-28"),
    stage("2026-12-05"),
    stage("2026-12-12"),
    stage("2027-01-02"), // 4e étape : Aspiration
    stage("2027-01-09"),
    stage("2027-02-10", 2), // Mondiaux
    stage("2027-03-05"), // étape d'après : Équipe
  ];

  it("Aspiration dès le départ de la 4e étape, Équipe après les Mondiaux", () => {
    expect(isCardUnlocked("ca_farte", stages, new Date("2026-11-01"))).toBe(true);
    expect(isCardUnlocked("aspiration", stages, new Date("2027-01-02T11:00:00Z"))).toBe(false);
    expect(isCardUnlocked("aspiration", stages, new Date("2027-01-02T12:00:00Z"))).toBe(true);
    expect(isCardUnlocked("equipe", stages, new Date("2027-02-20"))).toBe(false);
    expect(isCardUnlocked("equipe", stages, new Date("2027-03-05T12:00:00Z"))).toBe(true);
  });

  it("sans Mondiaux ni JO, Équipe à la 7e étape", () => {
    const noChamps = stages.map((s) => ({ ...s, coefficient: 1 }));
    expect(isCardUnlocked("equipe", noChamps, new Date("2027-03-05T12:00:00Z"))).toBe(true);
    expect(isCardUnlocked("equipe", noChamps, new Date("2027-02-20"))).toBe(false);
  });

  it("pas la même carte deux séries de suite (VéloPronos : Grillade, Boost, 4e choix)", () => {
    const offers = offeredCards("ca_farte", stages, new Date("2026-12-01"));
    expect(Object.fromEntries(offers.map((o) => [o.type, o.state]))).toEqual({
      fondue: "offered",
      ca_farte: "justTaken",
      balle_de_pioche: "offered",
    });
  });

  it("réglages admin (désactivée, hors période)", () => {
    const now = new Date("2026-12-01");
    const offers = offeredCards(null, stages, now, {
      settings: [
        { card_type: "fondue", enabled: false, available_from: null, available_until: null },
        { card_type: "balle_de_pioche", enabled: true, available_from: "2027-01-01T00:00:00Z", available_until: null },
        { card_type: "ca_farte", enabled: true, available_from: "2026-11-01T00:00:00Z", available_until: "2026-12-31T00:00:00Z" },
      ],
    });
    const byType = Object.fromEntries(offers.map((o) => [o.type, o.state]));
    expect(byType.fondue).toBeUndefined();
    expect(byType.balle_de_pioche).toBe("unavailable");
    expect(byType.ca_farte).toBe("offered");
  });

  it("Équipe couvre toutes les courses restantes, relais compris", () => {
    const equipe = [card({ id: "e", card_type: "equipe", status: "used", used_on_race_id: "relaisF" })];
    expect(cardsOnRace("sprintH2", equipe, races).equipe?.id).toBe("e");
    expect(cardsOnRace("relaisMixte", equipe, races).equipe?.id).toBe("e");
    expect(cardsOnRace("sprintH", equipe, races).equipe).toBeNull();
  });

  it("Aspiration se joue comme Ça farte, une carte de course à la fois", () => {
    const cards = [card({ id: "a", card_type: "aspiration" }), card({ id: "q", status: "used", used_on_race_id: "sprintF" })];
    expect(canPlayCard("aspiration", "sprintH", cards, races)).toBe(false);
    expect(canPlayCard("aspiration", "sprintF2", cards, races)).toBe(true);
    expect(canPlayCard("aspiration", "relaisF", cards, races)).toBe(false);
    const played = [card({ id: "a", card_type: "aspiration", status: "used", used_on_race_id: "sprintF2" })];
    expect(resolvePredictionCard("sprintF2", { athlete_ids: ["a", "b", "c"], bonus_card_target_athlete_id: null }, played, races).card).toEqual({
      type: "aspiration",
    });
  });
});

describe("computeEquipeBonus", () => {
  it("exemple de Guillaume : France Hommes, sprint d'Oslo", () => {
    // Perrot (pronostiqué) 2e à 8, Jacquelin 4e à 12, Claude 8e à 24 : 8 + 12 + 24 en plus des
    // points du pronostic, que les biathlètes aient été choisis ou non.
    const results = [
      { rank: 1, nationCode: "NOR", sex: "H", odds: 3 },
      { rank: 2, nationCode: "FRA", sex: "H", odds: 8 },
      { rank: 4, nationCode: "FRA", sex: "H", odds: 12 },
      { rank: 8, nationCode: "FRA", sex: "H", odds: 24 },
      { rank: 14, nationCode: "FRA", sex: "H", odds: 30 },
    ];
    expect(computeEquipeBonus({ nationCode: "FRA", sex: "H" }, { format: "sprint", sex: "H" }, results, [])).toBe(44);
  });

  const team = { nationCode: "FRA", sex: "F" };
  const individual = [
    { rank: 2, nationCode: "FRA", sex: "F", odds: 5 },
    { rank: 9, nationCode: "FRA", sex: "F", odds: 20 },
    { rank: 11, nationCode: "FRA", sex: "F", odds: 40 },
    { rank: 1, nationCode: "NOR", sex: "F", odds: 3 },
  ];

  it("une fois la cote de chaque biathlète de l'équipe dans le Top 10", () => {
    expect(computeEquipeBonus(team, { format: "sprint", sex: "F" }, individual, [])).toBe(25);
    expect(computeEquipeBonus(team, { format: "sprint", sex: "H" }, individual, [])).toBe(0);
    expect(computeEquipeBonus(null, { format: "sprint", sex: "F" }, individual, [])).toBe(0);
  });

  it("relais du sexe de l'équipe seulement", () => {
    const relay = [{ rank: 4, nationCode: "FRA", odds: 6 }];
    expect(computeEquipeBonus(team, { format: "relais_f", sex: "F" }, [], relay)).toBe(6);
    expect(computeEquipeBonus(team, { format: "relais_h", sex: "H" }, [], relay)).toBe(0);
    expect(computeEquipeBonus(team, { format: "relais_mixte", sex: null }, [], relay)).toBe(0);
  });
});

describe("cartes Fusée et Gâchette (posées sur une étape)", () => {
  const before = new Date(Date.UTC(2026, 10, 30));
  it("couvrent les courses individuelles de l'étape, hommes et femmes, pas les relais", () => {
    const fusee = [card({ id: "f", card_type: "fusee", status: "used", used_on_stage_id: "etape1" })];
    expect(coveredRaceIds(fusee[0], races)).toEqual(["sprintF", "sprintH", "poursuiteF", "poursuiteH"]);
    expect(cardsOnRace("poursuiteH", fusee, races).fusee?.id).toBe("f");
    expect(cardsOnRace("relaisF", fusee, races).fusee).toBeNull();
    expect(cardsOnRace("sprintF2", fusee, races).fusee).toBeNull();
  });

  it("à poser avant la 1re course de l'étape, une seule fois par étape", () => {
    const cards = [card({ id: "g", card_type: "gachette" })];
    expect(canPlayStageCard("gachette", "etape1", cards, races, before)).toBe(true);
    expect(canPlayStageCard("gachette", "etape1", cards, races, new Date(Date.UTC(2026, 11, 2)))).toBe(false);
    expect(canPlayStageCard("fusee", "etape1", cards, races, before)).toBe(false); // pas en main
    const twice = [...cards, card({ id: "g0", card_type: "gachette", status: "used", used_on_stage_id: "etape2" })];
    expect(playableStageIds("gachette", twice, races, before)).toEqual(["etape1"]);
  });

  it("Talent n'est jamais « active »", () => {
    expect(describeCard(card({ card_type: "talent", status: "used" }), races, before).state).toBe("used");
  });
});

describe("Mondiaux / JO et cumul avec Ça farte (Guillaume, 04/11/2026)", () => {
  const before = new Date(Date.UTC(2026, 10, 30));
  const worlds: CardRace[] = races.map((r) => (r.stage_id === "etape1" ? { ...r, coefficient: 2 } : r));

  it("aucune carte sur une course ×2, ni de 4e choix", () => {
    const cards = [card({ id: "c", card_type: "ca_farte" }), card({ id: "f", card_type: "fusee" })];
    expect(canPlayCard("ca_farte", "sprintF", cards, worlds)).toBe(false);
    expect(canPlayCard("ca_farte", "sprintF2", cards, worlds)).toBe(true);
    expect(canPlayStageCard("fusee", "etape1", cards, worlds, before)).toBe(false);
    expect(quatriemeChoixWindow("sprintF", worlds)).toEqual([]);
  });

  it("Ça farte et Fusée/Gâchette ne se cumulent pas sur une étape", () => {
    const withFusee = [card({ id: "c", card_type: "ca_farte" }), card({ id: "f", card_type: "fusee", status: "used", used_on_stage_id: "etape1" })];
    expect(canPlayCard("ca_farte", "sprintF", withFusee, races)).toBe(false);
    expect(canPlayCard("ca_farte", "sprintF2", withFusee, races)).toBe(true);
    const withCaFarte = [card({ id: "g", card_type: "gachette" }), card({ id: "c", card_type: "ca_farte", status: "used", used_on_race_id: "poursuiteH" })];
    expect(canPlayStageCard("gachette", "etape1", withCaFarte, races, before)).toBe(false);
    expect(canPlayStageCard("gachette", "etape2", withCaFarte, races, before)).toBe(true);
  });
});
