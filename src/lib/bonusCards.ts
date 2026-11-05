import type { SupabaseClient } from "@supabase/supabase-js";
import type { BonusCardEffect } from "./scoring/types";

/**
 * Cartes bonus gagnées au 10/10 (§12-13), choisies par le joueur (demandes de Guillaume, octobre 2026) :
 * - « Ça farte » : ×3 sur un biathlète d'une course individuelle, joué quand on veut ;
 * - « 4e choix » (`balle_de_pioche` en base) : 4 biathlètes au lieu de 3, les 3 meilleurs comptent,
 *   activé tout de suite sur 4 courses individuelles (2 hommes, 2 femmes) ;
 * - « Aspiration » (à partir de la 4e étape) : sur une course individuelle choisie, chacun des
 *   biathlètes pronostiqués compte une place plus haut ;
 * - « Équipe » (à partir de l'étape qui suit les Mondiaux/JO) : jusqu'à la fin de la saison, chaque
 *   biathlète de l'équipe favorite dans le Top 10 (ou sa nation dans le Top 10 du relais de son
 *   sexe) ajoute une fois sa cote aux points de la course.
 * - « Fusée » et « Gâchette » (04/11/2026, à la place des anciens bonus automatiques) : à poser sur une
 *   étape avant sa 1re course ; sur toutes les courses individuelles de l'étape (hommes et femmes),
 *   points fixes par biathlète compté (Fusée : 100/50/20 pour le 1er/2e/3e temps de ski ; Gâchette :
 *   100 par 20/20, 50 par 10/10 au sprint). Se cumulent avec toutes les autres cartes ;
 * - « Talent » (04/11/2026) : seulement après la révélation d'une de tes pépites ; réactive cette
 *   pépite (de nouveau cachée) ou en désigne une nouvelle, pour un sexe.
 * L'admin peut désactiver une carte ou limiter la période où elle est proposée au 10/10
 * (bonus_card_settings, migration 0039).
 * Une même carte ne se prend pas sur deux 10/10 d'affilée. Sur une même course, Ça farte et
 * Aspiration s'excluent, Aspiration et 4e choix aussi ; Ça farte se pose sur un des 4 choix d'un
 * 4e choix. Équipe se cumule avec tout.
 * VéloPronos : la carte « Grillade » (dégrillage, valeur `fondue` en base, nom repris de
 * Biathlonpronos) dégrille une fois ses coureurs sur la course de son choix ; elle se cumule avec tout.
 */

/**
 * VéloPronos (migration 0051) : cartes gagnées et jouées dans une seule course par étapes (série
 * de 5). Proposées : Grillade (`fondue`), Boost ×3 (`ca_farte`), 4e choix (`balle_de_pioche`, 3
 * étapes). Équipe et Chat noir viendront avec l'équipe de cœur ; les cartes biathlon ne sont plus
 * proposées (leur code reste pour les cartes déjà en base). Migration 0052 : Équipe (Grands Tours,
 * à partir de l'étape 10, équipe de cœur) et Chat noir (remplacer un maillot ou le porteur d'eau
 * d'un coureur qui a abandonné, jusqu'au départ de l'étape 10).
 */
/** VéloPronos : première étape où la carte Équipe rapporte (règle base44). */
export const EQUIPE_FROM_STAGE_NUMBER = 10;
export const CLAIMABLE_CARD_TYPES = ["fondue", "ca_farte", "balle_de_pioche", "equipe", "chat_noir"] as const;
export type ClaimableCardType = (typeof CLAIMABLE_CARD_TYPES)[number];
/** Cartes jouées par le joueur sur une course de son choix depuis le formulaire de pronostic. */
export type RaceCardType = "ca_farte" | "aspiration";
/** Cartes posées sur une étape entière (avant sa 1re course). */
export const STAGE_CARD_TYPES = ["fusee", "gachette"] as const;
export type StageCardType = (typeof STAGE_CARD_TYPES)[number];
export function isStageCardType(type: string): type is StageCardType {
  return (STAGE_CARD_TYPES as readonly string[]).includes(type);
}
/** VéloPronos : nombre d'étapes couvertes par le 4e choix (règle base44). */
export const QUATRIEME_CHOIX_RACES = 3;

export interface CardRace {
  id: string;
  /** Étape de la course (cartes Fusée / Gâchette). */
  stage_id?: string;
  /** Coefficient de l'étape : 2 aux Mondiaux/JO, où aucune carte ne se joue (Guillaume, 04/11/2026). */
  coefficient?: number;
  /** false : étape hors classement (×0), où aucune carte ne se joue non plus. */
  countsInStandings?: boolean;
  format: string;
  sex: string | null;
  locks_at: string;
  status: string;
  /** VéloPronos : numéro de l'étape dans sa course (carte Équipe), null pour une classique. */
  stage_number?: number | null;
}

/** CLM par équipes : pas de carte ni de 4e choix (on y pronostique des équipes). */
export function isTeamFormat(format: string): boolean {
  return format === "clm_equipes";
}

export function isRelayFormat(format: string): boolean {
  return format.startsWith("relais");
}

/**
 * Pas de carte bonus sur cette course : Mondiaux / JO (coefficient 2), où l'événement garde son seul
 * ×2, et étapes « Autre (×0) » hors classement (migration 0041).
 */
export function isCardFreeRace(race: { coefficient?: number; countsInStandings?: boolean } | undefined): boolean {
  return race?.coefficient === 2 || race?.countsInStandings === false;
}

/**
 * VéloPronos : étapes couvertes par un 4e choix activé sur `activationRaceId` : cette étape puis les
 * suivantes de la même course, 3 au total, CLM par équipes exclu. Moins de 3 en fin de course.
 */
export function quatriemeChoixWindow(activationRaceId: string, seasonRaces: CardRace[]): string[] {
  const activation = seasonRaces.find((r) => r.id === activationRaceId);
  if (!activation || isTeamFormat(activation.format) || isRelayFormat(activation.format) || isCardFreeRace(activation)) return [];
  const start = new Date(activation.locks_at).getTime();
  return seasonRaces
    .filter(
      (r) =>
        r.stage_id === activation.stage_id &&
        !isCardFreeRace(r) &&
        !isTeamFormat(r.format) &&
        !isRelayFormat(r.format) &&
        new Date(r.locks_at).getTime() >= start
    )
    .sort(
      (a, b) =>
        new Date(a.locks_at).getTime() - new Date(b.locks_at).getTime() ||
        (a.id === activationRaceId ? -1 : b.id === activationRaceId ? 1 : 0)
    )
    .slice(0, QUATRIEME_CHOIX_RACES)
    .map((r) => r.id);
}

export interface CardRow {
  id: string;
  card_type: string;
  status: string;
  used_on_race_id: string | null;
  /** Fusée / Gâchette : étape où la carte est posée. */
  used_on_stage_id?: string | null;
  /** VéloPronos : course où la carte a été gagnée, la seule où elle se joue. */
  course_id?: string | null;
  earned_at?: string;
}

export type CardState = "available" | "active" | "used";

export interface BonusCardView {
  id: string;
  type: string;
  state: CardState;
  /** 4e choix joué : courses couvertes et nombre d'entre elles déjà parties. */
  windowSize?: number;
  windowStarted?: number;
}

/**
 * État affiché d'une carte : disponible (pas encore jouée), active (jouée, au moins une course
 * couverte pas encore notée), utilisée (grisée, pour mémoire).
 */
export function describeCard(card: CardRow, seasonRaces: CardRace[], now: Date): BonusCardView {
  if (card.status === "available") return { id: card.id, type: card.card_type, state: "available" };
  // Talent : effet immédiat (la pépite est réactivée ou remplacée), rien ne reste « actif ».
  if (card.card_type === "talent") return { id: card.id, type: card.card_type, state: "used" };
  const raceById = new Map(seasonRaces.map((r) => [r.id, r]));
  const raceIds = coveredRaceIds(card, seasonRaces);
  const races = raceIds.map((id) => raceById.get(id)).filter((r): r is CardRace => !!r);
  const active = races.some((r) => r.status !== "finished");
  const view: BonusCardView = { id: card.id, type: card.card_type, state: active ? "active" : "used" };
  if (card.card_type === "balle_de_pioche") {
    view.windowSize = races.length;
    view.windowStarted = races.filter((r) => new Date(r.locks_at) <= now).length;
  }
  return view;
}

/**
 * Courses couvertes par une carte jouée : la fenêtre du 4e choix, toutes les courses restantes de la
 * saison pour Équipe (à partir de la course d'activation, relais compris), sinon la course où elle
 * a été jouée.
 */
export function coveredRaceIds(card: CardRow, seasonRaces: CardRace[]): string[] {
  if (isStageCardType(card.card_type)) {
    if (!card.used_on_stage_id) return [];
    return seasonRaces.filter((r) => r.stage_id === card.used_on_stage_id && !isRelayFormat(r.format)).map((r) => r.id);
  }
  if (!card.used_on_race_id) return [];
  if (card.card_type === "balle_de_pioche") return quatriemeChoixWindow(card.used_on_race_id, seasonRaces);
  if (card.card_type === "equipe") {
    // VéloPronos : étapes de la course de la carte, à partir de l'étape 10 et de l'activation.
    const activation = seasonRaces.find((r) => r.id === card.used_on_race_id);
    if (!activation) return [];
    const start = new Date(activation.locks_at).getTime();
    return seasonRaces
      .filter(
        (r) =>
          r.stage_id === activation.stage_id &&
          new Date(r.locks_at).getTime() >= start &&
          (r.stage_number ?? 0) >= EQUIPE_FROM_STAGE_NUMBER &&
          !isTeamFormat(r.format)
      )
      .map((r) => r.id);
  }
  return [card.used_on_race_id];
}

/** Cartes jouées par un joueur qui s'appliquent à une course donnée (moteur de scoring, formulaire). */
export function cardsOnRace(
  raceId: string,
  cards: CardRow[],
  seasonRaces: CardRace[]
): {
  quatriemeChoix: CardRow | null;
  caFarte: CardRow | null;
  aspiration: CardRow | null;
  equipe: CardRow | null;
  fusee: CardRow | null;
  gachette: CardRow | null;
} {
  const found = {
    quatriemeChoix: null as CardRow | null,
    caFarte: null as CardRow | null,
    aspiration: null as CardRow | null,
    equipe: null as CardRow | null,
    fusee: null as CardRow | null,
    gachette: null as CardRow | null,
  };
  for (const card of cards) {
    if (card.status !== "used" || !coveredRaceIds(card, seasonRaces).includes(raceId)) continue;
    if (card.card_type === "fusee") found.fusee = card;
    if (card.card_type === "gachette") found.gachette = card;
    if (card.card_type === "ca_farte") found.caFarte = card;
    if (card.card_type === "aspiration") found.aspiration = card;
    if (card.card_type === "balle_de_pioche") found.quatriemeChoix = card;
    if (card.card_type === "equipe") found.equipe = card;
  }
  return found;
}

/**
 * Une carte de course peut-elle être jouée sur cette course ? Ça farte et Aspiration s'excluent ;
 * Aspiration ne se cumule pas avec un 4e choix, Ça farte si (demande de Guillaume, 30/10/2026).
 */
export function canPlayCard(
  type: RaceCardType | "balle_de_pioche",
  raceId: string,
  cards: CardRow[],
  seasonRaces: CardRace[]
): boolean {
  const race = seasonRaces.find((r) => r.id === raceId);
  if (!race || isRelayFormat(race.format) || isTeamFormat(race.format) || isCardFreeRace(race)) return false;
  // Une carte ne se joue que dans la course où elle a été gagnée.
  if (!cards.some((c) => c.card_type === type && c.status === "available" && (!c.course_id || c.course_id === race.stage_id))) return false;
  const current = cardsOnRace(raceId, cards, seasonRaces);
  // Ça farte ne se cumule pas avec Fusée / Gâchette (Guillaume, 04/11/2026).
  if (type === "ca_farte") return !current.caFarte && !current.aspiration && !current.fusee && !current.gachette;
  if (type === "aspiration") return !current.caFarte && !current.aspiration && !current.quatriemeChoix;
  // 4e choix : pas d'Aspiration déjà posée sur une des courses qu'il couvrirait.
  if (current.quatriemeChoix) return false;
  const window = quatriemeChoixWindow(raceId, seasonRaces);
  return !cards.some(
    (c) => c.card_type === "aspiration" && c.status === "used" && !!c.used_on_race_id && window.includes(c.used_on_race_id)
  );
}

/**
 * Une carte Fusée / Gâchette peut-elle être posée sur cette étape ? La carte est en main, l'étape a
 * des courses individuelles et aucune course de l'étape (relais compris) n'est encore partie, et la
 * même carte n'y est pas déjà posée. Même règle que play_stage_card (migration 0039).
 */
export function canPlayStageCard(
  type: StageCardType,
  stageId: string,
  cards: CardRow[],
  seasonRaces: CardRace[],
  now: Date
): boolean {
  if (!cards.some((c) => c.card_type === type && c.status === "available")) return false;
  const stageRaces = seasonRaces.filter((r) => r.stage_id === stageId);
  if (!stageRaces.some((r) => !isRelayFormat(r.format))) return false;
  if (stageRaces.some((r) => isCardFreeRace(r))) return false;
  if (stageRaces.some((r) => new Date(r.locks_at) <= now)) return false;
  if (cards.some((c) => c.card_type === type && c.status === "used" && c.used_on_stage_id === stageId)) return false;
  // Pas de cumul avec un Ça farte déjà posé sur une course de l'étape.
  const raceIds = new Set(stageRaces.map((r) => r.id));
  return !cards.some((c) => c.card_type === "ca_farte" && c.status === "used" && !!c.used_on_race_id && raceIds.has(c.used_on_race_id));
}

/** Étapes où une carte Fusée / Gâchette peut encore être posée (pas encore commencées), dans l'ordre. */
export function playableStageIds(type: StageCardType, cards: CardRow[], seasonRaces: CardRace[], now: Date): string[] {
  const firstLock = new Map<string, number>();
  for (const r of seasonRaces) {
    if (!r.stage_id) continue;
    const t = new Date(r.locks_at).getTime();
    firstLock.set(r.stage_id, Math.min(firstLock.get(r.stage_id) ?? Infinity, t));
  }
  return [...firstLock.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([id]) => id)
    .filter((id) => canPlayStageCard(type, id, cards, seasonRaces, now));
}

/** Crédits de carte pas encore choisis : cartes gagnées au 10/10 moins cartes déjà prises. */
export function unclaimedCredits(cardsEarned: number, cardsHeld: number): number {
  return Math.max(0, cardsEarned - cardsHeld);
}

export interface PlayerCards {
  unclaimed: number;
  cards: BonusCardView[];
  /** Cartes du pop-up du 10/10 (proposées, verrouillées, ou prises au 10/10 précédent). */
  offers: { type: ClaimableCardType; state: OfferState }[];
  /** Cartes Fusée / Gâchette en main et les étapes où elles peuvent encore être posées. */
  stagePlays?: { cardId: string; type: StageCardType; stages: { id: string; location: string; startsOn: string }[] }[];
  /** Carte Talent en main (à jouer depuis la page des pronostics de saison). */
  talentCardId?: string | null;
  /** VéloPronos : course de ces cartes (série et cartes propres à chaque course). */
  course?: CardCourse | null;
  /** Carte Chat noir en main (à jouer depuis la page des maillots de la course). */
  chatNoirCardId?: string | null;
}

/** Réglage admin d'une carte pour la saison (table bonus_card_settings). Pas de ligne : carte active, sans limite. */
export interface CardSetting {
  card_type: string;
  enabled: boolean;
  available_from: string | null;
  available_until: string | null;
  /** Débloquée tout de suite, sans attendre son étape (Aspiration : 4e étape ; Équipe : après les Mondiaux). */
  force_unlock?: boolean;
}

/** La carte est-elle proposée au 10/10 selon les réglages de l'admin (interrupteur et période) ? */
export function isOfferedBySettings(type: string, settings: CardSetting[], now: Date): "yes" | "disabled" | "outOfPeriod" {
  const setting = settings.find((s) => s.card_type === type);
  if (!setting) return "yes";
  if (!setting.enabled) return "disabled";
  if (setting.available_from && new Date(setting.available_from) > now) return "outOfPeriod";
  if (setting.available_until && new Date(setting.available_until) < now) return "outOfPeriod";
  return "yes";
}

/** Toutes les courses de la saison, au format utilisé ici. */
export async function getSeasonCardRaces(supabase: SupabaseClient, seasonId: string): Promise<CardRace[]> {
  const { data } = await supabase
    .from("races")
    .select("id, stage_id, stage_number, format, sex, locks_at, status, stages!inner(season_id, coefficient, counts_in_standings)")
    .eq("stages.season_id", seasonId);
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    stage_id: r.stage_id,
    coefficient: r.stages?.coefficient,
    countsInStandings: r.stages?.counts_in_standings !== false,
    format: r.format,
    sex: r.sex,
    locks_at: r.locks_at,
    status: r.status,
    stage_number: r.stage_number ?? null,
  }));
}

export interface CardCourse {
  id: string;
  name: string;
  kind?: string;
}

/**
 * VéloPronos : course par étapes (ou Grand Tour) dont la série et les cartes sont affichées : celle
 * en cours (partie, pas encore entièrement notée), sinon la prochaine. null : aucune.
 */
export async function getCardCourse(supabase: SupabaseClient, seasonId: string, now: Date): Promise<CardCourse | null> {
  const { data } = await supabase
    .from("stages")
    .select("id, name, location, kind, counts_in_standings, races(locks_at, status)")
    .eq("season_id", seasonId)
    .in("kind", ["stage_race", "grand_tour"]);
  return pickCardCourse((data ?? []) as any[], now);
}

export function pickCardCourse(
  stages: Array<{ id: string; name?: string | null; location: string; kind?: string; counts_in_standings?: boolean; races?: { locks_at: string; status: string }[] }>,
  now: Date
): CardCourse | null {
  const courses = stages
    .filter((st) => st.counts_in_standings !== false && (st.races ?? []).length > 0)
    .map((st) => ({
      id: st.id,
      name: st.name ?? st.location,
      kind: st.kind,
      firstLock: Math.min(...(st.races ?? []).map((r) => Date.parse(r.locks_at))),
      finished: (st.races ?? []).every((r) => r.status === "finished"),
    }))
    .sort((a, b) => a.firstLock - b.firstLock);
  const t = now.getTime();
  const current = courses.find((c) => c.firstLock <= t && !c.finished) ?? courses.find((c) => c.firstLock > t);
  return current ? { id: current.id, name: current.name, kind: current.kind } : null;
}

/** Série en cours d'un joueur sur une course (0 sans compteur). */
export async function getCourseStreak(supabase: SupabaseClient, courseId: string, userId: string): Promise<number> {
  const { data } = await supabase
    .from("streak_counters")
    .select("current_streak")
    .eq("stage_id", courseId)
    .eq("user_id", userId)
    .maybeSingle();
  return data?.current_streak ?? 0;
}

/**
 * Cartes d'un joueur pour l'encadré « Série en cours » et le pop-up du Classement : celles de la
 * course en cours (getCardCourse). Les cartes d'un autre joueur sont lisibles grâce à la migration 0022.
 */
export async function getPlayerCards(supabase: SupabaseClient, seasonId: string, userId: string, now: Date): Promise<PlayerCards> {
  const course = await getCardCourse(supabase, seasonId, now);
  if (!course) return { unclaimed: 0, cards: [], offers: [], course: null };
  const [{ data: cards }, { data: streak }, races, { data: settings }, { data: favorite }] = await Promise.all([
    supabase
      .from("bonus_cards")
      .select("id, card_type, status, used_on_race_id, used_on_stage_id, course_id, earned_at")
      .eq("user_id", userId)
      .eq("course_id", course.id)
      .order("earned_at", { ascending: true }),
    supabase.from("streak_counters").select("cards_earned").eq("user_id", userId).eq("stage_id", course.id).maybeSingle(),
    getSeasonCardRaces(supabase, seasonId),
    supabase
      .from("bonus_card_settings")
      .select("card_type, enabled, available_from, available_until, force_unlock")
      .eq("season_id", seasonId),
    supabase.from("favorite_teams").select("team_id").eq("user_id", userId).eq("season_id", seasonId).maybeSingle(),
  ]);
  const rows = (cards ?? []) as CardRow[];
  return {
    course,
    chatNoirCardId: rows.find((c) => c.card_type === "chat_noir" && c.status === "available")?.id ?? null,
    unclaimed: unclaimedCredits(streak?.cards_earned ?? 0, rows.length),
    stagePlays: [],
    talentCardId: null,
    cards: rows.map((c) => describeCard(c, races, now)),
    offers: offeredCards(rows[rows.length - 1]?.card_type ?? null, [], now, {
      settings: (settings ?? []) as CardSetting[],
      // Équipe : Grand Tour et équipe de cœur choisie (claim_course_card, migration 0052).
      equipeAvailable: course.kind === "grand_tour" && !!favorite?.team_id,
    }),
  };
}

/**
 * Effet de carte retenu par le moteur de scoring pour un pronostic : ce sont les cartes jouées
 * (bonus_cards) qui font foi, pas le seul champ du pronostic. Sans 4e choix actif, seuls les
 * 3 premiers biathlètes du pronostic sont gardés.
 */
export function resolvePredictionCard(
  raceId: string,
  prediction: { athlete_ids: string[] | null; bonus_card_target_athlete_id: string | null },
  userCards: CardRow[],
  seasonRaces: CardRace[]
): { athleteIds: string[]; card: BonusCardEffect } {
  const athleteIds = prediction.athlete_ids ?? [];
  const { quatriemeChoix, caFarte, aspiration } = cardsOnRace(raceId, userCards, seasonRaces);
  const counted = athleteIds.slice(0, 3);
  const target = prediction.bonus_card_target_athlete_id;
  // Un 4e choix activé automatiquement peut couvrir une course où Aspiration était déjà posée :
  // Aspiration, jouée exprès par le joueur, l'emporte sur cette course (à confirmer).
  if (aspiration) return { athleteIds: counted, card: { type: "aspiration" } };
  if (quatriemeChoix) {
    // Ça farte se pose sur un des 4 choix (Guillaume, 30/10/2026).
    const picks = athleteIds.slice(0, 4);
    const caFarteTarget = caFarte && target && picks.includes(target) ? target : null;
    return {
      athleteIds: picks,
      card: caFarteTarget ? { type: "balle_de_pioche", caFarteTargetAthleteId: caFarteTarget } : { type: "balle_de_pioche" },
    };
  }
  if (caFarte && target && counted.includes(target)) {
    return { athleteIds: counted, card: { type: "ca_farte", targetAthleteId: target } };
  }
  return { athleteIds: counted, card: { type: "none" } };
}

// --- Cartes proposées au 10/10 ---------------------------------------------------------------

export interface CardStage {
  starts_on: string;
  coefficient: number;
  /** Départ de la première course de l'étape (null : pas encore de course). */
  firstLocksAt: string | null;
}

/** Numéro (à partir de 1) de l'étape qui débloque la carte Aspiration. */
export const ASPIRATION_UNLOCK_STAGE = 4;
/** Étape qui débloque la carte Équipe quand la saison n'a ni Mondiaux ni JO. */
export const EQUIPE_FALLBACK_UNLOCK_STAGE = 7;

/**
 * Étape à partir de laquelle une carte peut être choisie (index dans les étapes triées par date),
 * null si elle l'est dès le début. Aspiration : la 4e étape. Équipe : l'étape qui suit les
 * Mondiaux/JO (coefficient 2), la 7e à défaut.
 */
export function cardUnlockStageIndex(type: string, stages: CardStage[]): number | null {
  if (type === "aspiration") return ASPIRATION_UNLOCK_STAGE - 1;
  if (type === "equipe") {
    const sorted = [...stages].sort((a, b) => a.starts_on.localeCompare(b.starts_on));
    const championships = sorted.findIndex((s) => s.coefficient === 2);
    return championships >= 0 ? championships + 1 : EQUIPE_FALLBACK_UNLOCK_STAGE - 1;
  }
  return null;
}

/** La carte est-elle débloquée ? (la première course de l'étape qui la débloque est partie) */
export function isCardUnlocked(type: string, stages: CardStage[], now: Date): boolean {
  const index = cardUnlockStageIndex(type, stages);
  if (index == null) return true;
  const stage = [...stages].sort((a, b) => a.starts_on.localeCompare(b.starts_on))[index];
  return !!stage?.firstLocksAt && new Date(stage.firstLocksAt) <= now;
}

export type OfferState = "offered" | "locked" | "justTaken" | "unavailable";

/**
 * Cartes du pop-up du 10/10 : masquées si l'admin les a désactivées, grisées hors de leur période
 * (« unavailable »), verrouillées tant que leur étape n'a pas commencé (Talent : tant qu'aucune
 * pépite n'est révélée), et grisées si c'est la carte prise au 10/10 précédent (une même carte pas
 * deux fois d'affilée). Même règle que claim_bonus_card (migration 0039).
 */
export function offeredCards(
  previousClaimedType: string | null,
  stages: CardStage[],
  now: Date,
  options: { settings?: CardSetting[]; hasRevealedPepite?: boolean; equipeAvailable?: boolean } = {}
): { type: ClaimableCardType; state: OfferState }[] {
  const settings = options.settings ?? [];
  return CLAIMABLE_CARD_TYPES.filter((type) => isOfferedBySettings(type, settings, now) !== "disabled").map((type) => ({
    type,
    state:
      isOfferedBySettings(type, settings, now) === "outOfPeriod"
        ? "unavailable"
        : (type === "equipe"
              ? !options.equipeAvailable
              : !isCardUnlocked(type, stages, now) && !settings.find((x) => x.card_type === type)?.force_unlock) ||
            ((type as string) === "talent" && !options.hasRevealedPepite)
          ? "locked"
          : type === previousClaimedType
            ? "justTaken"
            : "offered",
  }));
}

// --- Carte Équipe ------------------------------------------------------------------------------

/**
 * Points de la carte Équipe sur une course : une fois la cote de chaque biathlète de l'équipe
 * favorite classé dans le Top 10 (course individuelle du même sexe), ou une fois la cote du relais
 * si la nation y finit dans le Top 10 (relais hommes ou femmes du sexe de l'équipe). Pas de
 * coefficient : « on ajoute une fois sa cote ».
 */
export function computeEquipeBonus(
  favoriteTeam: { nationCode: string; sex: string } | null,
  race: { format: string; sex: string | null },
  individual: { rank: number; nationCode: string; sex: string; odds: number }[],
  relay: { rank: number; nationCode: string; odds: number }[]
): number {
  if (!favoriteTeam) return 0;
  if (isRelayFormat(race.format)) {
    const relayFormat = favoriteTeam.sex === "H" ? "relais_h" : "relais_f";
    if (race.format !== relayFormat) return 0;
    const team = relay.find((r) => r.nationCode === favoriteTeam.nationCode && r.rank <= 10);
    return team ? team.odds : 0;
  }
  if (race.sex !== favoriteTeam.sex) return 0;
  return individual
    .filter((r) => r.rank <= 10 && r.nationCode === favoriteTeam.nationCode && r.sex === favoriteTeam.sex)
    .reduce((sum, r) => sum + r.odds, 0);
}

/**
 * VéloPronos : points de la carte Équipe sur une étape (règle base44) : chaque coureur de l'équipe
 * de cœur classé dans le Top 10 rapporte une fois sa cote du type d'étape, arrondie (1 sans cote),
 * qu'il ait été pronostiqué ou non.
 */
export function computeTeamCardBonus(teamId: string | null, results: { rank: number; teamId: string | null; odds: number | null }[]): number {
  if (!teamId) return 0;
  return results
    .filter((r) => r.rank <= 10 && r.teamId === teamId)
    .reduce((sum, r) => sum + Math.round(r.odds && r.odds > 0 ? r.odds : 1), 0);
}
