import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { nationFlagEmoji } from "@/lib/nationFlags";
import { ArrowLeftIcon } from "@/components/icons";
import { HeartChoiceForm } from "./HeartChoiceForm";

export const dynamic = "force-dynamic";

/**
 * VéloPronos : les seuls choix de saison, l'équipe de cœur (carte Équipe) et la nation favorite
 * (Fête nationale), chacun définitif (favorite_teams, migration 0052).
 */
export default async function HeartPage() {
  const supabase = createClient();
  const t = await getTranslations("Heart");
  const { data: season } = await supabase.from("seasons").select("id").eq("status", "active").maybeSingle();
  const {
    data: { user },
  } = await getAuthUser();
  const playerId = user && !user.is_anonymous ? user.id : null;

  const [{ data: teams }, { data: nations }, { data: favorite }] = season
    ? await Promise.all([
        supabase.from("teams").select("id, name").eq("season_id", season.id).order("name"),
        supabase.from("nations").select("code, name").order("name"),
        playerId
          ? supabase.from("favorite_teams").select("team_id, nation_code").eq("user_id", playerId).eq("season_id", season.id).maybeSingle()
          : Promise.resolve({ data: null as any }),
      ])
    : [{ data: [] as any[] }, { data: [] as any[] }, { data: null as any }];

  const teamOptions = ((teams ?? []) as any[]).map((x) => ({ value: x.id as string, label: x.name as string }));
  const nationOptions = ((nations ?? []) as any[]).map((n) => ({ value: n.code as string, label: `${nationFlagEmoji(n.code)} ${n.name}` }));

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-5 pb-8 pt-6">
      <div className="flex items-center gap-3">
        <Link
          href="/courses"
          aria-label={t("back")}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-border bg-card text-text-dim"
        >
          <ArrowLeftIcon className="h-4 w-4" />
        </Link>
        <div className="font-display text-lg font-bold">{t("title")}</div>
      </div>
      {!season ? (
        <div className="rounded-2xl border border-dashed border-border p-5 text-[13px] text-text-dim">{t("noSeason")}</div>
      ) : !playerId ? (
        <div className="rounded-2xl border border-dashed border-border p-5 text-[13px] text-text-dim">{t("loginRequired")}</div>
      ) : (
        <>
          <HeartChoiceForm
            seasonId={season.id}
            field="team_id"
            title={t("teamTitle")}
            hint={t("teamHint")}
            options={teamOptions}
            chosenLabel={teamOptions.find((o) => o.value === favorite?.team_id)?.label ?? null}
            rowExists={!!favorite}
          />
          <HeartChoiceForm
            seasonId={season.id}
            field="nation_code"
            title={t("nationTitle")}
            hint={t("nationHint")}
            options={nationOptions}
            chosenLabel={nationOptions.find((o) => o.value === favorite?.nation_code)?.label ?? null}
            rowExists={!!favorite}
          />
        </>
      )}
    </div>
  );
}
