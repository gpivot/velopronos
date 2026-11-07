import Anthropic from "@anthropic-ai/sdk";
import { officialSiteFor } from "../admin/aiStageResults";

/**
 * Startlists par IA (VéloPronos, demande de Guillaume du 07/11/2026). À partir du lundi 17 h de la
 * semaine de course, Claude cherche sur le web la liste des engagés (provisoire puis définitive) :
 * noms, équipes, nations, dossards. Les cotes ne viennent jamais de l'IA : elles viennent de la
 * liste des coureurs de la saison (import CSV). Source prioritaire réglable par l'admin, puis
 * ProCyclingStats (jugé fiable par Guillaume), puis le site officiel de la course.
 */

export const DEFAULT_STARTLIST_SITE = "procyclingstats.com";

export interface AiStartlistQuery {
  courseName: string;
  /** Premier jour de la course, « 2027-03-20 ». */
  startsOn: string;
  /** Site prioritaire réglé dans l'admin (domaine ou URL), sinon ProCyclingStats. */
  prioritySite?: string | null;
  /** Page des engagés donnée pour cette course précise : lue en premier. */
  courseUrl?: string | null;
}

export interface AiStartlistRider {
  firstName: string;
  lastName: string;
  nation: string;
  team: string;
  bib: number | null;
}

export interface AiStartlist {
  /** final : liste définitive ; provisional : liste provisoire ; not_found : pas encore publiée. */
  status: "final" | "provisional" | "not_found";
  riders: AiStartlistRider[];
  sources: Array<{ name: string; url: string }>;
  notes: string[];
}

export function buildStartlistPrompt(q: AiStartlistQuery): string {
  const priority = (q.prioritySite || DEFAULT_STARTLIST_SITE).trim();
  const official = officialSiteFor(q.courseName);
  const sources = [
    ...(q.courseUrl ? [`the start list page given by the game admin (${q.courseUrl}): read it first`] : []),
    `${priority} (priority source chosen by the game admin)`,
    ...(priority.includes("procyclingstats") ? [] : ["ProCyclingStats (procyclingstats.com)"]),
    official ? `the official race website (${official})` : "the official race website (find it)",
  ];
  return [
    `Find the start list (riders entered) of this professional men's road cycling race: ${q.courseName}, starting on ${q.startsOn}.`,
    "",
    `Check these sources in this order of priority: ${sources.map((s, i) => `${i + 1}. ${s}`).join("; ")}.`,
    "Use the highest-priority source that has a start list for this exact race and year. A provisional start list is fine before the race: say so with status \"provisional\".",
    "Do not guess and do not use a previous year's start list: if no start list for this year is published yet, answer with status \"not_found\" and an empty list.",
    "Riders marked as non-starters (DNS) or withdrawn must be left out.",
    "",
    "For each rider give: first name and last name separately with correct accents, the nation as an IOC 3-letter code, the team name as used by ProCyclingStats, and the bib number if known (null otherwise).",
    "",
    "Answer with a single JSON object and nothing after it, in this exact shape:",
    "```json",
    JSON.stringify(
      {
        status: "final | provisional | not_found",
        riders: [{ first_name: "Tadej", last_name: "Pogačar", nation: "SLO", team: "UAE Team Emirates XRG", bib: 1 }],
        sources: [{ name: "ProCyclingStats", url: "https://…" }],
        notes: ["anything the admin should know, in French"],
      },
      null,
      2
    ),
    "```",
  ].join("\n");
}

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Dernier objet JSON de la réponse (bloc ```json``` ou accolades nues). */
function extractJson(text: string): unknown {
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1]).reverse();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last > first) fenced.push(text.slice(first, last + 1));
  for (const c of fenced) {
    try {
      return JSON.parse(c);
    } catch {
      // essaie le suivant
    }
  }
  throw new Error("Réponse de l'IA illisible (pas de JSON).");
}

export function parseStartlistAnswer(text: string): AiStartlist {
  const raw = extractJson(text) as Record<string, unknown>;
  const status = raw.status === "final" || raw.status === "provisional" ? raw.status : "not_found";
  const riders: AiStartlistRider[] = [];
  const seen = new Set<string>();
  for (const r of Array.isArray(raw.riders) ? raw.riders : []) {
    const lastName = asString((r as any)?.last_name);
    const firstName = asString((r as any)?.first_name);
    if (!lastName) continue;
    const key = `${firstName}|${lastName}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const bib = Number((r as any).bib);
    riders.push({
      firstName,
      lastName,
      nation: asString((r as any).nation).toUpperCase(),
      team: asString((r as any).team),
      bib: Number.isInteger(bib) && bib > 0 ? bib : null,
    });
  }
  return {
    status: status === "not_found" ? "not_found" : status,
    riders: status === "not_found" ? [] : riders,
    sources: (Array.isArray(raw.sources) ? raw.sources : [])
      .map((s: any) => ({ name: asString(s?.name), url: asString(s?.url) }))
      .filter((s) => s.url !== ""),
    notes: Array.isArray(raw.notes) ? raw.notes.map(asString).filter(Boolean) : [],
  };
}

/** Modèle utilisé : Claude Opus 5.5 par défaut, réglable par `ANTHROPIC_MODEL` (comme les résultats). */
const DEFAULT_MODEL = "claude-opus-5-5";

/**
 * Appel à Claude avec recherche et lecture web côté serveur Anthropic. Clé : `ANTHROPIC_API_KEY`.
 * Réponse en flux (une liste de 180 coureurs est longue) ; un tour mis en pause (`pause_turn`) est relancé.
 */
export async function fetchAiStartlist(q: AiStartlistQuery, client?: Anthropic): Promise<{ startlist: AiStartlist; model: string }> {
  if (!client && !process.env.ANTHROPIC_API_KEY) {
    throw new Error("Clé ANTHROPIC_API_KEY absente : ajoute-la sur l'hébergement pour récupérer les startlists par IA.");
  }
  const anthropic = client ?? new Anthropic();
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: buildStartlistPrompt(q) }];
  let response: Anthropic.Beta.BetaMessage | null = null;
  for (let turn = 0; turn < 4; turn++) {
    response = await anthropic.beta.messages
      .stream({
        model,
        max_tokens: 64000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium" },
        system:
          "You are a meticulous cycling data checker. You only report start lists you have read on the web during this request, never from memory.",
        tools: [
          { type: "web_search_20260209", name: "web_search", max_uses: 6 },
          { type: "web_fetch_20260209", name: "web_fetch", max_uses: 6 },
        ],
        messages,
      })
      .finalMessage();
    if (response.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: response.content });
  }
  if (!response) throw new Error("Aucune réponse de l'IA.");
  if (response.stop_reason === "refusal") throw new Error("L'IA a refusé la demande : réessaie ou importe le CSV des coureurs.");
  if (response.stop_reason === "max_tokens") throw new Error("Réponse de l'IA tronquée : réessaie.");
  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  return { startlist: parseStartlistAnswer(text), model: response.model };
}
