import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { getClock } from "@/lib/clock";
import { fetchAll } from "@/lib/admin/fetchAll";
import { fullAthleteName } from "@/lib/athleteName";
import { nationFlagEmoji } from "@/lib/nationFlags";
import { ArrowLeftIcon } from "@/components/icons";
import { JERSEY_ODDS_FORMAT, JERSEY_TYPES, type JerseyType } from "@/lib/velo/courses";
import { JerseysForm, type JerseyConfig, type JerseyOption } from "./JerseysForm";
import { WaterCarrierForm } from "./WaterCarrierForm";
import { ChatNoirForm, type ChatNoirTarget } from "./ChatNoirForm";
import { PEPITE_MIN_ODDS } from "@/lib/scoring/constants";

export const dynamic = "force-dynamic";

/**
 * Pronostics maillots d'une course par étapes (course_predictions, migration 0045) : un vainqueur
 * final par maillot de la course, modifiable jusqu'au départ de la 1re étape.
 */
export default async function JerseysPage({ params }: { params: Promise<{ stageId: string }> }) {
  const { stageId } = await params;
  const supabase = createClient();
  const t = await getTranslations("Jerseys");

  const { data: course } = await supabase
    .from("stages")
    .select("id, season_id, kind, name, location, country_code, jerseys, jersey_color, races(locks_at, stage_number)")
    .eq("id", stageId)
    .maybeSingle();
  if (!course) notFound();

  const jerseys = JERSEY_TYPES.filter((j) => ((course.jerseys ?? []) as string[]).includes(j));
  const { now } = await getClock();
  const firstLock = ((course.races ?? []) as Array<{ locks_at: string }>).map((r) => r.locks_at).sort()[0] ?? null;
  const isLocked = firstLock != null && new Date(firstLock) <= now;

  const {
    data: { user },
  } = await getAuthUser();
  const playerId = user && !user.is_anonymous ? user.id : null;

  const isGrandTour = course.kind === "grand_tour";
  const [{ data: entries }, odds, { data: picks }, { data: ledger }, { data: waterCarrier }, { data: chatNoirCard }] = await Promise.all([
    supabase
      .from("stage_riders")
      .select("athlete_id, abandoned_race_id, athletes(id, first_name, last_name, nation_code, team_id, teams(id, code, name))")
      .eq("stage_id", stageId),
    fetchAll((from, to) =>
      supabase
        .from("odds")
        .select("athlete_id, team_id, format, value")
        .eq("stage_id", stageId)
        .is("valid_until", null)
        .order("id")
        .range(from, to)
    ),
    playerId
      ? supabase.from("course_predictions").select("jersey, athlete_id, team_id").eq("user_id", playerId).eq("stage_id", stageId)
      : Promise.resolve({ data: [] as any[] }),
    // Points des maillots une fois le podium final saisi (score_ledger, une ligne par maillot).
    playerId
      ? supabase.from("score_ledger").select("jersey, points").eq("user_id", playerId).eq("stage_id", stageId).not("jersey", "is", null)
      : Promise.resolve({ data: [] as any[] }),
    // Porteur d'eau (Grand Tour) : table pepites, une ligne par joueur et par course (0049).
    playerId && isGrandTour
      ? supabase.from("pepites").select("athlete_id, bonus_claimed, revealed_race_id").eq("user_id", playerId).eq("stage_id", stageId).maybeSingle()
      : Promise.resolve({ data: null as any }),
    // Carte Chat noir de cette course encore en main (migration 0052).
    playerId
      ? supabase
          .from("bonus_cards")
          .select("id")
          .eq("user_id", playerId)
          .eq("course_id", stageId)
          .eq("card_type", "chat_noir")
          .eq("status", "available")
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null as any }),
  ]);
  const pointsByJersey = new Map(((ledger ?? []) as any[]).map((l) => [l.jersey as string, Number(l.points)]));

  const oddsOf = new Map<string, number>();
  for (const o of odds) oddsOf.set(`${o.athlete_id ?? o.team_id}|${o.format}`, o.value);

  const riders = ((entries ?? []) as any[]).map((e) => e.athletes).filter(Boolean);
  const teams = new Map<string, { id: string; code: string; name: string }>();
  for (const r of riders) if (r.teams) teams.set(r.teams.id, r.teams);

  const byOdds = (a: JerseyOption, b: JerseyOption) => (a.odds ?? 9999) - (b.odds ?? 9999) || a.label.localeCompare(b.label);
  const pickByJersey = new Map(((picks ?? []) as any[]).map((p) => [p.jersey as string, (p.athlete_id ?? p.team_id) as string]));

  const configs: JerseyConfig[] = jerseys.map((jersey: JerseyType) => {
    const format = JERSEY_ODDS_FORMAT[jersey];
    const options: JerseyOption[] =
      jersey === "equipe"
        ? Array.from(teams.values()).map((team) => ({ id: team.id, label: team.name, search: team.code, odds: oddsOf.get(`${team.id}|${format}`) ?? null }))
        : riders.map((r) => ({
            id: r.id,
            label: `${nationFlagEmoji(r.nation_code)} ${fullAthleteName(r)}${r.teams?.code ? ` (${r.teams.code})` : ""}`,
            search: [r.nation_code, r.teams?.code, r.teams?.name].filter(Boolean).join(" "),
            odds: oddsOf.get(`${r.id}|${format}`) ?? null,
          }));
    // Les coureurs (ou équipes) avec une cote pour ce maillot d'abord ; tous si personne n'en a.
    const withOdds = options.filter((o) => o.odds != null);
    return {
      jersey,
      isTeam: jersey === "equipe",
      options: (withOdds.length > 0 ? withOdds : options).sort(byOdds),
      initialPick: pickByJersey.get(jersey) ?? null,
      points: pointsByJersey.get(jersey) ?? null,
    };
  });

  // Porteur d'eau possible : toutes ses cotes de la course (étapes et maillots) >= 30.
  const riderOdds = new Map<string, number[]>();
  for (const o of odds) {
    if (!o.athlete_id) continue;
    if (!riderOdds.has(o.athlete_id)) riderOdds.set(o.athlete_id, []);
    riderOdds.get(o.athlete_id)!.push(o.value);
  }
  const waterCarrierOptions: JerseyOption[] = riders
    .filter((r) => {
      const values = riderOdds.get(r.id) ?? [];
      return values.length > 0 && values.every((v) => v >= PEPITE_MIN_ODDS);
    })
    .map((r) => ({
      id: r.id,
      label: `${nationFlagEmoji(r.nation_code)} ${fullAthleteName(r)}${r.teams?.code ? ` (${r.teams.code})` : ""}`,
      search: [r.nation_code, r.teams?.code, r.teams?.name].filter(Boolean).join(" "),
      odds: Math.min(...riderOdds.get(r.id)!),
    }))
    .sort(byOdds);
  // Le porteur déjà choisi reste affiché même s'il n'est plus éligible.
  if (waterCarrier && !waterCarrierOptions.some((o) => o.id === waterCarrier.athlete_id)) {
    const r = riders.find((x) => x.id === waterCarrier.athlete_id);
    if (r) waterCarrierOptions.unshift({ id: r.id, label: `${nationFlagEmoji(r.nation_code)} ${fullAthleteName(r)}`, search: "", odds: null });
  }
  let waterCarrierPoints: number | null = null;
  if (waterCarrier?.bonus_claimed && waterCarrier.revealed_race_id && playerId) {
    const { data: row } = await supabase
      .from("score_ledger")
      .select("breakdown")
      .eq("user_id", playerId)
      .eq("race_id", waterCarrier.revealed_race_id)
      .maybeSingle();
    const bonus = Number((row?.breakdown as any)?.pepiteBonus ?? 0);
    waterCarrierPoints = bonus > 0 ? bonus : null;
  }

  // Chat noir : remplace un coureur abandonné (maillot hors équipe, ou porteur d'eau pas encore
  // révélé), une fois la course partie et jusqu'au départ de l'étape 10 (à confirmer).
  const abandoned = new Set(((entries ?? []) as any[]).filter((e) => e.abandoned_race_id).map((e) => e.athlete_id as string));
  const stage10Lock =
    ((course.races ?? []) as Array<{ locks_at: string; stage_number: number | null }>)
      .filter((r) => (r.stage_number ?? 0) >= 10)
      .map((r) => r.locks_at)
      .sort()[0] ?? null;
  const chatNoirOpen = !!chatNoirCard && isLocked && (stage10Lock == null || new Date(stage10Lock) > now);
  const labelOf = (id: string) => {
    const r = riders.find((x) => x.id === id);
    return r ? `${nationFlagEmoji(r.nation_code)} ${fullAthleteName(r)}` : "?";
  };
  const chatNoirTargets: ChatNoirTarget[] = [];
  if (chatNoirOpen) {
    for (const c of configs) {
      if (c.isTeam || !c.initialPick || !abandoned.has(c.initialPick)) continue;
      chatNoirTargets.push({ target: c.jersey, oldLabel: labelOf(c.initialPick), options: c.options.filter((o) => !abandoned.has(o.id)) });
    }
    if (waterCarrier && !waterCarrier.bonus_claimed && abandoned.has(waterCarrier.athlete_id)) {
      chatNoirTargets.push({
        target: "porteur",
        oldLabel: labelOf(waterCarrier.athlete_id),
        options: waterCarrierOptions.filter((o) => o.odds != null && !abandoned.has(o.id)),
      });
    }
  }

  const name = course.name ?? course.location;
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-5 pb-8 pt-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/courses?etape=${course.id}`}
          aria-label={t("back")}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-border bg-card text-text-dim"
        >
          <ArrowLeftIcon className="h-4 w-4" />
        </Link>
        <div className="flex flex-col">
          <div className="font-display text-lg font-bold">{t("title")}</div>
          <div className="text-xs text-text-dim">
            {nationFlagEmoji(course.country_code)} {name}
          </div>
        </div>
      </div>

      {jerseys.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-5 text-[13px] text-text-dim">{t("noJerseys")}</div>
      ) : riders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-5 text-[13px] text-text-dim">{t("noRiders")}</div>
      ) : (
        <>
          <div className="flex flex-col gap-1 rounded-2xl border border-border bg-card px-4 py-3 text-[13px] leading-snug text-text-dim">
            <p>{isLocked ? t("closed") : t("intro")}</p>
            <p>{t("pointsRule")}</p>
            {jerseys.includes("combatif") && <p>{t("combatifRule")}</p>}
          </div>
          {!playerId ? (
            <div className="rounded-2xl border border-dashed border-border p-5 text-[13px] text-text-dim">{t("loginRequired")}</div>
          ) : (
            <>
              {chatNoirCard && chatNoirTargets.length > 0 && <ChatNoirForm cardId={chatNoirCard.id} targets={chatNoirTargets} />}
              <JerseysForm stageId={course.id} configs={configs} locked={isLocked} leaderColor={course.jersey_color ?? null} />
              {isGrandTour && (
                <WaterCarrierForm
                  stageId={course.id}
                  seasonId={course.season_id}
                  options={waterCarrierOptions}
                  initialPick={waterCarrier?.athlete_id ?? null}
                  locked={isLocked}
                  revealed={!!waterCarrier?.bonus_claimed}
                  points={waterCarrierPoints}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
