import Anthropic from "@anthropic-ai/sdk";
import { toCsv } from "./csv";
import { nameVariants } from "./resultsCsv";

/**
 * Résultats d'une étape récupérés par l'IA (VéloPronos). Contrairement au biathlon (API JSON de
 * l'IBU), le cyclisme n'a pas de source unique : Claude cherche sur le web et croise plusieurs
 * sites, dans l'ordre de confiance fixé par Guillaume (05/11/2026) : site officiel de la course,
 * puis ProCyclingStats, puis L'Équipe. Le résultat est converti au format du CSV de résultats,
 * pour pré-remplir le formulaire comme l'import CSV : rien n'est enregistré sans validation.
 */

/** Sources consultées, par ordre de priorité (le site officiel est ajouté en tête s'il est connu). */
export const RESULT_SOURCES = [
  { name: "ProCyclingStats", domain: "procyclingstats.com" },
  { name: "L'Équipe", domain: "lequipe.fr" },
];

/** Sites officiels connus (nom de course normalisé → URL). Sinon, l'IA cherche le site officiel. */
const OFFICIAL_SITES: Array<[RegExp, string]> = [
  [/tour de france/, "https://www.letour.fr"],
  [/giro|tour d.?italie/, "https://www.giroditalia.it"],
  [/vuelta|tour d.?espagne/, "https://www.lavuelta.es"],
  [/paris.?nice/, "https://www.paris-nice.fr"],
  [/dauphine/, "https://www.dauphine-libere.fr"],
  [/paris.?roubaix/, "https://www.paris-roubaix.fr"],
  [/tour des flandres|ronde van vlaanderen/, "https://www.rondevanvlaanderen.be"],
  [/liege.?bastogne/, "https://www.liege-bastogne-liege.be"],
  [/fleche wallonne/, "https://www.flechewallonne.be"],
  [/milan.?san.?remo|milano.?sanremo/, "https://www.milanosanremo.it"],
  [/lombardie|lombardia/, "https://www.ilombardia.it"],
  [/tirreno/, "https://www.tirrenoadriatico.it"],
  [/tour de suisse/, "https://www.tourdesuisse.ch"],
  [/tour de romandie/, "https://www.tourderomandie.ch"],
];

export function officialSiteFor(courseName: string): string | null {
  const key = courseName.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return OFFICIAL_SITES.find(([re]) => re.test(key))?.[1] ?? null;
}

export interface AiStageQuery {
  courseName: string;
  /** Date de l'étape, « 2027-07-04 » (heure de Paris). */
  date: string;
  /** Numéro d'étape, `null` pour une classique, 0 pour un prologue. */
  stageNumber: number | null;
  startCity?: string | null;
  endCity?: string | null;
  /** CLM par équipes : classement des équipes. */
  teamTimeTrial: boolean;
  /** Site officiel de la course (connu, sinon cherché par l'IA). */
  officialUrl?: string | null;
  /** Page de résultats donnée par l'admin (organisateur ou autre source sûre) : lue en premier. */
  referenceUrl?: string | null;
  /** Places à donner (10 suffit pour le barème). */
  topN: number;
  /** Étape Crevaison : coureurs pronostiqués dont il faut aussi la place, même hors Top N. */
  extraRiders?: string[];
}

export interface AiResultRow {
  rank: number;
  name: string;
  nation?: string;
  team?: string;
  /** Sources qui donnent ce coureur à cette place. */
  sources: string[];
  /** Les sources ne sont pas d'accord sur cette place. */
  disputed?: boolean;
  note?: string;
}

export interface AiStageResult {
  /** final : résultat officiel ; provisional : réclamation, homologation en cours ; not_found : pas encore publié. */
  status: "final" | "provisional" | "not_found";
  rows: AiResultRow[];
  /** Coureurs pronostiqués hors du Top N (étape Crevaison) ; rang null = abandon / non classé. */
  extraRows: Array<{ name: string; rank: number | null; sources: string[] }>;
  combatif: { name: string; sources: string[] } | null;
  sources: Array<{ name: string; url: string }>;
  notes: string[];
}

export function buildAiPrompt(q: AiStageQuery): string {
  const stage =
    q.stageNumber == null ? "one-day race" : q.stageNumber === 0 ? "prologue" : `stage ${q.stageNumber}`;
  const route = [q.startCity, q.endCity].filter(Boolean).join(" → ");
  const official = q.officialUrl ? `the official race website (${q.officialUrl})` : "the official race website (find it)";
  const sources = [
    ...(q.referenceUrl ? [`the results page given by the game admin, a trusted source (${q.referenceUrl}): read it first`] : []),
    official,
    ...RESULT_SOURCES.map((s) => `${s.name} (${s.domain})`),
  ];
  const subject = q.teamTimeTrial ? "teams" : "riders";

  return [
    `Find the official result of this professional road cycling race: ${q.courseName}, ${stage}${route ? ` (${route})` : ""}, held on ${q.date}.`,
    "",
    `Check these sources, in this order of priority, and cross-check them: ${sources.map((s, i) => `${i + 1}. ${s}`).join("; ")}.`,
    "If the sources disagree on a place, keep the highest-priority source and mark the place as disputed, saying in the note what the other sources say.",
    "Only use sources about this exact race, year and stage. Do not guess: if the result is not published yet, answer with status \"not_found\" and empty lists.",
    "",
    `Give the top ${q.topN} ${subject} of the ${q.teamTimeTrial ? "team time trial" : "stage"} (stage ranking, not the general classification).`,
    q.teamTimeTrial
      ? "For each team, give its usual name as used by ProCyclingStats (e.g. \"UAE Team Emirates XRG\")."
      : "For each rider, give the full name with correct accents (first name then last name), the nation as an IOC 3-letter code and the team.",
    q.teamTimeTrial ? "" : "Also give the most combative rider of the day (combativity award / prix de la combativité) if one was awarded, otherwise null.",
    q.extraRiders && q.extraRiders.length > 0
      ? `Also give the stage ranking of each of these riders even if they are outside the top ${q.topN} (rank null if they did not finish or did not start): ${q.extraRiders.join(", ")}.`
      : "",
    "",
    "Answer with a single JSON object and nothing after it, in this exact shape:",
    "```json",
    JSON.stringify(
      {
        status: "final | provisional | not_found",
        rows: [{ rank: 1, name: "Tadej Pogačar", nation: "SLO", team: "UAE Team Emirates XRG", sources: ["official", "ProCyclingStats", "L'Équipe"], disputed: false, note: "" }],
        extra_rows: [{ name: "…", rank: 34, sources: ["ProCyclingStats"] }],
        combatif: { name: "…", sources: ["official"] },
        sources: [{ name: "official", url: "https://…" }],
        notes: ["anything the admin should know, in French"],
      },
      null,
      2
    ),
    "```",
  ]
    .filter((line, i, all) => line !== "" || all[i - 1] !== "")
    .join("\n");
}

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function asSources(v: unknown): string[] {
  return Array.isArray(v) ? v.map(asString).filter(Boolean) : [];
}

/** Dernier objet JSON de la réponse (bloc ```json``` ou accolades nues). */
function extractJson(text: string): unknown {
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1]);
  const candidates = fenced.length > 0 ? fenced.reverse() : [];
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last > first) candidates.push(text.slice(first, last + 1));
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      // essaie le suivant
    }
  }
  throw new Error("Réponse de l'IA illisible (pas de JSON).");
}

export function parseAiAnswer(text: string): AiStageResult {
  const raw = extractJson(text) as Record<string, unknown>;
  const status = raw.status === "final" || raw.status === "provisional" ? raw.status : "not_found";

  const rows: AiResultRow[] = [];
  for (const r of Array.isArray(raw.rows) ? raw.rows : []) {
    const rank = Number((r as any)?.rank);
    const name = asString((r as any)?.name);
    if (!Number.isInteger(rank) || rank < 1 || name === "") continue;
    rows.push({
      rank,
      name,
      nation: asString((r as any).nation).toUpperCase() || undefined,
      team: asString((r as any).team) || undefined,
      sources: asSources((r as any).sources),
      disputed: (r as any).disputed === true,
      note: asString((r as any).note) || undefined,
    });
  }
  rows.sort((a, b) => a.rank - b.rank);

  const extraRows: AiStageResult["extraRows"] = [];
  for (const r of Array.isArray(raw.extra_rows) ? raw.extra_rows : []) {
    const name = asString((r as any)?.name);
    if (name === "") continue;
    const rank = Number((r as any).rank);
    extraRows.push({ name, rank: Number.isInteger(rank) && rank > 0 ? rank : null, sources: asSources((r as any).sources) });
  }

  const c = raw.combatif as Record<string, unknown> | null | undefined;
  const combatifName = c && typeof c === "object" ? asString(c.name) : "";

  return {
    status,
    rows,
    extraRows,
    combatif: combatifName ? { name: combatifName, sources: asSources(c!.sources) } : null,
    sources: (Array.isArray(raw.sources) ? raw.sources : [])
      .map((s: any) => ({ name: asString(s?.name), url: asString(s?.url) }))
      .filter((s) => s.url !== ""),
    notes: Array.isArray(raw.notes) ? raw.notes.map(asString).filter(Boolean) : [],
  };
}

/**
 * CSV d'import (même format que l'import manuel) et avertissements pour l'admin : places
 * contestées, places confirmées par une seule source, doublons de rang.
 */
export function aiResultToCsv(result: AiStageResult, teamMode: boolean): { csv: string; warnings: string[] } {
  const warnings: string[] = [];
  const seenRanks = new Set<number>();
  for (const r of result.rows) {
    if (seenRanks.has(r.rank)) warnings.push(`Place ${r.rank} donnée deux fois par l'IA : vérifie.`);
    seenRanks.add(r.rank);
    if (r.disputed) warnings.push(`Place ${r.rank} (${r.name}) : sources en désaccord.${r.note ? ` ${r.note}` : ""}`);
    else if (r.sources.length < 2) warnings.push(`Place ${r.rank} (${r.name}) : une seule source${r.sources[0] ? ` (${r.sources[0]})` : ""}.`);
  }
  if (result.status === "provisional") warnings.unshift("Résultat provisoire (réclamation ou homologation en cours) : vérifie avant d'enregistrer.");
  warnings.push(...result.notes);

  const extra = result.extraRows.filter((e) => e.rank != null && !seenRanks.has(e.rank));
  if (teamMode) {
    return { csv: toCsv(["Rang", "Équipe"], result.rows.map((r) => [r.rank, r.name])), warnings };
  }
  const lines = [
    ...result.rows.map((r) => [r.rank, r.name, r.nation ?? ""]),
    ...extra.map((e) => [e.rank, e.name, ""]),
  ];
  return { csv: toCsv(["Rang", "Athlète", "Nation"], lines), warnings };
}

/** Coureur désigné par l'IA (combatif) retrouvé parmi les engagés, sans tenir compte des accents. */
export function findRiderByName<T extends { firstName: string; lastName: string }>(name: string, riders: T[]): T | null {
  const wanted = new Set(nameVariants(name));
  const found = riders.filter((r) =>
    [`${r.firstName} ${r.lastName}`, `${r.lastName} ${r.firstName}`].some((label) => nameVariants(label).some((v) => wanted.has(v)))
  );
  return found.length === 1 ? found[0] : null;
}

/** Modèle utilisé : Claude Opus 5.5 par défaut, réglable par `ANTHROPIC_MODEL`. */
const DEFAULT_MODEL = "claude-opus-5-5";

/**
 * Appel à Claude avec recherche et lecture web côté serveur Anthropic. Clé : `ANTHROPIC_API_KEY`.
 * Un tour long peut être mis en pause par l'API (`pause_turn`) : on relance alors la suite.
 */
export async function fetchAiStageResults(q: AiStageQuery, client?: Anthropic): Promise<{ result: AiStageResult; model: string }> {
  if (!client && !process.env.ANTHROPIC_API_KEY) {
    throw new Error("Clé ANTHROPIC_API_KEY absente : ajoute-la dans .env.local (et sur l'hébergement) pour récupérer les résultats par IA.");
  }
  const anthropic = client ?? new Anthropic();
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: buildAiPrompt(q) }];
  let response: Anthropic.Beta.BetaMessage | null = null;
  for (let turn = 0; turn < 4; turn++) {
    response = await anthropic.beta.messages.create({
      model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      system:
        "You are a meticulous cycling results checker. You only report results you have read on the web during this request, never from memory.",
      tools: [
        { type: "web_search_20260209", name: "web_search", max_uses: 8 },
        { type: "web_fetch_20260209", name: "web_fetch", max_uses: 6 },
      ],
      messages,
    });
    if (response.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: response.content });
  }
  if (!response) throw new Error("Aucune réponse de l'IA.");
  if (response.stop_reason === "refusal") throw new Error("L'IA a refusé la demande : réessaie ou saisis les résultats à la main.");

  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  return { result: parseAiAnswer(text), model: response.model };
}
