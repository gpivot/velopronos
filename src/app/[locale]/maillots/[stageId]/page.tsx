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
    .select("id, name, location, country_code, jerseys, jersey_color, races(locks_at)")
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

  const [{ data: entries }, odds, { data: picks }] = await Promise.all([
    supabase
      .from("stage_riders")
      .select("athlete_id, athletes(id, first_name, last_name, nation_code, team_id, teams(id, code, name))")
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
  ]);

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
    return { jersey, isTeam: jersey === "equipe", options: (withOdds.length > 0 ? withOdds : options).sort(byOdds), initialPick: pickByJersey.get(jersey) ?? null };
  });

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
            <JerseysForm stageId={course.id} configs={configs} locked={isLocked} leaderColor={course.jersey_color ?? null} />
          )}
        </>
      )}
    </div>
  );
}
