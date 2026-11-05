import { describe, expect, it, vi } from "vitest";
import {
  aiResultToCsv,
  buildAiPrompt,
  fetchAiStageResults,
  findRiderByName,
  officialSiteFor,
  parseAiAnswer,
} from "../aiStageResults";
import { parseResultsCsv } from "../resultsCsv";

const answer = (obj: unknown) => `J'ai vérifié les sources.\n\`\`\`json\n${JSON.stringify(obj)}\n\`\`\``;

const sample = {
  status: "final",
  rows: [
    { rank: 2, name: "Jonas Vingegaard", nation: "den", team: "Visma", sources: ["official", "ProCyclingStats"] },
    { rank: 1, name: "Tadej Pogačar", nation: "SLO", sources: ["official", "ProCyclingStats", "L'Équipe"] },
    { rank: 3, name: "Remco Evenepoel", nation: "BEL", sources: ["ProCyclingStats"] },
    { rank: 4, name: "Primož Roglič", nation: "SLO", sources: ["official"], disputed: true, note: "L'Équipe le donne 5e." },
    { rank: "DNF", name: "Ignoré" },
  ],
  extra_rows: [{ name: "Romain Bardet", rank: 34, sources: ["ProCyclingStats"] }, { name: "Abandon", rank: null }],
  combatif: { name: "Julian Alaphilippe", sources: ["official"] },
  sources: [{ name: "official", url: "https://www.letour.fr/fr/classements/etape-4" }, { name: "sans url" }],
  notes: ["Arrivée jugée au sprint."],
};

describe("parseAiAnswer", () => {
  it("lit le dernier bloc JSON, trie les places et ignore les lignes sans rang", () => {
    const r = parseAiAnswer(answer(sample));
    expect(r.status).toBe("final");
    expect(r.rows.map((x) => x.rank)).toEqual([1, 2, 3, 4]);
    expect(r.rows[1].nation).toBe("DEN");
    expect(r.extraRows).toEqual([
      { name: "Romain Bardet", rank: 34, sources: ["ProCyclingStats"] },
      { name: "Abandon", rank: null, sources: [] },
    ]);
    expect(r.combatif?.name).toBe("Julian Alaphilippe");
    expect(r.sources).toHaveLength(1);
  });

  it("accepte un JSON sans bloc et refuse une réponse sans JSON", () => {
    expect(parseAiAnswer('{"status":"not_found","rows":[]}').status).toBe("not_found");
    expect(() => parseAiAnswer("Pas encore de résultat.")).toThrow(/illisible/);
  });
});

describe("aiResultToCsv", () => {
  const candidates = [
    { id: "a", firstName: "Tadej", lastName: "Pogacar", nationCode: "SLO" },
    { id: "b", firstName: "Jonas", lastName: "Vingegaard", nationCode: "DEN" },
    { id: "c", firstName: "Remco", lastName: "Evenepoel", nationCode: "BEL" },
    { id: "d", firstName: "Primož", lastName: "Roglič", nationCode: "SLO" },
    { id: "e", firstName: "Romain", lastName: "Bardet", nationCode: "FRA" },
  ];

  it("produit un CSV relu par l'import, avec les coureurs hors Top 10 et les alertes", () => {
    const { csv, warnings } = aiResultToCsv(parseAiAnswer(answer(sample)), false);
    const parsed = parseResultsCsv(csv, "athlete", candidates);
    expect(parsed.matched).toBe(5);
    expect(parsed.rows.a.rank).toBe("1");
    expect(parsed.rows.d.rank).toBe("4");
    expect(parsed.rows.e.rank).toBe("34");
    expect(warnings).toContain("Place 3 (Remco Evenepoel) : une seule source (ProCyclingStats).");
    expect(warnings.some((w) => w.startsWith("Place 4 (Primož Roglič) : sources en désaccord."))).toBe(true);
    expect(warnings).toContain("Arrivée jugée au sprint.");
  });

  it("classe les équipes d'un CLM par équipes par leur nom", () => {
    const result = parseAiAnswer(answer({ status: "provisional", rows: [{ rank: 1, name: "Visma | Lease a Bike", sources: ["a", "b"] }] }));
    const { csv, warnings } = aiResultToCsv(result, true);
    const parsed = parseResultsCsv(csv, "nation", [{ id: "t1", nationCode: "TVL", nationName: "Visma | Lease a Bike" }]);
    expect(parsed.rows.t1.rank).toBe("1");
    expect(warnings[0]).toMatch(/provisoire/);
  });
});

describe("outils", () => {
  it("connaît les sites officiels des grandes courses", () => {
    expect(officialSiteFor("Tour de France")).toBe("https://www.letour.fr");
    expect(officialSiteFor("Critérium du Dauphiné")).toBe("https://www.dauphine-libere.fr");
    expect(officialSiteFor("Grand Prix inconnu")).toBeNull();
  });

  it("retrouve le combatif sans tenir compte des accents", () => {
    const riders = [{ id: "x", firstName: "Julian", lastName: "Alaphilippe" }, { id: "y", firstName: "Tadej", lastName: "Pogačar" }];
    expect(findRiderByName("Tadej Pogacar", riders)?.id).toBe("y");
    expect(findRiderByName("Inconnu", riders)).toBeNull();
  });

  it("met les sources dans l'ordre demandé et les coureurs de l'étape Crevaison", () => {
    const prompt = buildAiPrompt({
      courseName: "Tour de France",
      date: "2027-07-06",
      stageNumber: 4,
      startCity: "Lille",
      endCity: "Arras",
      teamTimeTrial: false,
      officialUrl: "https://www.letour.fr",
      topN: 10,
      extraRiders: ["Romain Bardet"],
    });
    expect(prompt).toContain("stage 4 (Lille → Arras), held on 2027-07-06");
    expect(prompt.indexOf("letour.fr")).toBeLessThan(prompt.indexOf("procyclingstats.com"));
    expect(prompt.indexOf("procyclingstats.com")).toBeLessThan(prompt.indexOf("lequipe.fr"));
    expect(prompt).toContain("Romain Bardet");
  });
});

describe("fetchAiStageResults", () => {
  it("relance la suite après une pause de l'API puis lit la réponse", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({ stop_reason: "pause_turn", content: [{ type: "text", text: "Je cherche…" }], model: "m" })
      .mockResolvedValueOnce({ stop_reason: "end_turn", content: [{ type: "text", text: answer(sample) }], model: "claude-test" });
    const client = { beta: { messages: { create } } } as any;
    const { result, model } = await fetchAiStageResults(
      { courseName: "Tour de France", date: "2027-07-06", stageNumber: 4, teamTimeTrial: false, topN: 10 },
      client
    );
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1][0].messages).toHaveLength(2);
    expect(model).toBe("claude-test");
    expect(result.rows).toHaveLength(4);
  });
});
