import { describe, expect, it } from "vitest";
import { normalizeNationCode } from "../nationFlags";
import { courseCoefficient, parisTimeToUtcIso, parseDate, parseStageType, parseTime } from "../velo/courses";
import { parseCourseCalendar, parseCourseRiders, parseCourseStages, parseCourseTeams } from "../velo/imports";

describe("vocabulaire vélo", () => {
  it("reconnaît les types d'étape du fichier et de l'ancienne app", () => {
    expect(parseStageType("CLME")).toBe("clm_equipes");
    expect(parseStageType("Baroudeurs")).toBe("baroudeurs");
    expect(parseStageType("mountain")).toBe("montagne");
    expect(parseStageType("Accidentée")).toBe("baroudeurs");
    expect(parseStageType("Plaine")).toBeNull();
  });

  it("lit dates et heures", () => {
    expect(parseDate("2027-03-06")).toBe("2027-03-06");
    expect(parseDate("6/3/2027")).toBe("2027-03-06");
    expect(parseTime("9h30")).toBe("09:30");
    expect(parseTime("15:05")).toBe("15:05");
  });

  it("convertit l'heure de Paris en UTC, été comme hiver", () => {
    expect(parisTimeToUtcIso("2026-07-04", "15:05")).toBe("2026-07-04T13:05:00.000Z");
    expect(parisTimeToUtcIso("2027-03-06", "11:00")).toBe("2027-03-06T10:00:00.000Z");
  });

  it("met les monuments et les Mondiaux à ×2", () => {
    expect(courseCoefficient("Paris-Roubaix", "world_tour")).toBe(2);
    expect(courseCoefficient("Liège-Bastogne-Liège", null)).toBe(2);
    expect(courseCoefficient("Championnats du Monde", "world_champs")).toBe(2);
    expect(courseCoefficient("Strade Bianche", "world_tour")).toBe(1);
  });

  it("normalise les codes pays", () => {
    expect(normalizeNationCode("ALL")).toBe("GER");
    expect(normalizeNationCode("PL")).toBe("POL");
    expect(normalizeNationCode("GB")).toBe("GBR");
    expect(normalizeNationCode("SLO")).toBe("SLO");
    expect(normalizeNationCode("")).toBeUndefined();
  });
});

describe("parseCourseCalendar", () => {
  const csv = [
    "﻿Nom,Date debut,Date fin,Categorie,Type,Pays,Statut,Visible,Compte classement saison,Cyclix,Expert",
    "Strade Bianche,2027-03-06,,world_tour,one_day,ITA,upcoming,non,oui,oui,oui",
    "Giro,2027-05-08,2027-05-30,grand_tour,grand_tour,ITA,upcoming,non,oui,oui,oui",
    "Week-end des Champions,2027-06-26,2027-06-27,national_championships,bonus_event,,upcoming,non,oui,oui,oui",
    "Tour des Flandres,2027-04-04,,monument,one_day,BEL,active,non,non,oui,oui",
  ].join("\n");

  it("lit les courses, leurs maillots et leur coefficient", () => {
    const { courses, warnings } = parseCourseCalendar(csv);
    expect(courses).toHaveLength(4);
    const [strade, giro, champions, flandres] = courses;
    expect(strade).toMatchObject({ kind: "one_day", endsOn: "2027-03-06", jerseys: [], coefficient: 1, isVisible: true });
    expect(giro).toMatchObject({ kind: "grand_tour", jerseyColor: "#F49AC1", coefficient: 1 });
    expect(giro.jerseys).toContain("equipe");
    expect(champions.countryCode).toBe("FRA");
    expect(flandres).toMatchObject({ coefficient: 2, countsInStandings: false });
    expect(warnings).toHaveLength(1);
  });
});

describe("parseCourseStages", () => {
  const csv = [
    "stage_number,ville_depart,ville_arrivee,type_etape,km,heure_depart,date,pays,country_code,denivele",
    "1,Barcelona,Barcelona,CLME,19,15:05,2026-07-04,Espagne,ESP,200",
    "2,Tarragona,Barcelona,Baroudeurs,182,11:55,2026-07-05,Espagne,ESP,2500",
    "R,,,,,12:00,2026-07-06,,,",
    "3,Granollers,Les Angles,Montagne,196,10:20,2026-07-07,Espagne,ESP,3850",
  ].join("\n");

  it("sépare étapes et jours de repos", () => {
    const { stages, restDays, warnings } = parseCourseStages(csv);
    expect(warnings).toEqual([]);
    expect(stages.map((s) => s.type)).toEqual(["clm_equipes", "baroudeurs", "montagne"]);
    expect(stages[2]).toMatchObject({ stageNumber: 3, startCity: "Granollers", distanceKm: 196, elevationM: 3850, time: "10:20" });
    expect(restDays).toEqual(["2026-07-06"]);
  });

  it("décale les dates d'une course de test", () => {
    const { stages, restDays } = parseCourseStages(csv, 140);
    expect(stages[0].date).toBe("2026-11-21");
    expect(restDays).toEqual(["2026-11-23"]);
  });
});

describe("parseCourseRiders", () => {
  const csv = [
    "numero,prenom,nom,equipe,nom_equipe,nationalite,statut,cote_sprint,cote_montagne,cote_clm,cote_baroudeur,MJ,MV,MP,MJeune,SC",
    "1,Jean,Dupont,ABC,,FRA,active,30,6,10,8,10,100,10,,500",
    "2,Hans,Müller,ABC,Équipe ABC,ALL,abandoned,40,12,20,14,80,500,60,20,500",
    "3,Jean,Dupont,XYZ,,FRA,active,1,1,1,1,1,1,1,1,1",
    "4,Sans,Equipe,,,FRA,active,1,1,1,1,1,1,1,1,1",
  ].join("\n");

  it("lit les coureurs et leurs cotes par type d'étape et par maillot", () => {
    const { riders, warnings } = parseCourseRiders(csv);
    expect(riders).toHaveLength(2);
    expect(riders[0]).toMatchObject({ bib: 1, teamCode: "ABC", teamName: "", nationCode: "FRA" });
    expect(riders[0].odds).toEqual({
      sprint: 30,
      montagne: 6,
      clm: 10,
      baroudeurs: 8,
      maillot_general: 10,
      maillot_points: 100,
      maillot_montagne: 10,
      super_combatif: 500,
    });
    expect(riders[1]).toMatchObject({ nationCode: "GER", teamName: "Équipe ABC" });
    expect(riders[1].odds.maillot_jeune).toBe(20);
    expect(warnings).toHaveLength(2); // doublon + équipe manquante
  });
});

describe("parseCourseTeams", () => {
  it("lit les cotes meilleure équipe et CLM par équipes", () => {
    const { teams } = parseCourseTeams("equipe,equipe_nom,cote_ME,CLME\nUAE,UAE Team Emirates XRG,30,18\n");
    expect(teams).toEqual([{ code: "UAE", name: "UAE Team Emirates XRG", odds: { meilleure_equipe: 30, clm_equipes: 18 } }]);
  });
});
