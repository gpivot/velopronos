import { fullAthleteName } from "@/lib/athleteName";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { BottomNav } from "@/components/BottomNav";
import { ChevronLeftIcon, ChevronRightIcon, ClockIcon } from "@/components/icons";
import { Link } from "@/i18n/navigation";
import { getRaceDisplayStatus } from "@/lib/raceStatus";
import { getAdminProfile, getClock } from "@/lib/clock";
import { isLateJokerWindowOpen } from "@/lib/velo/lateJoker";
import { nationFlagEmoji } from "@/lib/nationFlags";
import { PredictionForm, type AthleteWithOdds } from "./PredictionForm";
import { RelayPredictionForm, type NationWithOdds } from "./RelayPredictionForm";
import { TeamPredictionForm, type TeamWithOdds } from "./TeamPredictionForm";
import { GrilladeButton } from "./GrilladeButton";
import { RuleInfoButton } from "./RuleInfoButton";
import { DISPLAY_TIME_ZONE } from "@/lib/displayTimeZone";
import { raceTitle, stageRoute } from "@/lib/raceLabel";
import { RELAY_FORMATS, previousRaceForGrilling } from "@/lib/grilling";
import { getRaceResult } from "@/lib/lastResult";
import { getStartList } from "@/lib/startList";
import { isPredictionOpen, predictionOpensOn } from "@/lib/predictionWindow";
import { RaceCountdown } from "./RaceCountdown";
import { RaceOpinion } from "./RaceOpinion";
import { getOngoingBoard, getRacePlayers } from "@/lib/racePlayers";
import { BackButton } from "@/components/BackButton";
import { OngoingBoardRowView, PlayerRow, ResultRow } from "./RaceRankingRows";
import { ShowMore } from "@/components/ShowMore";
import { MALUS_SCALE, SPECIAL_RULE_ICONS, isBonusRule } from "@/lib/specialRules";
import { canPlayCard, cardsOnRace, getSeasonCardRaces, type CardRow } from "@/lib/bonusCards";
import { PredictionBreakdown, formatPoints } from "@/components/PredictionBreakdown";
import { PepiteReveal } from "@/components/PepiteReveal";
import { HelpButton } from "@/components/HelpButton";
import { BonusPointsBadge, BonusQuestions } from "@/components/BonusQuestions";
import { getRaceBonusQuestions } from "@/lib/bonusQuestions";

/** VéloPronos : un bonus ×2 personnel par course par étapes (passation, décision du 01/11/2026). */
const X2_PER_COURSE = 1;

export const dynamic = "force-dynamic";

export default async function RacePage({
  params,
}: {
  params: Promise<{ locale: string; raceId: string }>;
}) {
  const { locale, raceId } = await params;
  const supabase = createClient();
  // Lancés ensemble : chaque lecture Supabase est un aller-retour réseau.
  const [t, tFormat, tSex, tClassement, { data: race }, { now }, { data: authData }, adminProfile] = await Promise.all([
    getTranslations("Race"),
    getTranslations("RaceFormat"),
    getTranslations("Sex"),
    getTranslations("Classement"),
    supabase.from("races").select("*, stages(*)").eq("id", raceId).single(),
    getClock(),
    getAuthUser(),
    getAdminProfile(),
  ]);

  if (!race) notFound();

  const stage = race.stages as {
    id: string;
    location: string;
    country_code: string;
    season_id: string;
    coefficient: 1 | 2;
    /** false : étape « Autre (×0) », hors classement de la saison (migration 0041). */
    counts_in_standings?: boolean;
    starts_on: string;
    kind?: string | null;
  };
  const offStandings = stage.counts_in_standings === false;
  const isRelay = RELAY_FORMATS.includes(race.format);
  // CLM par équipes (VéloPronos) : 3 équipes, predictions.team_ids.
  const isTeamRace = race.format === "clm_equipes";
  const displayStatus = getRaceDisplayStatus(race, now);

  const user = authData.user;
  const isAdmin = adminProfile.isAdmin;

  let athletesWithOdds: AthleteWithOdds[] = [];
  let nationsWithOdds: NationWithOdds[] = [];
  let initialAthleteSelection: string[] = [];
  let initialNationSelection: string | null = null;
  let teamsWithOdds: TeamWithOdds[] = [];
  let initialTeamSelection: string[] = [];
  // Pépites cachées pas encore révélées : jouées en caché sur toutes les courses, donc hors pronostic.
  let grilledAthleteIds: string[] = [];
  let hiddenPepiteIds: string[] = [];
  let availableCards: { id: string; card_type: string }[] = [];
  // Cartes jouables sur cette course (une seule à la fois) et carte déjà jouée qui la couvre.
  let playableCards: { id: string; card_type: string }[] = [];
  let activeCard: "ca_farte" | "aspiration" | null = null;
  let quatriemeChoixActive = false;
  // Cartes Fusée / Gâchette posées sur l'étape de cette course.
  let stageCards: ("fusee" | "gachette")[] = [];
  let initialBonusX2 = false;
  let initialCardTarget: string | null = null;

  // §7 — bonus ×2 personnel : 3 fois par saison, jamais sur une course
  // spéciale ni sur une étape Mondiaux/JO (déjà comptée double), ni hors classement (×0).
  // VéloPronos : un ×2 perso par course par étapes (Grand Tour ou course par étapes), aucun sur une
  // classique (les monuments et les Mondiaux comptent déjà ×2).
  const isStageRaceCourse = stage.kind === "stage_race" || stage.kind === "grand_tour";
  const x2Eligible = isStageRaceCourse && !race.special_rule && stage.coefficient !== 2 && !offStandings;
  // Fête nationale : course bonus, encadré doré au lieu du rouge des malus.
  const bonusRule = isBonusRule(race.special_rule);
  let x2UsesRemaining = 0;
  // Joker retardataire (VéloPronos, migration 0050) : étapes de la course où il a été posé.
  let lateJokerRaceIds: string[] = [];

  if (user) {
    const [{ data: cards }, { count: x2UsedCount }, seasonRaces, { data: lateJokers }] = await Promise.all([
      supabase
        .from("bonus_cards")
        .select("id, card_type, status, used_on_race_id, used_on_stage_id, course_id")
        .eq("user_id", user.id)
        .eq("season_id", stage.season_id),
      // ×2 déjà joués sur les étapes de la même course (celle-ci comprise, comme le comptent les formulaires).
      supabase
        .from("predictions")
        .select("id, races!inner(stage_id)", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("bonus_x2_used", true)
        .eq("races.stage_id", stage.id),
      getSeasonCardRaces(supabase, stage.season_id),
      supabase
        .from("predictions")
        .select("race_id, races!inner(stage_id)")
        .eq("user_id", user.id)
        .eq("late_joker", true)
        .eq("races.stage_id", stage.id),
    ]);
    lateJokerRaceIds = ((lateJokers ?? []) as any[]).map((p) => p.race_id as string);
    const cardRows = (cards ?? []) as CardRow[];
    // VéloPronos : seules les cartes gagnées dans cette course s'y jouent (migration 0051).
    availableCards = cardRows.filter((c) => c.status === "available" && c.course_id === stage.id);
    const onRace = cardsOnRace(race.id, cardRows, seasonRaces);
    activeCard = onRace.caFarte ? "ca_farte" : onRace.aspiration ? "aspiration" : null;
    // Aspiration déjà posée l'emporte sur un 4e choix arrivé ensuite (voir resolvePredictionCard).
    quatriemeChoixActive = !!onRace.quatriemeChoix && !onRace.aspiration;
    stageCards = [...(onRace.fusee ? (["fusee"] as const) : []), ...(onRace.gachette ? (["gachette"] as const) : [])];
    // Le 4e choix et Équipe s'activent tout seuls quand ils sont choisis : seuls Ça farte et
    // Aspiration se jouent ici.
    playableCards = availableCards.filter(
      (c) => (c.card_type === "ca_farte" || c.card_type === "aspiration") && canPlayCard(c.card_type, race.id, cardRows, seasonRaces)
    );
    x2UsesRemaining = Math.max(0, X2_PER_COURSE - (x2UsedCount ?? 0));
  }

  if (isTeamRace) {
    const { data: odds } = await supabase
      .from("odds")
      .select("team_id, value, teams(code, name, nation_code)")
      .eq("stage_id", race.stage_id)
      .eq("format", race.format)
      .is("valid_until", null)
      .not("team_id", "is", null);
    teamsWithOdds = (odds ?? [])
      .map((o: any) => ({ team_id: o.team_id, code: o.teams?.code ?? "", name: o.teams?.name ?? o.team_id, nation_code: o.teams?.nation_code ?? null, value: o.value }))
      .sort((a: TeamWithOdds, b: TeamWithOdds) => a.value - b.value || a.name.localeCompare(b.name));
    if (user) {
      const { data: existing } = await supabase
        .from("predictions")
        .select("team_ids, bonus_x2_used")
        .eq("user_id", user.id)
        .eq("race_id", race.id)
        .maybeSingle();
      initialTeamSelection = existing?.team_ids ?? [];
      initialBonusX2 = existing?.bonus_x2_used ?? false;
    }
  } else if (isRelay) {
    const { data: odds } = await supabase
      .from("odds")
      .select("nation_code, value, nations(name)")
      .eq("season_id", stage.season_id)
      .eq("stage_id", race.stage_id) // cotes propres à la course (VéloPronos, 0045)
      .eq("format", race.format)
      .is("valid_until", null);

    nationsWithOdds = (odds ?? [])
      .map((o: any) => ({ nation_code: o.nation_code, name: o.nations?.name ?? o.nation_code, value: o.value }))
      .sort((a: NationWithOdds, b: NationWithOdds) => a.value - b.value);

    if (user) {
      const { data: existing } = await supabase
        .from("predictions")
        .select("nation_code, bonus_x2_used")
        .eq("user_id", user.id)
        .eq("race_id", race.id)
        .maybeSingle();
      initialNationSelection = existing?.nation_code ?? null;
      initialBonusX2 = existing?.bonus_x2_used ?? false;
    }
  } else {
    const { data: odds } = await supabase
      .from("odds")
      .select("athlete_id, value, athletes(first_name, last_name, nation_code, sex)")
      .eq("season_id", stage.season_id)
      .eq("stage_id", race.stage_id) // cotes propres à la course (VéloPronos, 0045)
      .eq("format", race.format)
      .is("valid_until", null);

    athletesWithOdds = (odds ?? [])
      .filter((o: any) => !race.sex || o.athletes?.sex === race.sex)
      .map((o: any) => ({
        athlete_id: o.athlete_id,
        first_name: o.athletes?.first_name ?? "",
        last_name: o.athletes?.last_name ?? "",
        nation_code: o.athletes?.nation_code ?? "",
        value: o.value,
      }))
      .sort((a: AthleteWithOdds, b: AthleteWithOdds) => a.value - b.value);

    if (user) {
      const [{ data: existing }, { data: stageRaces }, { count: grilladeOnThisRace }, { data: hiddenPepites }] = await Promise.all([
        supabase
          .from("predictions")
          .select("athlete_ids, bonus_x2_used, bonus_card_used, bonus_card_target_athlete_id")
          .eq("user_id", user.id)
          .eq("race_id", race.id)
          .maybeSingle(),
        supabase.from("races").select("id, format, sex, locks_at").eq("stage_id", stage.id),
        // Carte Grillade : valeur « fondue » de l'enum bonus_card_type (nom repris de Biathlonpronos).
        supabase
          .from("bonus_cards")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("card_type", "fondue")
          .eq("status", "used")
          .eq("used_on_race_id", race.id),
        supabase
          .from("pepites")
          .select("athlete_id")
          .eq("user_id", user.id)
          .eq("stage_id", stage.id)
          .eq("bonus_claimed", false),
      ]);
      hiddenPepiteIds = (hiddenPepites ?? []).map((p) => p.athlete_id as string);
      initialAthleteSelection = existing?.athlete_ids ?? [];

      // Coureurs grillés = coureurs choisis sur la course précédente de l'étape (même sexe), sauf si
      // la carte Grillade a été jouée sur cette course. Calculé à partir des pronostics : le
      // pronostic de la course affichée ne grille donc jamais ses propres choix, et il reste
      // modifiable. (Repris du commit 91420f9 de Biathlonpronos ; adaptation vélo à faire : le
      // grillage ne joue qu'à l'intérieur d'une course par étapes.)
      const previousRace = previousRaceForGrilling(race, stageRaces ?? []);
      if (previousRace && !grilladeOnThisRace) {
        const { data: previousPrediction } = await supabase
          .from("predictions")
          .select("athlete_ids")
          .eq("user_id", user.id)
          .eq("race_id", previousRace.id)
          .maybeSingle();
        grilledAthleteIds = previousPrediction?.athlete_ids ?? [];
      }
      initialBonusX2 = existing?.bonus_x2_used ?? false;
      initialCardTarget = existing?.bonus_card_target_athlete_id ?? null;
    }
  }

  // Poursuite / mass start : seuls les qualifiés prennent le départ, dans l'ordre de la liste.
  // Lectures indépendantes les unes des autres : lancées en même temps plutôt qu'à la suite.
  const [startList, raceResult, players, ongoingBoard, bonusQuestions, { data: seasonRaces }] = await Promise.all([
    displayStatus === "upcoming" ? getStartList(supabase, race) : Promise.resolve({ status: "open" as const }),
    // Course notée : pronostic détaillé (place et points par choix) et classement avec les points du barème.
    displayStatus === "finished" ? getRaceResult(supabase, race.id, user?.id ?? null) : Promise.resolve(null),
    displayStatus === "finished" ? getRacePlayers(supabase, race.id) : Promise.resolve([]),
    displayStatus === "ongoing" ? getOngoingBoard(supabase, stage.season_id, race.id) : Promise.resolve([]),
    // Questions bonus (avant le départ ou live) et points qu'elles ont rapportés au joueur.
    getRaceBonusQuestions(supabase, race, user?.id ?? null, now),
    // Courses précédente et suivante de la saison (ordre chronologique), boutons de l'en-tête.
    supabase
      .from("races")
      .select("id, locks_at, stages!inner(season_id)")
      .eq("stages.season_id", stage.season_id)
      .order("locks_at", { ascending: true }),
  ]);
  const startOrder: Record<string, number> = startList.status === "known" ? startList.order : {};
  const startGaps: Record<string, number> = startList.status === "known" ? startList.gaps : {};
  const startListPending = startList.status === "pending";
  // Filtre seulement la liste du formulaire : l'affichage « en cours » garde toutes les cotes.
  const selectableAthletes =
    startList.status === "known" ? athletesWithOdds.filter((a) => startOrder[a.athlete_id] != null) : athletesWithOdds;

  const hasOdds = isTeamRace ? teamsWithOdds.length > 0 : isRelay ? nationsWithOdds.length > 0 : athletesWithOdds.length > 0;
  // Liste des coureurs visible à partir du lundi 17 h de la semaine de course (predictionWindow.ts).
  const predictionsOpen = isPredictionOpen(stage.starts_on, now);
  const showForm = displayStatus === "upcoming" && hasOdds && !startListPending && predictionsOpen;
  // « L'avis de Biathlonpronos » saisi dans le back-office ; rubrique masquée s'il est vide.
  const opinion = typeof race.opinion === "string" ? race.opinion.trim() : "";
  const hasPrediction = isTeamRace ? initialTeamSelection.length > 0 : isRelay ? Boolean(initialNationSelection) : initialAthleteSelection.length > 0;
  // Joker retardataire : une étape oubliée, jusqu'à 1 h après le départ, un par course.
  const isLateJokerPrediction = lateJokerRaceIds.includes(race.id);
  const lateJokerOpen =
    !!user &&
    !user.is_anonymous &&
    displayStatus === "ongoing" &&
    !isRelay &&
    isLateJokerWindowOpen(race.locks_at, race.status, now) &&
    (hasPrediction ? isLateJokerPrediction : lateJokerRaceIds.length === 0);

  const results = raceResult?.results ?? [];
  const resultsTopCount = isRelay ? 5 : 10;
  const multiplier = raceResult?.prediction?.multiplier ?? null;
  // Après la course : un joueur qui a pronostiqué mais n'est dans aucune ligue est invité à se
  // comparer aux autres et à rejoindre (ou créer) une ligue (parcours d'invité, 01/11/2026).
  let compareInvite = false;
  if (displayStatus === "finished" && user && !user.is_anonymous && raceResult?.prediction) {
    const { count } = await supabase.from("league_memberships").select("league_id", { count: "exact", head: true }).eq("user_id", user.id);
    compareInvite = (count ?? 0) === 0;
  }
  const realNowMs = Date.now();
  const bonusRemainingMs = Object.fromEntries(
    bonusQuestions.filter((q) => q.kind === "live" && q.state === "open").map((q) => [q.id, Math.max(0, new Date(q.closesAt).getTime() - realNowMs)])
  );
  let myBonusPoints = 0;
  if (user && bonusQuestions.some((q) => q.myAnswer !== null)) {
    const { data: bonusLedger } = await supabase
      .from("score_ledger")
      .select("points")
      .eq("user_id", user.id)
      .in(
        "bonus_question_id",
        bonusQuestions.map((q) => q.id)
      );
    myBonusPoints = (bonusLedger ?? []).reduce((sum: number, row: any) => sum + Number(row.points), 0);
  }
  // Avant le départ : seulement les questions « avant le départ », une fois les pronostics ouverts.
  // Total de la course : pronostic + questions bonus (déjà additionnés par getRaceResult).
  // Sans pronostic, la révélation de la Pépite cachée rapporte quand même ses points.
  const pointsEarned = raceResult?.prediction?.points ?? (raceResult?.pepite?.points ?? 0) + myBonusPoints;

  const visibleBonusQuestions =
    displayStatus === "upcoming" ? (predictionsOpen ? bonusQuestions.filter((q) => q.kind === "pre_race") : []) : bonusQuestions;
  const bonusQuestionsBlock = (
    <BonusQuestions questions={visibleBonusQuestions} remainingMs={bonusRemainingMs} signedIn={Boolean(user && !user.is_anonymous)} />
  );

  const raceIndex = (seasonRaces ?? []).findIndex((r: any) => r.id === race.id);
  const previousRaceId = raceIndex > 0 ? seasonRaces![raceIndex - 1].id : null;
  const nextRaceId = raceIndex >= 0 && raceIndex < (seasonRaces ?? []).length - 1 ? seasonRaces![raceIndex + 1].id : null;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <div className="flex flex-1 flex-col gap-5 overflow-auto px-5 pb-3 pt-5">
        <div className="flex items-center gap-3">
          <BackButton fallback="/courses" label={t("backToCalendar")} />
          {/* Le nom de la course est dans l'encadré ci-dessous ; au milieu, navigation entre les courses. */}
          <div className="flex flex-1 justify-center gap-2">
            <RaceNavLink raceId={previousRaceId} label={t("previousRace")} direction="previous" />
            <RaceNavLink raceId={nextRaceId} label={t("nextRace")} direction="next" />
          </div>
          {/* Avec un formulaire, le « ? » est à côté de « Choisis… » ; sinon il reste ici. */}
          {showForm ? <div className="h-8 w-8 flex-shrink-0" /> : <RuleInfoButton format={race.format} />}
        </div>

        {/* Avant le départ : temps restant pour pronostiquer, jusqu'au verrouillage. */}
        {displayStatus === "upcoming" && <RaceCountdown target={race.locks_at} serverNow={now.getTime()} />}

        {/* Course malus : contour rouge autour de l'encadré, avec le nom du malus et son « ? ». */}
        <div
          className={`flex flex-col gap-3 rounded-[18px] border px-4 py-4 ${
            race.special_rule
              ? bonusRule
                ? "border-gold/70 bg-gradient-to-br from-gold/15 to-card"
                : "border-red/70 bg-gradient-to-br from-red/15 to-card"
              : "border-border bg-gradient-to-br from-card2 to-card"
          }`}
        >
          <div className="flex items-center gap-2 font-display text-[13px] font-bold text-ice">
            <ClockIcon className="h-4 w-4" />
            {displayStatus === "upcoming"
              ? t("lockLabel", {
                  date: new Date(race.locks_at).toLocaleString(locale, { timeZone: DISPLAY_TIME_ZONE,
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                })
              : t(`status_${displayStatus}`)}
          </div>
          <div className="flex items-center gap-2 font-display text-base font-bold">
            <span>{nationFlagEmoji(stage.country_code)}</span>
            <span>{stage.location}</span>
          </div>
          <div className="text-sm font-semibold text-frost">{raceTitle(race, tFormat, t)}</div>
          {stageRoute(race) && (
            <div className="text-xs text-text-dim">
              {stageRoute(race)}
              {race.elevation_m ? ` · D+ ${race.elevation_m} m` : ""}
            </div>
          )}
          {offStandings && (
            // Étape « Autre (×0) » : course test ou de recrutement, hors classement de la saison.
            <div className="flex items-center gap-3 rounded-2xl border border-dashed border-text-dim/40 bg-text-dim/10 px-3 py-2.5">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-text-dim/15 font-display text-sm font-bold text-text-dim">
                ×0
              </div>
              <div className="text-[13px] font-semibold leading-snug text-text-dim">{t("offStandingsNotice")}</div>
            </div>
          )}
          {race.special_rule && (
            // Course malus : bandeau rouge avec gros picto, nom du malus, phrase choc et « ? » illustré.
            <div
              className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 ${
                bonusRule ? "border-gold/40 bg-gold/10" : "border-red/40 bg-red/10"
              }`}
            >
              <div
                className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-xl ${
                  bonusRule ? "bg-gold/20" : "bg-red/20"
                }`}
              >
                {SPECIAL_RULE_ICONS[race.special_rule] ?? "⚠️"}
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <div className={`font-display text-[11px] font-bold uppercase tracking-wider ${bonusRule ? "text-gold" : "text-red"}`}>
                  {t(bonusRule ? "bonusLabel" : "malusLabel")} · {tFormat(`specialRule_${race.special_rule}`)}
                </div>
                <div className="text-[13px] font-semibold leading-snug text-frost">{t(`malusTagline_${race.special_rule}`)}</div>
              </div>
              <HelpButton
                title={`${SPECIAL_RULE_ICONS[race.special_rule] ?? "⚠️"} ${tFormat(`specialRule_${race.special_rule}`)}`}
                openLabel={t("specialRulePrefix")}
                closeLabel={tClassement("close")}
                items={(MALUS_SCALE[race.special_rule] ?? []).map((icon, i) => ({
                  icon,
                  text: t(`malusScale_${race.special_rule}_${i + 1}`),
                }))}
              />
            </div>
          )}
          {displayStatus !== "upcoming" && (
            <div className="text-xs text-text-dim first-letter:uppercase">
              {new Date(race.locks_at).toLocaleString(locale, {
                timeZone: DISPLAY_TIME_ZONE,
                weekday: "long",
                day: "numeric",
                month: "long",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          )}
        </div>

        {opinion && <RaceOpinion title={t("opinionTitle")} text={opinion} />}

        {/* Questions bonus juste sous l'avis, pour qu'elles soient vues (avant le départ et en live). */}
        {(displayStatus === "upcoming" || displayStatus === "ongoing") && bonusQuestionsBlock}

        {displayStatus === "upcoming" &&
          (!predictionsOpen ? (
            <div className="rounded-2xl border border-dashed border-border p-5 text-[13px] leading-relaxed text-text-dim">
              {t("predictionsOpenOn", {
                date: new Date(`${predictionOpensOn(stage.starts_on)}T12:00:00Z`).toLocaleDateString(locale, {
                  timeZone: DISPLAY_TIME_ZONE,
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                }),
              })}
            </div>
          ) : !hasOdds ? (
            <div className="rounded-2xl border border-dashed border-border p-5 text-[13px] text-text-dim">
              {t("noOddsMessage", { format: race.format })}
            </div>
          ) : startListPending ? (
            <div className="rounded-2xl border border-dashed border-border p-5 text-[13px] leading-relaxed text-text-dim">
              {t(race.format === "poursuite" ? "startListPendingPursuit" : "startListPendingMassStart")}
            </div>
          ) : (
            <>
              {!isRelay && grilledAthleteIds.length > 0 && availableCards.some((c) => c.card_type === "fondue") && (
                <GrilladeButton raceId={race.id} cardId={availableCards.find((c) => c.card_type === "fondue")!.id} />
              )}

              {isTeamRace ? (
                <TeamPredictionForm
                  raceId={race.id}
                  teams={teamsWithOdds}
                  initialSelection={initialTeamSelection}
                  initialBonusX2={initialBonusX2}
                  x2Eligible={x2Eligible}
                  x2UsesRemaining={x2UsesRemaining}
                />
              ) : isRelay ? (
                <RelayPredictionForm
                  raceId={race.id}
                  format={race.format}
                  nations={nationsWithOdds}
                  initialSelection={initialNationSelection}
                  initialBonusX2={initialBonusX2}
                  x2Eligible={x2Eligible}
                  x2UsesRemaining={x2UsesRemaining}
                />
              ) : (
                <PredictionForm
                  raceId={race.id}
                  format={race.format}
                  athletes={selectableAthletes}
                  initialSelection={initialAthleteSelection}
                  grilledAthleteIds={grilledAthleteIds}
                  hiddenPepiteIds={hiddenPepiteIds}
                  playableCards={playableCards}
                  activeCard={activeCard}
                  quatriemeChoixActive={quatriemeChoixActive}
                  stageCards={stageCards}
                  initialBonusX2={initialBonusX2}
                  initialCardTarget={initialCardTarget}
                  x2Eligible={x2Eligible}
                  x2UsesRemaining={x2UsesRemaining}
                  // Mass start : pas d'écart de départ, tri par cote seulement (la liste ne sert qu'à filtrer).
                  startOrder={race.format === "poursuite" ? startOrder : {}}
                  startGaps={startGaps}
                />
              )}
            </>
          ))}

        {displayStatus === "ongoing" && (
          <div className="flex flex-col gap-4">
            {lateJokerOpen && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3 rounded-2xl border border-gold/40 bg-gold/10 px-3 py-2.5">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gold/20 text-xl">⏰</div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="font-display text-[11px] font-bold uppercase tracking-wider text-gold">{t("lateJokerTitle")}</div>
                    <div className="text-[13px] leading-snug text-frost">{t("lateJokerHint")}</div>
                  </div>
                </div>
                {isTeamRace ? (
                  <TeamPredictionForm
                    raceId={race.id}
                    teams={teamsWithOdds}
                    initialSelection={initialTeamSelection}
                    initialBonusX2={false}
                    x2Eligible={false}
                    x2UsesRemaining={0}
                    lateJoker
                  />
                ) : (
                  <PredictionForm
                    raceId={race.id}
                    format={race.format}
                    athletes={athletesWithOdds}
                    initialSelection={initialAthleteSelection}
                    grilledAthleteIds={grilledAthleteIds}
                    hiddenPepiteIds={hiddenPepiteIds}
                    playableCards={[]}
                    activeCard={null}
                    quatriemeChoixActive={false}
                    stageCards={stageCards}
                    initialBonusX2={false}
                    initialCardTarget={null}
                    x2Eligible={false}
                    x2UsesRemaining={0}
                    lateJoker
                  />
                )}
              </div>
            )}
            {!lateJokerOpen && (
            <div className="flex flex-col gap-2">
              <div className="font-display text-xs font-bold uppercase tracking-wider text-text-dim">
                {t("myPredictionTitle")}
              </div>

              {!hasPrediction ? (
                <div className="rounded-2xl border border-dashed border-border p-5 text-[13px] text-text-dim">
                  {t("noPredictionMessage")}
                </div>
              ) : isTeamRace ? (
                <div className="flex flex-col gap-2">
                  {initialTeamSelection.map((teamId) => {
                    const team = teamsWithOdds.find((x) => x.team_id === teamId);
                    return (
                      <div key={teamId} className="flex items-center gap-3.5 rounded-2xl border border-border bg-card px-4 py-3.5">
                        <div className="flex-1 text-sm font-semibold">{team?.name ?? teamId}</div>
                        {team && <div className="font-display text-sm font-bold text-ice">×{team.value}</div>}
                      </div>
                    );
                  })}
                </div>
              ) : isRelay ? (
                <NationPickRow nation={nationsWithOdds.find((n) => n.nation_code === initialNationSelection)} />
              ) : (
                <div className="flex flex-col gap-2">
                  {initialAthleteSelection.map((athleteId) => (
                    <AthletePickRow key={athleteId} athlete={athletesWithOdds.find((a) => a.athlete_id === athleteId)} />
                  ))}
                </div>
              )}

              {initialBonusX2 && (
                <div className="w-fit rounded-full bg-gold-soft px-2.5 py-1 font-display text-[11px] font-bold text-gold">
                  ⚡ {t("bonusX2Badge")}
                </div>
              )}
              {isLateJokerPrediction && (
                <div className="w-fit rounded-full bg-gold-soft px-2.5 py-1 font-display text-[11px] font-bold text-gold">
                  ⏰ {t("lateJokerBadge")}
                </div>
              )}
            </div>
            )}

            {ongoingBoard.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="font-display text-xs font-bold uppercase tracking-wider text-text-dim">{t("ongoingBoardTitle")}</div>
                {ongoingBoard.map((row) => (
                  <OngoingBoardRowView key={row.userId} row={row} mine={row.userId === user?.id} noPredictionLabel={t("ongoingNoPrediction")} />
                ))}
              </div>
            )}

            {isAdmin && (
              <a
                href={`/admin/races/${race.id}`}
                className="rounded-full bg-ice py-2.5 text-center font-display text-[13px] font-bold text-on-ice"
              >
                {t("adminEnterResultsButton")}
              </a>
            )}
          </div>
        )}

        {displayStatus === "finished" && (
          <div className="flex flex-col gap-4">
            {user && (
              <div className="flex flex-col gap-3 rounded-2xl border border-border bg-gradient-to-br from-card2 to-card p-5">
                <div className="flex items-end justify-between gap-3">
                  <div className="flex flex-col gap-1.5">
                    <div className="font-display text-xs font-bold uppercase tracking-wider text-text-dim">
                      {t("pointsEarnedLabel")}
                    </div>
                    {/* Le ×2 (bonus perso ou coefficient Mondiaux/JO) est affiché ici, pas sur chaque ligne. */}
                    {multiplier && (
                      <div className="w-fit rounded-full bg-gold-soft px-2.5 py-1 font-display text-[11px] font-bold text-gold">
                        {multiplier.kind === "bonusX2" && "⚡ "}
                        {t(multiplier.kind === "bonusX2" ? "bonusX2Gain" : "coefficientGain", { points: formatPoints(multiplier.gain) })}
                      </div>
                    )}
                  </div>
                  <div className="font-display text-2xl font-extrabold text-ice">{Math.round(pointsEarned * 10) / 10} pts</div>
                </div>

                {raceResult?.pepite && <PepiteReveal pepite={raceResult.pepite} />}

                {/* Questions bonus : à part du pronostic, pour voir d'un coup d'œil ce qu'elles ont rapporté. */}
                {myBonusPoints > 0 && (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-green/40 bg-green/10 px-3 py-2">
                    <BonusPointsBadge label={t("bonusQuestionsLine")} />
                    <span className="font-display text-base font-extrabold text-green">{formatPoints(myBonusPoints)}</span>
                  </div>
                )}

                {/* Rappel du pronostic juste sous les points, pour comprendre d'où ils viennent. */}
                <div className="flex flex-col gap-2 border-t border-border pt-3">
                  <div className="font-display text-[11px] font-bold uppercase tracking-wider text-text-dim">
                    {t("myPredictionTitle")}
                  </div>
                  {!raceResult?.prediction ? (
                    <div className="text-[13px] text-text-dim">{t("noPredictionMessage")}</div>
                  ) : (
                    <PredictionBreakdown picks={raceResult.prediction.picks} extras={raceResult.prediction.extras} showLegend={false} showCalc />
                  )}
                </div>
              </div>
            )}

            {bonusQuestionsBlock}

            {compareInvite && (
              <div className="flex flex-col gap-2.5 rounded-2xl border border-ice/40 bg-ice-soft p-4">
                <div className="font-display text-sm font-bold text-ice">🏁 {t("compareTitle")}</div>
                <p className="text-[13px] leading-relaxed text-frost">
                  {t("compareBody", {
                    rank: raceResult?.prediction?.playerRank ?? "–",
                    count: raceResult?.prediction?.playerCount ?? 0,
                  })}
                </p>
                <div className="flex gap-2">
                  <Link
                    href={`/classement?periode=etapes&etape=${stage.id}&course=${race.id}`}
                    className="flex-1 rounded-full bg-ice py-2 text-center font-display text-[12px] font-bold text-on-ice"
                  >
                    {t("compareStandings")}
                  </Link>
                  <Link
                    href="/ligues"
                    className="flex-1 rounded-full border border-border bg-card py-2 text-center font-display text-[12px] font-bold text-frost"
                  >
                    {t("compareLeague")}
                  </Link>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2">
              {/* Légende des pictos (Fusée, Gâchette, Prono parfait) dans un « ? » plutôt qu'en toutes lettres. */}
              <div className="flex items-center gap-2 font-display text-xs font-bold uppercase tracking-wider text-text-dim">
                {t("resultsTitle")}
                <HelpButton
                  title={t("resultsHelpTitle")}
                  openLabel={t("resultsHelpTitle")}
                  closeLabel={tClassement("close")}
                  items={[
                    { icon: "🚀", text: t("resultsHelpFusee") },
                    { icon: "🎯", text: t("resultsHelpGachette") },
                    { icon: "⭐", text: t("resultsHelpPerfect") },
                    { icon: "✓", text: t("resultsHelpMine") },
                  ]}
                />
              </div>

              {results.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-5 text-[13px] text-text-dim">
                  {t("noResultsMessage")}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {/* Top 10 (Top 5 en relais, seuls à marquer des points) + les choix du joueur classés plus
                      loin ; le reste dans le déroulant. */}
                  {results.length > resultsTopCount ? (
                    <ShowMore
                      label={t("showFullRanking")}
                      collapsed={results.filter((r) => r.rank <= resultsTopCount || r.mine).map((row) => <ResultRow key={`${row.rank}-${row.name}`} row={row} />)}
                      expanded={results.map((row) => <ResultRow key={`${row.rank}-${row.name}`} row={row} />)}
                    />
                  ) : (
                    results.map((row) => <ResultRow key={`${row.rank}-${row.name}`} row={row} />)
                  )}
                </div>
              )}
            </div>

            {players.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="font-display text-xs font-bold uppercase tracking-wider text-text-dim">{t("playersTitle")}</div>
                {players.length > 10 ? (
                  <ShowMore
                    label={t("showFullRanking")}
                    collapsed={players
                      .filter((p, i) => i < 10 || p.userId === user?.id)
                      .map((p) => <PlayerRow key={p.userId} player={p} mine={p.userId === user?.id} raceId={race.id} />)}
                    expanded={players.map((p) => <PlayerRow key={p.userId} player={p} mine={p.userId === user?.id} raceId={race.id} />)}
                  />
                ) : (
                  players.map((p) => <PlayerRow key={p.userId} player={p} mine={p.userId === user?.id} raceId={race.id} />)
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <BottomNav active="/courses" />
    </div>
  );
}

function AthletePickRow({ athlete }: { athlete: AthleteWithOdds | undefined }) {
  if (!athlete) return null;
  return (
    <div className="flex items-center gap-3.5 rounded-2xl border border-border bg-card px-4 py-3.5">
      <div className="text-base">{nationFlagEmoji(athlete.nation_code)}</div>
      <div className="flex-1 text-sm font-semibold">
        {fullAthleteName(athlete)}
      </div>
      <div className="font-display text-sm font-bold text-ice">×{athlete.value}</div>
    </div>
  );
}

function NationPickRow({ nation }: { nation: NationWithOdds | undefined }) {
  if (!nation) return null;
  return (
    <div className="flex items-center gap-3.5 rounded-2xl border border-border bg-card px-4 py-3.5">
      <div className="text-base">{nationFlagEmoji(nation.nation_code)}</div>
      <div className="flex-1 text-sm font-semibold">{nation.name}</div>
      <div className="font-display text-sm font-bold text-ice">×{nation.value}</div>
    </div>
  );
}


function RaceNavLink({ raceId, label, direction }: { raceId: string | null; label: string; direction: "previous" | "next" }) {
  const className =
    "flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 font-display text-[11px] font-bold";
  const content =
    direction === "previous" ? (
      <>
        <ChevronLeftIcon className="h-3.5 w-3.5" />
        {label}
      </>
    ) : (
      <>
        {label}
        <ChevronRightIcon className="h-3.5 w-3.5" />
      </>
    );
  if (!raceId) return <span className={`${className} text-text-dim opacity-40`}>{content}</span>;
  return (
    <Link href={`/courses/${raceId}`} className={`${className} text-ice`}>
      {content}
    </Link>
  );
}
