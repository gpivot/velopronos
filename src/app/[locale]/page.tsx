import { getLocale, getTranslations } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { BottomNav } from "@/components/BottomNav";
import { Landing } from "@/components/landing/Landing";
import { HeaderActions } from "@/components/HeaderActions";
import { ChevronRightIcon, LogoMark } from "@/components/icons";
import { getClock } from "@/lib/clock";
import { getLeaderboard, type LeaderboardRow } from "@/lib/leaderboard";
import { getPlayerBadges, type PlayerBadges } from "@/lib/playerBadges";
import { PlayerBadgesRow } from "@/components/PlayerBadgesRow";
import { nationFlagEmoji } from "@/lib/nationFlags";
import { getLastResults, type LastResult } from "@/lib/lastResult";
import { LastResultCard } from "@/components/LastResultCard";
import { getWeekStage, parisDay, type WeekStage } from "@/lib/weekStage";
import { NextStageCard, RestWeekCard, WeekStageCard, type NextStage } from "@/components/WeekStageCard";
import { getRaceResult } from "@/lib/lastResult";
import { isPredictionOpen, predictionOpensOn } from "@/lib/predictionWindow";
import { NextRaceCard, type NextRace } from "@/components/NextRaceCard";
import { StreakCard } from "@/components/StreakCard";
import { getCurrentStreak } from "@/lib/streakCounter";
import { getPlayerCards, type PlayerCards } from "@/lib/bonusCards";
import { getFavoriteTeamStats, type FavoriteTeamStats } from "@/lib/favoriteTeamStats";
import { fetchLiveQuestionInvites } from "@/lib/bonusQuestionActions";
import { LiveQuestionInviteCard } from "@/components/LiveQuestionInvite";

export const dynamic = "force-dynamic";

interface HomeData {
  season: { id: string; label: string } | null;
  userId: string | null;
  weekStage: WeekStage | null;
  /** Résultats des courses notées de l'étape de la semaine, par course. */
  weekResults: Record<string, LastResult>;
  /** « Maintenant » au rendu (horloge simulée comprise), point de départ du compte à rebours. */
  nowMs: number;
  nextRace: NextRace | null;
  leaderboard: LeaderboardRow[];
  /** Pictos des joueurs (⚡ ×2, 🍾 victoires, ❄️ Pépite), par joueur. */
  badges: Map<string, PlayerBadges>;
  favoriteTeam: { nation_code: string; sex: string; nations: { name: string } | null } | null;
  /** Étape suivant celle de la semaine (ou la prochaine à venir), encart « Prochaine étape ». */
  nextStage: NextStage | null;
  /** Victoires et podiums de l'équipe favorite cette saison. */
  favoriteTeamStats: FavoriteTeamStats | null;
  lastResults: LastResult[];
  streak: number | null;
  /** Avant la 1re course de la saison : nombre de pronostics de saison faits (6 globes + 2 Pépites), null ensuite. */
  seasonPicksBeforeStart: number | null;
  /** Pas encore d'équipe favorite et carte Équipe pas active : invitation à la choisir. */
  canChooseFavoriteTeam: boolean;
  cards: PlayerCards | null;
}

async function getHomeData(): Promise<HomeData> {
  const supabase = createClient();

  // Lancés ensemble : chaque lecture est un aller-retour vers Supabase.
  const [{ data: season }, { data: userResult }, { now }] = await Promise.all([
    supabase.from("seasons").select("id, label, starts_on").eq("status", "active").maybeSingle(),
    getAuthUser(),
    getClock(),
  ]);
  // Invité (session anonyme du bouton « Jouer ») : traité comme un visiteur, il voit la vitrine.
  const user = userResult.user && !userResult.user.is_anonymous ? userResult.user : null;

  // Invité « e-mail seulement » revenu par son code (migration 0045) : pas de tableau de bord avant
  // la fin de l'inscription, direction sa dernière course pronostiquée (score + invitation).
  if (user) {
    const { data: me } = await supabase.from("profiles").select("signup_pending").eq("id", user.id).maybeSingle();
    if ((me as { signup_pending?: boolean } | null)?.signup_pending) {
      const { data: last } = await supabase
        .from("predictions")
        .select("race_id")
        .eq("user_id", user.id)
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      redirect({ href: last ? `/courses/${last.race_id}` : "/jouer", locale: await getLocale() });
    }
  }

  if (!season) {
    return { season: null, userId: user?.id ?? null, weekStage: null, weekResults: {}, nowMs: Date.now(), nextRace: null, leaderboard: [], badges: new Map(), favoriteTeam: null, favoriteTeamStats: null, nextStage: null, lastResults: [], streak: null, seasonPicksBeforeStart: null, canChooseFavoriteTeam: false, cards: null };
  }

  const weekStage = user ? await getWeekStage(supabase, season.id, user.id, now) : null;
  const [{ data: upcomingRaces }, leaderboard, favoriteTeamResult, lastResults, streak, cards, weekResult, badges, { count: startedRaces }] = await Promise.all([
    supabase
      .from("races")
      .select("id, format, stage_number, sex, locks_at, stages!inner(location, country_code, season_id, starts_on)")
      .eq("stages.season_id", season.id)
      .eq("status", "upcoming")
      .gt("locks_at", now.toISOString())
      .order("locks_at", { ascending: true })
      .limit(1),
    getLeaderboard(supabase, season.id),
    user
      ? supabase
          .from("favorite_teams")
          .select("nation_code, sex, nations(name)")
          .eq("user_id", user.id)
          .eq("season_id", season.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    // « Derniers résultats » et « À suivre » seulement sans étape cette semaine : l'encadré de l'étape les remplace.
    user && !weekStage ? getLastResults(supabase, season.id, user.id, now) : Promise.resolve([]),
    user ? getCurrentStreak(supabase, season.id, user.id, now) : Promise.resolve(null),
    user ? getPlayerCards(supabase, season.id, user.id, now) : Promise.resolve(null),
    user && weekStage
      ? Promise.all(
          weekStage.races.filter((r) => r.displayStatus === "finished").map((r) => getRaceResult(supabase, r.id, user.id))
        )
      : Promise.resolve([]),
    getPlayerBadges(supabase, season.id),
    // La saison a commencé dès qu'une course est partie : la « Série en cours » remplace alors l'invitation aux pronostics de saison.
    supabase
      .from("races")
      .select("id, stages!inner(season_id)", { count: "exact", head: true })
      .eq("stages.season_id", season.id)
      .lte("locks_at", now.toISOString()),
  ]);
  const weekResults = Object.fromEntries(weekResult.filter((r): r is LastResult => r != null).map((r) => [r.raceId, r]));
  const nextRace = weekStage ? null : ((upcomingRaces ?? []) as any[])[0] ?? null;
  // VéloPronos : la ligne peut ne porter que l'équipe de cœur (0052) ; l'encadré suit la nation favorite.
  const favoriteRow = favoriteTeamResult.data as HomeData["favoriteTeam"] | { nation_code: null } | null;
  const favoriteTeam = favoriteRow?.nation_code ? (favoriteRow as HomeData["favoriteTeam"]) : null;

  // Lectures indépendantes les unes des autres : lancées en même temps plutôt qu'à la suite.
  const [seasonPicksBeforeStart, { data: nextStage }, canChooseFavoriteTeam, favoriteTeamStats, predicted] = await Promise.all([
    // VéloPronos : plus de pronostics de saison (globes, Pépite) à saisir avant le départ.
    Promise.resolve(null as number | null),
    supabase
      .from("stages")
      .select("id, name, kind, category, coefficient, location, country_code, starts_on, ends_on")
      .eq("season_id", season.id)
      .gt("starts_on", weekStage ? weekStage.endsOn : parisDay(now))
      .order("starts_on", { ascending: true })
      .limit(1)
      .maybeSingle(),
    Promise.resolve(!!user && !favoriteTeam),
    favoriteTeam
      ? getFavoriteTeamStats(supabase, season.id, { nationCode: favoriteTeam.nation_code, sex: favoriteTeam.sex })
      : Promise.resolve(null),
    user && nextRace
      ? supabase
          .from("predictions")
          .select("race_id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("race_id", nextRace.id)
          .then(({ count }) => (count ?? 0) > 0)
      : Promise.resolve(false),
  ]);

  return {
    season,
    userId: user?.id ?? null,
    weekStage,
    weekResults,
    nowMs: now.getTime(),
    nextRace: nextRace
      ? ({
          ...nextRace,
          predicted,
          opensOn: isPredictionOpen(nextRace.stages.starts_on, now) ? null : predictionOpensOn(nextRace.stages.starts_on),
        } as HomeData["nextRace"])
      : null,
    leaderboard,
    badges,
    favoriteTeam,
    favoriteTeamStats,
    nextStage: nextStage as NextStage | null,
    lastResults,
    streak,
    seasonPicksBeforeStart,
    canChooseFavoriteTeam,
    cards,
  };
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const [t, tSex, { season, userId, weekStage, weekResults, nowMs, nextRace, leaderboard, badges, favoriteTeam, favoriteTeamStats, nextStage, lastResults, streak, seasonPicksBeforeStart, canChooseFavoriteTeam, cards }, liveInvites] = await Promise.all([
    getTranslations("Home"),
    getTranslations("Sex"),
    getHomeData(),
    // Questions live ouvertes sans réponse du joueur : en tête de l'accueil (questions bonus).
    fetchLiveQuestionInvites(),
  ]);

  // Visiteur non connecté : page d'accueil vitrine façon VéloPronos.
  if (!userId) return <Landing />;

  const rankIndex = userId ? leaderboard.findIndex((row) => row.userId === userId) : -1;
  const rank = rankIndex >= 0 ? rankIndex + 1 : null;
  const points = rankIndex >= 0 ? leaderboard[rankIndex].points : 0;
  const top5 = leaderboard.slice(0, 5);
  const loggedInWithSeason = Boolean(season && userId);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <div className="flex flex-1 flex-col gap-6 overflow-auto px-5 pb-3 pt-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-ice">
              <LogoMark className="h-5 w-5" />
            </div>
            <div className="font-display text-base font-extrabold">
              <span className="text-frost">Vélo</span>
              <span className="text-ice">Pronos</span>
            </div>
          </div>
          <HeaderActions />
        </div>

        {liveInvites.map((invite) => (
          <LiveQuestionInviteCard key={invite.id} invite={invite} />
        ))}

        {loggedInWithSeason ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-gradient-to-br from-card2 to-card p-5">
            <div className="font-display text-[11px] font-bold uppercase tracking-wider text-gold">
              {t("seasonBadge", { label: season!.label })}
            </div>

            {canChooseFavoriteTeam && (
              <Link
                href="/coeur"
                className="flex items-center gap-3 rounded-xl border border-ice/40 bg-ice-soft px-3 py-2.5"
              >
                <span className="text-lg">❤️</span>
                <span className="flex flex-1 flex-col">
                  <span className="font-display text-[13px] font-bold text-ice">{t("favoriteTeamInvite")}</span>
                  <span className="text-[11px] text-text-dim">{t("favoriteTeamInviteHint")}</span>
                </span>
                <ChevronRightIcon className="h-4 w-4 flex-shrink-0 text-ice" />
              </Link>
            )}

            {favoriteTeam && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-[13px] text-text-dim">
                  <span className="text-[22px] leading-none">{nationFlagEmoji(favoriteTeam.nation_code)}</span>
                  {t("favoriteNationLabel")}
                  <span className="font-semibold text-frost">
                    {favoriteTeam.nations?.name ?? favoriteTeam.nation_code}
                  </span>
                </div>
                {favoriteTeamStats && (
                  <div className="flex items-center gap-3 pl-[30px] text-[12px] font-semibold text-frost">
                    <span>🏆 {t("favoriteTeamWins", { count: favoriteTeamStats.wins })}</span>
                    <span>🏅 {t("favoriteTeamPodiums", { count: favoriteTeamStats.podiums })}</span>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-end justify-between pt-1">
              <div>
                <div className="flex items-center gap-2">
                  <div className="font-display text-2xl font-extrabold text-frost">{rank ? `#${rank}` : "–"}</div>
                  <PlayerBadgesRow badges={badges.get(userId)} leader={rank === 1 && points > 0} />
                </div>
                <div className="text-xs text-text-dim">{t("rankLabel")}</div>
              </div>
              <div className="text-right">
                <div className="font-display text-2xl font-extrabold text-ice">{points} pts</div>
                <div className="text-xs text-text-dim">{t("pointsLabel")}</div>
              </div>
            </div>

            <div className="flex gap-2.5 pt-1">
              <Link
                href="/classement"
                className="flex-1 rounded-full bg-ice py-2.5 text-center font-display text-[13px] font-bold text-on-ice"
              >
                {t("standingsButton")}
              </Link>
              <Link
                href="/courses"
                className="flex-1 rounded-full border border-border bg-card py-2.5 text-center font-display text-[13px] font-bold text-frost"
              >
                {t("mySeasonButton")}
              </Link>
            </div>

            {streak != null && (
              <StreakCard current={streak} compact cards={cards ?? undefined} seasonId={season?.id} autoOpenClaim />
            )}
          </div>
        ) : (
          <div className="flex gap-2.5">
            <Link
              href="/regles"
              className="flex-1 rounded-full bg-ice py-2.5 text-center font-display text-[13px] font-bold text-on-ice"
            >
              {t("rulesButton")}
            </Link>
            <Link
              href="/ligues"
              className="flex-1 rounded-full border border-border bg-card py-2.5 text-center font-display text-[13px] font-bold text-frost"
            >
              {t("challengeButton")}
            </Link>
          </div>
        )}

        {weekStage ? (
          <WeekStageCard stage={weekStage} results={weekResults} nowMs={nowMs} locale={locale} />
        ) : (
          season && <RestWeekCard />
        )}

        {nextStage && <NextStageCard stage={nextStage} locale={locale} />}

        {nextRace && <NextRaceCard race={nextRace} nowMs={nowMs} locale={locale} />}

        {!season && (
          <div className="rounded-2xl border border-dashed border-border p-5 text-[13px] text-text-dim">
            {t("emptyState")}
          </div>
        )}

        <Link
          href="/courses"
          className="rounded-xl border border-border bg-card py-2.5 text-center text-[13px] font-semibold text-text-dim"
        >
          {t("seeFullCalendar")}
        </Link>

        {lastResults.length > 0 && <LastResultCard results={lastResults} locale={locale} />}

        {top5.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="font-display text-xs font-bold uppercase tracking-wider text-text-dim">
              {t("standingsPreviewTitle")}
            </div>
            <div className="flex flex-col gap-2">
              {top5.map((row, index) => (
                <div
                  key={row.userId}
                  className="flex items-center gap-3.5 rounded-2xl border border-border bg-card px-4 py-3"
                >
                  <div
                    className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full font-display text-xs font-bold ${
                      index === 0 ? "bg-gold-soft text-gold" : "bg-ice-soft text-ice"
                    }`}
                  >
                    {index + 1}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <span className="max-w-full truncate text-sm font-semibold">{row.pseudo}</span>
                    <PlayerBadgesRow badges={badges.get(row.userId)} leader={index === 0 && row.points > 0} />
                  </div>
                  <div className="whitespace-nowrap font-display text-sm font-bold text-ice">{row.points} pts</div>
                </div>
              ))}
            </div>
            <Link
              href="/classement"
              className="rounded-xl border border-border bg-card py-2.5 text-center text-[13px] font-semibold text-text-dim"
            >
              {t("seeFullStandings")}
            </Link>
          </div>
        )}
      </div>

      <BottomNav active="/" />
    </div>
  );
}
