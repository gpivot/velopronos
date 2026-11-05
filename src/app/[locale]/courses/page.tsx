import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { HeaderActions } from "@/components/HeaderActions";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { BottomNav } from "@/components/BottomNav";
import { ArrowLeftIcon } from "@/components/icons";
import { getSeasonView, pickDefaultOpenStageId, type HiddenPepite } from "@/lib/seasonView";
import { getClock } from "@/lib/clock";
import { isEquipeCardActive } from "@/lib/favoriteTeam";
import { CalendarAccordion, type CalendarStage } from "./CalendarAccordion";
import { CalendarImportButton } from "./CalendarImportButton";
import type { SeasonPick } from "./SeasonPredictionsAccordion";
import { StreakCard } from "@/components/StreakCard";
import type { PlayerCards } from "@/lib/bonusCards";

export const dynamic = "force-dynamic";

interface CalendarData {
  seasonId: string | null;
  stages: CalendarStage[];
  isAdmin: boolean;
  /** null : visiteur non connecté. */
  seasonPicks: SeasonPick[] | null;
  /** Pronostics de saison encore modifiables (avant le début de saison, comme /globes). */
  seasonPicksOpen: boolean;
  pepites: HiddenPepite[] | null;
  /** Ligne « Équipe favorite » des pronostics de saison (joueur connecté seulement). */
  favoriteTeam: { label: string; nationCode: string } | { label: null; choosable: boolean } | undefined;
  streak: number | null;
  cards: PlayerCards | null;
}

async function getCalendarData(): Promise<CalendarData> {
  const supabase = createClient();

  const [{ data: season }, { data: userResult }] = await Promise.all([
    supabase.from("seasons").select("id, starts_on").eq("status", "active").maybeSingle(),
    getAuthUser(),
  ]);

  let isAdmin = false;
  if (userResult.user) {
    const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", userResult.user.id).maybeSingle();
    isAdmin = profile?.is_admin ?? false;
  }

  if (!season) return { seasonId: null, stages: [], isAdmin, seasonPicks: null, seasonPicksOpen: false, pepites: null, favoriteTeam: undefined, streak: null, cards: null };

  const { now } = await getClock();
  // Invité (session anonyme) : vu comme un visiteur tant que son compte n'est pas créé.
  const playerId = userResult.user && !userResult.user.is_anonymous ? userResult.user.id : null;
  const [{ stages, seasonPicks, pepites, streak, cards }, favoriteTeam] = await Promise.all([
    getSeasonView(supabase, season, playerId, now),
    playerId ? getFavoriteTeamLine(supabase, season.id, playerId) : Promise.resolve(undefined),
  ]);
  return { seasonId: season.id, stages, isAdmin, seasonPicks, seasonPicksOpen: new Date(season.starts_on) > now, pepites, favoriteTeam, streak, cards };
}

/** Équipe favorite choisie (« France Femmes »), ou encore à choisir tant que la carte Équipe n'est pas active. */
async function getFavoriteTeamLine(
  supabase: ReturnType<typeof createClient>,
  seasonId: string,
  userId: string
): Promise<CalendarData["favoriteTeam"]> {
  const { data } = await supabase
    .from("favorite_teams")
    .select("nation_code, sex, nations(name)")
    .eq("user_id", userId)
    .eq("season_id", seasonId)
    .maybeSingle();
  if (!data) return { label: null, choosable: !(await isEquipeCardActive(supabase, userId, seasonId)) };
  const tSex = await getTranslations("Sex");
  const name = (data as any).nations?.name ?? data.nation_code;
  return { label: `${name} ${tSex(data.sex as "F")}`, nationCode: data.nation_code };
}

export default async function CoursesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ etape?: string }>;
}) {
  const { locale } = await params;
  // Arrivée depuis « L'étape de la semaine » de l'accueil : cette étape est dépliée d'office.
  const { etape } = await searchParams;
  const t = await getTranslations("Courses");
  const { seasonId, stages, isAdmin, seasonPicks, seasonPicksOpen, pepites, favoriteTeam, streak, cards } = await getCalendarData();
  const requestedStageId = etape && stages.some((s) => s.id === etape) ? etape : null;

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
          <HeaderActions />
        </div>

        {isAdmin && seasonId && <CalendarImportButton seasonId={seasonId} />}

        {/* VéloPronos : plus de pronostics de saison ; le porteur d'eau s'affiche dans son Grand Tour
            (calendrier). L'équipe de cœur et la nation favorite reviendront ici. */}

        {streak != null && <StreakCard current={streak} cards={cards ?? undefined} seasonId={seasonId ?? undefined} />}

        {stages.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-5 text-[13px] text-text-dim">
            {t("emptyState")}
          </div>
        ) : (
          <CalendarAccordion
            stages={stages}
            defaultOpenStageId={requestedStageId ?? pickDefaultOpenStageId(stages)}
            scrollToStageId={requestedStageId}
            locale={locale}
          />
        )}
      </div>

      <BottomNav active="/courses" />
    </div>
  );
}
