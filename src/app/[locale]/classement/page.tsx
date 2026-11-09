import { getTranslations } from "next-intl/server";
import { raceTitle } from "@/lib/raceLabel";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { BottomNav } from "@/components/BottomNav";
import { Link } from "@/i18n/navigation";
import { HeaderActions } from "@/components/HeaderActions";
import { ArrowLeftIcon } from "@/components/icons";
import { getClock } from "@/lib/clock";
import { getLeaderboard, getPlayerRetainedCourses } from "@/lib/leaderboard";
import { RetainedCoursesCard } from "@/components/RetainedCoursesCard";
import { badgesInCourse, getPlayerBadges, type PlayerBadges } from "@/lib/playerBadges";
import { HelpButton } from "@/components/HelpButton";
import { LeaderBib, PlayerBadgesRow, StageLeaderBib } from "@/components/PlayerBadgesRow";
import { nationFlagEmoji } from "@/lib/nationFlags";
import {
  buildStandings,
  getLeagueMembers,
  getRacesStandings,
  getStandingsStages,
  isStageOngoing,
  pickDefaultStandingsStageId,
  type StandingsRow,
} from "@/lib/standings";
import { PlayerSeasonButton } from "./PlayerSeasonButton";
import { StandingsFilters, type StandingsFilterOptions, type StandingsFilterState } from "./StandingsFilters";
import { seasonHasFinishedRace } from "@/lib/streakCounter";
import { getCardCourse } from "@/lib/bonusCards";

export const dynamic = "force-dynamic";

/**
 * Séries en cours de tous les joueurs dans la course par étapes en cours (VéloPronos, 0051), 0
 * compris (série retombée) : rien avant la 1re course notée (cf. getCurrentStreak).
 */
async function getCurrentStreaks(supabase: ReturnType<typeof createClient>, seasonId: string, now: Date): Promise<Map<string, number>> {
  if (!(await seasonHasFinishedRace(supabase, seasonId))) return new Map();
  const course = await getCardCourse(supabase, seasonId, now);
  if (!course) return new Map();
  const { data } = await supabase
    .from("streak_counters")
    .select("user_id, current_streak")
    .eq("stage_id", course.id);
  return new Map((data ?? []).map((s: any) => [s.user_id as string, Number(s.current_streak)]));
}

type SearchParams = { portee?: string; ligue?: string; periode?: string; etape?: string; course?: string };

export default async function ClassementPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const query = await searchParams;
  const [t, tFormat, tSex, tBadges, tHome] = await Promise.all([
    getTranslations("Classement"),
    getTranslations("RaceFormat"),
    getTranslations("Sex"),
    getTranslations("Badges"),
    getTranslations("Home"),
  ]);
  const tRace = await getTranslations("Race");
  const raceLabel = (race: { format: string; stage_number?: number | null }) => raceTitle(race, tFormat, tRace);

  const supabase = createClient();
  const [{ data: season }, { data: userResult }] = await Promise.all([
    supabase.from("seasons").select("id").eq("status", "active").maybeSingle(),
    getAuthUser(),
  ]);
  const userId = userResult.user?.id ?? null;
  const { now } = await getClock();

  const [stages, leagueRows, leaderboard, seasonBadges, retained] = await Promise.all([
    season ? getStandingsStages(supabase, season.id, now) : Promise.resolve([]),
    season && userId
      ? supabase.from("league_memberships").select("leagues!inner(id, name, season_id)").eq("user_id", userId).eq("leagues.season_id", season.id)
      : Promise.resolve({ data: [] as any[] }),
    // Classement général de la saison : sert à l'encadré « Mon classement » et à la vue Saison.
    season ? getLeaderboard(supabase, season.id) : Promise.resolve([]),
    season ? getPlayerBadges(supabase, season.id) : Promise.resolve(new Map<string, PlayerBadges>()),
    season && userId ? getPlayerRetainedCourses(supabase, season.id, userId) : Promise.resolve(null),
  ]);
  // « Mon classement » : même calcul que l'encadré de l'accueil (rang général de la saison).
  const myRankIndex = userId ? leaderboard.findIndex((row) => row.userId === userId) : -1;
  const myRank = myRankIndex >= 0 ? myRankIndex + 1 : null;
  const myPoints = myRankIndex >= 0 ? leaderboard[myRankIndex].points : 0;
  const leagues = ((leagueRows.data ?? []) as any[])
    .map((m) => m.leagues)
    .filter(Boolean)
    .map((l: any) => ({ id: l.id as string, name: l.name as string }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Filtres demandés dans l'URL, ramenés à des valeurs valides.
  const scope: StandingsFilterState["scope"] = query.portee === "ligue" ? "league" : "general";
  const leagueId = scope === "league" ? leagues.find((l) => l.id === query.ligue)?.id ?? leagues[0]?.id ?? null : null;
  const period: StandingsFilterState["period"] = query.periode === "etapes" ? "stages" : "season";
  const stage = period === "stages" ? stages.find((s) => s.id === query.etape) ?? stages.find((s) => s.id === pickDefaultStandingsStageId(stages)) ?? null : null;
  const race = stage?.races.find((r) => r.id === query.course) ?? null;
  // Porteur d'eau révélé : picto seulement dans le classement de son Grand Tour.
  const badges = badgesInCourse(seasonBadges, stage && !race ? stage.id : null);
  const state: StandingsFilterState = { scope, leagueId, period, stageId: stage?.id ?? null, raceId: race?.id ?? null };
  const options: StandingsFilterOptions = {
    leagues,
    stages: stages.map((s) => ({
      id: s.id,
      label: `${nationFlagEmoji(s.country_code)} ${s.location}${s.countsInStandings === false ? ` (×0 · ${tHome("offStandingsBadge")})` : ""}`,
      races: s.races.map((r) => ({ id: r.id, label: raceLabel(r) })),
    })),
  };

  const noLeague = scope === "league" && !leagueId;
  let rows: StandingsRow[] = [];
  let showPicks = false;
  let streaks = new Map<string, number>();
  let ongoingStageLeaders = new Set<string>();
  if (season && !noLeague) {
    const members = leagueId ? await getLeagueMembers(supabase, leagueId) : null;
    if (period === "season") {
      // Dossard rouge sur le classement Saison : le(s) leader(s) de l'étape en cours.
      // Une étape hors classement (×0) ne donne pas de dossard rouge.
      const ongoingStage = stages.find((s) => s.countsInStandings !== false && isStageOngoing(s));
      const [currentStreaks, ongoingRows] = await Promise.all([
        getCurrentStreaks(supabase, season.id, now),
        ongoingStage ? getRacesStandings(supabase, ongoingStage.races, null, false, ongoingStage.id) : Promise.resolve([]),
      ]);
      streaks = currentStreaks;
      ongoingStageLeaders = new Set(ongoingRows.filter((r) => r.rank === 1 && r.points > 0).map((r) => r.userId));
      rows = buildStandings(leaderboard, members, null);
    } else if (stage) {
      // Pronostics affichés (une ligne sous le pseudo) seulement pour une course choisie et déjà partie ;
      // sur l'étape entière, ils restent dans le pop-up du joueur pour garder des lignes compactes.
      showPicks = Boolean(race && race.displayStatus !== "upcoming");
      rows = await getRacesStandings(supabase, race ? [race] : stage.races, members, showPicks, race ? null : stage.id);
    }
  }

  const emptyMessage = period === "season" ? t("emptyState") : stage ? t("emptyStage") : t("noStages");

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <div className="flex flex-1 flex-col gap-4 overflow-auto px-5 pb-3 pt-6">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-border bg-card text-text-dim"
          >
            <ArrowLeftIcon className="h-4 w-4" />
          </Link>
          <div className="font-display text-lg font-bold">{t("title")}</div>
          <HelpButton
            title={tBadges("helpTitle")}
            openLabel={tBadges("helpTitle")}
            closeLabel={t("close")}
            items={[
              { icon: <LeaderBib className="h-5 w-5" />, text: tBadges("helpLeader") },
              { icon: <StageLeaderBib className="h-5 w-5" />, text: tBadges("helpStageLeader") },
              { icon: "🔥", text: tBadges("helpStreak") },
              { icon: "⚡", text: tBadges("helpX2") },
              { icon: "🍾", text: tBadges("helpWins") },
              { icon: "⭐", text: tBadges("helpPerfect") },
              { icon: "❄️", text: tBadges("helpPepite") },
            ]}
          />
          <HeaderActions />
        </div>

        {season && userId && (
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-gradient-to-br from-card2 to-card p-5">
            <div className="font-display text-[11px] font-bold uppercase tracking-wider text-gold">{t("myRankingTitle")}</div>
            <div className="flex items-end justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <div className="font-display text-2xl font-extrabold text-frost">{myRank ? `#${myRank}` : "–"}</div>
                  <PlayerBadgesRow badges={badges.get(userId)} leader={myRank === 1 && myPoints > 0} />
                </div>
                <div className="text-xs text-text-dim">{tHome("rankLabel")}</div>
              </div>
              <div className="text-right">
                <div className="font-display text-2xl font-extrabold text-ice">{myPoints} pts</div>
                <div className="text-xs text-text-dim">{tHome("pointsLabel")}</div>
              </div>
            </div>
            {retained && <RetainedCoursesCard courses={retained.courses} droppedPoints={retained.droppedPoints} />}
          </div>
        )}

        <StandingsFilters state={state} options={options} />

        {noLeague ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-border p-5 text-[13px] text-text-dim">
            {t("noLeague")}
            <Link
              href="/ligues"
              className="self-start rounded-full bg-ice px-4 py-2 font-display text-[13px] font-bold text-on-ice"
            >
              {t("noLeagueButton")}
            </Link>
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-5 text-[13px] text-text-dim">{emptyMessage}</div>
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((row) => (
              <PlayerSeasonButton
                key={row.userId}
                userId={row.userId}
                stage={
                  period === "stages" && stage
                    ? { stageId: stage.id, rank: row.rank, points: row.points, leader: !race && stage.countsInStandings !== false && row.rank === 1 && row.points > 0, singleRace: !!race }
                    : null
                }
                className={`flex items-center gap-3.5 rounded-2xl border px-4 py-3.5 ${
                  row.userId === userId ? "border-ice/60 bg-ice-soft" : "border-border bg-card"
                }`}
              >
                <div
                  className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full font-display text-sm font-bold ${
                    row.rank === 1 ? "bg-gold-soft text-gold" : "bg-ice-soft text-ice"
                  }`}
                >
                  {row.rank}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <span className="max-w-full truncate text-sm font-semibold">{row.pseudo}</span>
                    {/* Dossard jaune réservé à la saison ; sur une étape entière, son leader porte le rouge. */}
                    <PlayerBadgesRow
                      badges={badges.get(row.userId)}
                      leader={period === "season" && row.rank === 1 && row.points > 0}
                      stageLeader={
                        period === "stages"
                          ? !race && stage?.countsInStandings !== false && row.rank === 1 && row.points > 0
                          : ongoingStageLeaders.has(row.userId)
                      }
                      streak={period === "season" ? streaks.get(row.userId) ?? null : null}
                    />
                  </div>
                  {showPicks &&
                    (row.picks && row.picks.length > 0 ? (
                      row.picks.map((pick) => (
                        <div key={pick.raceId} className="truncate text-xs leading-snug text-frost">
                          {pick.names}
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-text-dim">{t("noPicks")}</div>
                    ))}
                </div>
                <div className="whitespace-nowrap font-display text-sm font-bold text-ice">{row.points} pts</div>
              </PlayerSeasonButton>
            ))}
          </div>
        )}
      </div>

      <BottomNav active="/classement" />
    </div>
  );
}
