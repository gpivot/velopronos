import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { createAdminClient, createClient, getAuthUser } from "@/lib/supabase/server";
import { getClock } from "@/lib/clock";
import { fullAthleteName } from "@/lib/athleteName";
import { alpha3ToAlpha2, nationFlagEmoji, NATION_NAMES } from "@/lib/nationFlags";
import { DISPLAY_TIME_ZONE } from "@/lib/displayTimeZone";
import { ArrowLeftIcon } from "@/components/icons";
import { championshipStatus, summarizeChampions } from "@/lib/velo/champions";
import { championsRanking, loadChampionships, scaleOf } from "@/lib/velo/championsScoring";
import { ChampionPicker } from "./ChampionPicker";

export const dynamic = "force-dynamic";

/**
 * WE des Champions (migration 0056) : un coureur par championnat national, sans cote, modifiable
 * jusqu'à la limite de chaque championnat ; score selon le nombre de champions trouvés.
 */
export default async function ChampionsPage({ params }: { params: Promise<{ locale: string; stageId: string }> }) {
  const { locale, stageId } = await params;
  const supabase = createClient();
  const t = await getTranslations("Champions");
  const { data: stage } = await supabase
    .from("stages")
    .select("id, season_id, kind, name, location, champions_scale, champions_closed_at")
    .eq("id", stageId)
    .maybeSingle();
  if (!stage || stage.kind !== "bonus_event") notFound();

  const [{ now }, { data: userResult }, championships] = await Promise.all([getClock(), getAuthUser(), loadChampionships(supabase, stageId)]);
  const playerId = userResult.user && !userResult.user.is_anonymous ? userResult.user.id : null;
  const nationCodes = championships.map((c) => c.nation_code);
  const admin = createAdminClient();
  const scale = scaleOf(stage);
  const closed = !!stage.champions_closed_at;
  const [{ data: athletes }, { data: myRows }, ranking, { data: profiles }] = await Promise.all([
    nationCodes.length
      ? supabase.from("athletes").select("id, first_name, last_name, nation_code").eq("season_id", stage.season_id).in("nation_code", nationCodes)
      : Promise.resolve({ data: [] as any[] }),
    playerId && championships.length
      ? supabase.from("champion_predictions").select("championship_id, athlete_id").eq("user_id", playerId).in("championship_id", championships.map((c) => c.id))
      : Promise.resolve({ data: [] as any[] }),
    championships.some((c) => c.winner_athlete_id) ? championsRanking(admin, stageId, scale) : Promise.resolve([]),
    admin.from("profiles").select("id, pseudo"),
  ]);

  const nameById = new Map<string, string>();
  const ridersByNation = new Map<string, { id: string; name: string }[]>();
  for (const a of (athletes ?? []) as any[]) {
    const name = fullAthleteName(a);
    nameById.set(a.id, name);
    if (!ridersByNation.has(a.nation_code)) ridersByNation.set(a.nation_code, []);
    ridersByNation.get(a.nation_code)!.push({ id: a.id, name });
  }
  for (const list of ridersByNation.values()) list.sort((x, y) => x.name.localeCompare(y.name, locale));
  const picks = new Map<string, string>(((myRows ?? []) as any[]).map((p) => [p.championship_id, p.athlete_id]));
  const summary = summarizeChampions(championships, picks, scale, closed);
  const pseudoById = new Map(((profiles ?? []) as any[]).map((p) => [p.id as string, p.pseudo as string]));

  let regionNames: Intl.DisplayNames | null = null;
  try {
    regionNames = new Intl.DisplayNames([locale], { type: "region" });
  } catch {
    regionNames = null;
  }
  const countryName = (code: string) => {
    const alpha2 = alpha3ToAlpha2(code);
    return (alpha2 && regionNames?.of(alpha2)) || NATION_NAMES[code] || code;
  };
  const dateLabel = (iso: string) =>
    new Date(iso).toLocaleString(locale, { timeZone: DISPLAY_TIME_ZONE, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const anyOpen = championships.some((c) => championshipStatus(c, now, closed) === "open");
  const total = championships.length;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-5 pb-8 pt-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/courses?etape=${stage.id}`}
          aria-label={t("back")}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-border bg-card text-text-dim"
        >
          <ArrowLeftIcon className="h-4 w-4" />
        </Link>
        <div className="flex flex-col">
          <div className="font-display text-lg font-bold">🏆 {t("title")}</div>
          <div className="text-xs text-text-dim">{stage.name ?? stage.location}</div>
        </div>
      </div>

      {total === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-5 text-[13px] text-text-dim">{t("no_championships")}</div>
      ) : (
        <>
          <div className="flex flex-col gap-1.5 rounded-2xl border border-gold/50 bg-gradient-to-br from-gold/20 to-card px-4 py-3.5">
            <div className="font-display text-[15px] font-extrabold leading-snug">
              {t("subtitle", { count: total, max: scale[Math.min(total, scale.length - 1)] })}
            </div>
            <p className="text-[13px] leading-snug text-text-dim">{t("rule")}</p>
            {playerId && anyOpen && (
              <div className="mt-1 font-display text-[13px] font-bold text-gold">{t("progress", { done: picks.size, total })}</div>
            )}
            {!playerId && anyOpen && <div className="mt-1 text-[13px] text-text-dim">{t("login")}</div>}
          </div>

          {playerId && summary.known > 0 && (
            <div className="flex flex-col gap-1 rounded-2xl border border-ice/50 bg-card px-4 py-3.5">
              <div className="flex items-center justify-between gap-2">
                <div className="font-display text-sm font-bold">{t("my_title")}</div>
                {summary.provisional && (
                  <span className="rounded-full bg-gold-soft px-2.5 py-0.5 font-display text-[11px] font-bold uppercase text-gold">
                    {t("provisional")}
                  </span>
                )}
              </div>
              {summary.provisional ? (
                <>
                  <div className="text-xs text-text-dim">{t("results_known", { known: summary.known, total })}</div>
                  <div className="text-sm">{t("correct_count", { correct: summary.correct })}</div>
                  <div className="font-display text-lg font-extrabold text-ice">{t("provisional_score", { points: summary.score })}</div>
                </>
              ) : (
                <>
                  <div className="text-sm">{t("correct_out_of", { correct: summary.correct, total })}</div>
                  <div className="font-display text-2xl font-extrabold text-ice">{t("final_score", { points: summary.score })}</div>
                </>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2.5">
            {championships.map((c) => {
              const status = championshipStatus(c, now, closed);
              const mine = picks.get(c.id) ?? null;
              const riders = ridersByNation.get(c.nation_code) ?? [];
              const found = status === "completed" && mine === c.winner_athlete_id;
              return (
                <div
                  key={c.id}
                  className={`flex flex-col gap-2 rounded-2xl border bg-card px-4 py-3.5 ${
                    status === "completed" ? (found ? "border-green/60" : "border-red/40") : "border-border"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{nationFlagEmoji(c.nation_code)}</span>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="text-sm font-semibold">{countryName(c.nation_code)}</span>
                      <span className="text-xs text-text-dim">
                        {status === "open" ? t("until", { date: dateLabel(c.locks_at) }) : dateLabel(c.starts_at)}
                      </span>
                    </div>
                  </div>

                  {status === "open" && playerId && riders.length > 0 && (
                    <ChampionPicker championshipId={c.id} options={riders} initialPick={mine} />
                  )}
                  {status === "open" && playerId && riders.length === 0 && <div className="text-xs text-text-dim">{t("no_riders")}</div>}

                  {status === "locked" && (
                    <div className="flex flex-col gap-0.5 text-[13px]">
                      <span className="text-xs text-text-dim">{t("my_prediction")}</span>
                      <span className="font-semibold">{mine ? nameById.get(mine) ?? "?" : t("no_prediction")}</span>
                      <span className="text-xs text-text-dim">🔒 {t("locked")}</span>
                    </div>
                  )}

                  {status === "completed" && (
                    <div className="flex flex-col gap-1 text-[13px]">
                      <div>
                        <span className="text-xs text-text-dim">{t("champion")} · </span>
                        <span className="font-semibold">{nameById.get(c.winner_athlete_id!) ?? "?"}</span>
                      </div>
                      <div>
                        <span className="text-xs text-text-dim">{t("my_prediction")} · </span>
                        <span>{mine ? nameById.get(mine) ?? "?" : t("no_prediction")}</span>
                      </div>
                      <div className={`font-display text-xs font-bold ${found ? "text-green" : "text-red"}`}>
                        {found ? `✅ ${t("correct_prediction")}` : `❌ ${t("wrong_prediction")}`}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {ranking.length > 0 && (
            <div className="flex flex-col gap-1.5 rounded-2xl border border-border bg-card px-4 py-3.5">
              <div className="flex items-center justify-between gap-2">
                <div className="font-display text-sm font-bold">{t("ranking_title")}</div>
                {!closed && <span className="text-[11px] font-bold uppercase text-gold">{t("provisional")}</span>}
              </div>
              {ranking.slice(0, 100).map((row) => (
                <div
                  key={row.userId}
                  className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-sm ${row.userId === playerId ? "bg-ice-soft font-semibold" : ""}`}
                >
                  <span className="truncate">
                    {row.rank}. {pseudoById.get(row.userId) ?? "?"}
                  </span>
                  <span className="whitespace-nowrap text-xs text-text-dim">{t("ranking_row", { correct: row.correct, total, points: row.score })}</span>
                </div>
              ))}
            </div>
          )}

          <details className="rounded-2xl border border-border bg-card px-4 py-3">
            <summary className="cursor-pointer font-display text-sm font-bold">{t("scale_title")}</summary>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-text-dim">
              {scale.slice(1, total + 1).map((points, i) => (
                <div key={i}>{t("scale_row", { count: i + 1, points })}</div>
              ))}
            </div>
          </details>
        </>
      )}
    </div>
  );
}
