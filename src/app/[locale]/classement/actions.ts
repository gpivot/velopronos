"use server";

import { createClient } from "@/lib/supabase/server";
import { getClock } from "@/lib/clock";
import { getSeasonView, pickDefaultOpenStageId, type SeasonView } from "@/lib/seasonView";
import { getLeaderboard } from "@/lib/leaderboard";
import { getPlayerBadges, NO_BADGES, type PlayerBadges } from "@/lib/playerBadges";
import { getRaceResult } from "@/lib/lastResult";
import { shortAthleteName } from "@/lib/athleteName";
import { JERSEY_TYPES, type JerseyType } from "@/lib/velo/courses";

/** Pronostics maillots d'une course déjà partie (ou du joueur lui-même), dans la fiche d'un joueur. */
export interface PlayerCourseChoices {
  stageId: string;
  courseName: string;
  jerseys: { jersey: JerseyType; name: string; nationCode: string | null; points: number | null }[];
  /** Grand Tour : équipe choisie pour ce Grand Tour, si différente de l'équipe de cœur (0054). */
  grandTourTeam: string | null;
}

/**
 * « Ses choix » (accordéon de la fiche d'un joueur) : la version vélo des pronostics de saison du
 * biathlon. Équipe de cœur et nation favorite (choix définitifs, lisibles par tous, 0019), maillots des
 * courses déjà parties (lisibles au départ de la 1re étape, 0045) ; les porteurs d'eau révélés viennent
 * de `pepites` (un porteur non révélé ne quitte jamais le serveur).
 */
export interface PlayerChoices {
  heartTeam: string | null;
  nation: { code: string; name: string } | null;
  courses: PlayerCourseChoices[];
}

export interface PlayerSeason extends SeasonView {
  pseudo: string;
  defaultOpenStageId: string | null;
  /** Place au classement général (null : aucun point encore) et total de points. */
  rank: number | null;
  points: number;
  choices: PlayerChoices;
  /** Pictos (×2, victoires, porteur d'eau) ; leader : en tête du classement général. */
  badges: PlayerBadges;
  leader: boolean;
}

/**
 * Pop-up d'un joueur du Classement : sa page « Ma saison » en lecture seule. Ses pronostics
 * sur les étapes pas encore parties restent cachés (cf. getSeasonView et migration 0018).
 */
export async function getPlayerSeason(userId: string): Promise<PlayerSeason | null> {
  const supabase = createClient();
  const [{ data: season }, { data: profile }, { data: userResult }] = await Promise.all([
    supabase.from("seasons").select("id, starts_on").eq("status", "active").maybeSingle(),
    supabase.from("profiles").select("pseudo").eq("id", userId).maybeSingle(),
    supabase.auth.getUser(),
  ]);
  if (!season || !profile) return null;

  const { now } = await getClock();
  const isOwner = userResult.user?.id === userId;
  const [view, leaderboard, { data: favorite }, badges, { data: jerseyRows }, { data: jerseyLedger }, { data: gtTeams }] = await Promise.all([
    getSeasonView(supabase, season, userId, now, isOwner),
    getLeaderboard(supabase, season.id),
    // Équipe de cœur et nation favorite d'un autre joueur : lisibles grâce à la migration 0019.
    supabase.from("favorite_teams").select("nation_code, teams(name), nations(name)").eq("user_id", userId).eq("season_id", season.id).maybeSingle(),
    getPlayerBadges(supabase, season.id),
    // Maillots : la base ne donne ceux d'un autre joueur qu'une fois la course partie (0045).
    supabase
      .from("course_predictions")
      .select("stage_id, jersey, athlete_id, team_id, athletes(first_name, last_name, nation_code), teams(name)")
      .eq("user_id", userId),
    supabase.from("score_ledger").select("stage_id, jersey, points").eq("user_id", userId).eq("season_id", season.id).not("jersey", "is", null),
    supabase.from("course_heart_teams").select("stage_id, teams(name)").eq("user_id", userId),
  ]);
  const rankIndex = leaderboard.findIndex((row) => row.userId === userId);
  // Étapes hors classement masquées dans le pop-up : jamais ouvertes par défaut.
  const rankedStages = view.stages.filter((s) => s.counts_in_standings !== false);

  // Course partie = sa 1re étape a démarré : plus personne ne peut changer ses maillots.
  const started = new Set(
    view.stages.filter((s) => s.races.some((r) => new Date(r.locks_at) <= now)).map((s) => s.id)
  );
  const pointsOf = new Map(((jerseyLedger ?? []) as any[]).map((l) => [`${l.stage_id}|${l.jersey}`, Number(l.points)]));
  const gtTeamOf = new Map(((gtTeams ?? []) as any[]).map((g) => [g.stage_id as string, (g.teams as any)?.name ?? null]));
  const heartTeam = ((favorite?.teams as any)?.name as string | undefined) ?? null;
  const courses: PlayerCourseChoices[] = rankedStages
    .filter((s) => isOwner || started.has(s.id))
    .map((s) => {
      const rows = ((jerseyRows ?? []) as any[]).filter((p) => p.stage_id === s.id);
      const gtTeam = gtTeamOf.get(s.id) ?? null;
      return {
        stageId: s.id,
        courseName: s.location,
        jerseys: rows
          .map((p) => ({
            jersey: p.jersey as JerseyType,
            name: p.team_id ? ((p.teams as any)?.name ?? "?") : shortAthleteName(p.athletes, "?"),
            nationCode: p.team_id ? null : ((p.athletes as any)?.nation_code ?? null),
            points: pointsOf.get(`${s.id}|${p.jersey}`) ?? null,
          }))
          .sort((a, b) => JERSEY_TYPES.indexOf(a.jersey) - JERSEY_TYPES.indexOf(b.jersey)),
        grandTourTeam: gtTeam && gtTeam !== heartTeam ? gtTeam : null,
      };
    })
    .filter((c) => c.jerseys.length > 0 || c.grandTourTeam);

  return {
    ...view,
    pseudo: profile.pseudo ?? "?",
    defaultOpenStageId: pickDefaultOpenStageId(rankedStages),
    rank: rankIndex >= 0 ? rankIndex + 1 : null,
    points: rankIndex >= 0 ? leaderboard[rankIndex].points : 0,
    badges: badges.get(userId) ?? NO_BADGES,
    leader: rankIndex === 0 && leaderboard[0].points > 0,
    choices: {
      heartTeam,
      nation: favorite?.nation_code
        ? { code: favorite.nation_code, name: ((favorite.nations as any)?.name as string | undefined) ?? favorite.nation_code }
        : null,
      courses,
    },
  };
}

/** Détail d'une étape terminée dans la fiche d'un joueur : points de chaque choix, bonus et porteur d'eau. */
export interface PlayerRaceDetail {
  picks: { key: string; rank: number | null; name: string; nationCode: string; points: number | null }[];
  /** Lignes hors choix (Musette, malus, ×2, questions bonus…), chacune avec sa clé de traduction Home.* */
  extras: { labelKey: string; points: number }[];
  /** Porteur d'eau révélé sur cette étape. */
  pepite: { rank: number; name: string; nationCode: string; points: number } | null;
}

/**
 * Fiche d'un joueur (Classement) : détail de quelques étapes terminées, chargé à la demande
 * (variante « barres compactes » de Biathlonpronos, 26/11/2026). Seules les étapes terminées sont
 * lues : ses pronostics sur les autres restent cachés (migration 0018).
 */
export async function getPlayerRaceDetails(userId: string, raceIds: string[]): Promise<Record<string, PlayerRaceDetail>> {
  const supabase = createClient();
  const { now } = await getClock();
  const { data: races } = await supabase
    .from("races")
    .select("id")
    .in("id", raceIds.slice(0, 25))
    .eq("status", "finished")
    .lte("locks_at", now.toISOString());
  const results = await Promise.all(
    ((races ?? []) as { id: string }[]).map((r) => getRaceResult(supabase, r.id, userId, { withPlayerRank: false }))
  );
  const details: Record<string, PlayerRaceDetail> = {};
  for (const result of results) {
    if (!result?.prediction && !result?.pepite) continue;
    const prediction = result.prediction;
    const extras: PlayerRaceDetail["extras"] = [
      ...(prediction?.extras ?? []).map((e) => ({ labelKey: `lastResultExtra_${e.kind}`, points: e.points })),
      ...(prediction?.multiplier
        ? [{ labelKey: prediction.multiplier.kind === "bonusX2" ? "playerExtraBonusX2" : "playerExtraCoefficient", points: prediction.multiplier.gain }]
        : []),
      ...(prediction?.bonusQuestionPoints ? [{ labelKey: "playerExtraBonusQuestions", points: prediction.bonusQuestionPoints }] : []),
    ];
    details[result.raceId] = {
      picks: (prediction?.picks ?? []).map((p) => ({ key: p.key, rank: p.rank, name: p.name, nationCode: p.nationCode, points: p.points })),
      extras,
      pepite: result.pepite,
    };
  }
  return details;
}
