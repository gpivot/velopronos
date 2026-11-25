import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { getClock } from "@/lib/clock";
import { getRaceDisplayStatus } from "@/lib/raceStatus";
import { nationFlagEmoji } from "@/lib/nationFlags";
import { fullAthleteName } from "@/lib/athleteName";
import { displayedSex } from "@/lib/raceLabel";
import { DISPLAY_TIME_ZONE } from "@/lib/displayTimeZone";
import { RaceCountdown } from "../RaceCountdown";
import { GuestCodeForm } from "./GuestCodeForm";

/**
 * Page d'attente d'un invité « e-mail seulement » (demande de Guillaume, 11/11/2026), juste après
 * la validation de son pronostic : heure de départ, pronostic modifiable jusque-là, et saisie du
 * code privé reçu par e-mail une fois les résultats officiels. Les autres joueurs, et l'invité une
 * fois la course partie, sont renvoyés vers la page de la course.
 */
export default async function GuestWaitingPage({ params }: { params: Promise<{ locale: string; raceId: string }> }) {
  const { locale, raceId } = await params;
  const supabase = createClient();
  const [{ data: race }, { now }, { data: authData }, t, tFormat, tSex] = await Promise.all([
    supabase.from("races").select("id, format, sex, locks_at, status, stages(location, country_code)").eq("id", raceId).maybeSingle(),
    getClock(),
    getAuthUser(),
    getTranslations("GuestWaiting"),
    getTranslations("RaceFormat"),
    getTranslations("Sex"),
  ]);
  const coursePath = `/${locale}/courses/${raceId}`;
  const user = authData.user;
  if (!race || !user || user.is_anonymous) redirect(coursePath);
  const { data: me } = await supabase.from("profiles").select("signup_pending").eq("id", user.id).maybeSingle();
  if (!(me as { signup_pending?: boolean } | null)?.signup_pending) redirect(coursePath);
  if (getRaceDisplayStatus(race as any, now) !== "upcoming") redirect(coursePath);

  const { data: prediction } = await supabase.from("predictions").select("athlete_ids, nation_code").eq("user_id", user.id).eq("race_id", raceId).maybeSingle();
  const athleteIds: string[] = (prediction?.athlete_ids as string[] | null) ?? [];
  const { data: athletes } = athleteIds.length
    ? await supabase.from("athletes").select("id, first_name, last_name, nation_code").in("id", athleteIds)
    : { data: [] as any[] };
  const picks = athleteIds
    .map((id) => (athletes ?? []).find((a: any) => a.id === id))
    .filter(Boolean)
    .map((a: any) => ({ id: a.id as string, label: fullAthleteName(a), flag: nationFlagEmoji(a.nation_code) }));
  if (prediction?.nation_code) picks.push({ id: prediction.nation_code, label: prediction.nation_code, flag: nationFlagEmoji(prediction.nation_code) });

  const stage = race.stages as unknown as { location: string; country_code: string };
  const sex = displayedSex(race as any);
  const start = new Date(race.locks_at);
  const startDate = start.toLocaleDateString(locale, { timeZone: DISPLAY_TIME_ZONE, weekday: "long", day: "numeric", month: "long" });
  const startTime = start.toLocaleTimeString(locale, { timeZone: DISPLAY_TIME_ZONE, hour: "2-digit", minute: "2-digit" });

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 py-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="text-5xl">🎯</div>
        <h1 className="font-display text-2xl font-extrabold">{t("title")}</h1>
        <p className="text-[13px] text-text-dim">{t("subtitle", { email: user.email ?? "" })}</p>
      </div>

      <div className="flex flex-col gap-3 rounded-[18px] border border-border bg-gradient-to-br from-card2 to-card p-4">
        <div className="flex items-center gap-2 font-display text-base font-bold">
          <span>{nationFlagEmoji(stage.country_code)}</span>
          <span>{stage.location}</span>
          <span className="text-text-dim">·</span>
          <span className="text-frost">
            {tFormat(race.format as any)}
            {sex ? ` ${tSex(sex as any)}` : ""}
          </span>
        </div>
        <div className="text-[14px] leading-relaxed text-frost">{t("startsAt", { date: startDate, time: startTime })}</div>
        {picks.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {picks.map((p) => (
              <span key={p.id} className="rounded-full border border-ice/40 bg-ice-soft px-3 py-1 font-display text-[12px] font-bold text-ice">
                {p.flag} {p.label}
              </span>
            ))}
          </div>
        )}
      </div>

      <RaceCountdown target={race.locks_at} serverNow={now.getTime()} />

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
        <p className="text-[13px] leading-relaxed text-frost">✏️ {t("editable")}</p>
        <Link href={`/courses/${raceId}`} className="rounded-full border border-ice/60 py-2.5 text-center font-display text-[13px] font-bold text-ice">
          {t("editButton")}
        </Link>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-gold/40 bg-gold-soft p-4">
        <div className="font-display text-sm font-bold text-gold">🔑 {t("codeTitle")}</div>
        <p className="text-[13px] leading-relaxed text-frost">{t("codeBody")}</p>
        <GuestCodeForm email={user.email ?? ""} raceId={raceId} />
      </div>
    </div>
  );
}
