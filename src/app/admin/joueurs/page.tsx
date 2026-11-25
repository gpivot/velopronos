import { createAdminClient, createClient } from "@/lib/supabase/server";
import { PlayerList, type PlayerRow } from "./PlayerList";
import { purgeGuests } from "./actions";
import { RetentionStats } from "./RetentionStats";
import { raceLabel } from "../_components/labels";
import { getClock } from "@/lib/clock";
import { fetchAll } from "@/lib/admin/fetchAll";
import { buildRetention, countRecentSignIns, type RetentionRace } from "@/lib/admin/retention";

export const dynamic = "force-dynamic";

export default async function AdminPlayersPage({ searchParams }: { searchParams: { q?: string } }) {
  const admin = createAdminClient();
  const {
    data: { user: me },
  } = await createClient().auth.getUser();

  // L'email n'est pas dans `profiles` : il vient des comptes Supabase Auth (clé service_role).
  const [{ data: profiles }, { data: authData }] = await Promise.all([
    // select("*") : la colonne signup_pending n'existe qu'après la migration 0060 (parcours invité).
    admin.from("profiles").select("*"),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ]);
  const authUsers = authData?.users ?? [];
  const emailById = new Map(authUsers.map((u) => [u.id, u.email ?? ""]));
  const nameById = new Map(
    authUsers.map((u) => [u.id, [u.user_metadata?.first_name, u.user_metadata?.last_name].filter(Boolean).join(" ")])
  );
  // Invités (parcours « Jouer » sans compte) : pas encore des joueurs, comptés à part.
  const guestIds = new Set(authUsers.filter((u) => u.is_anonymous).map((u) => u.id));
  const playerProfiles = (profiles ?? []).filter((p) => !guestIds.has(p.id));

  const q = (searchParams.q ?? "").trim().toLowerCase();
  const players: PlayerRow[] = playerProfiles
    .map((p) => ({
      id: p.id,
      pseudo: p.pseudo,
      email: emailById.get(p.id) ?? "",
      fullName: nameById.get(p.id) ?? "",
      isAdmin: p.is_admin,
      createdAt: p.created_at,
    }))
    .filter(
      (p) => !q || p.pseudo.toLowerCase().includes(q) || p.email.toLowerCase().includes(q) || p.fullName.toLowerCase().includes(q)
    )
    // Admins d'abord, puis ordre alphabétique des pseudos.
    .sort((a, b) => Number(b.isAdmin) - Number(a.isAdmin) || a.pseudo.localeCompare(b.pseudo, "fr"));

  const adminCount = playerProfiles.filter((p) => p.is_admin).length;
  // Invités « e-mail seulement » (0060) : compte créé mais inscription pas terminée (absents des classements).
  const pendingIds = new Set(playerProfiles.filter((p) => p.signup_pending === true).map((p) => p.id as string));
  const pendingCount = pendingIds.size;
  const registeredCount = playerProfiles.length - pendingCount;

  // Statistiques : pronostiqueurs par étape fermée (départ passé) de la saison active.
  const { now } = await getClock();
  const { data: season } = await admin.from("seasons").select("id").eq("status", "active").maybeSingle();
  const { data: courses } = season
    ? await admin
        .from("stages")
        .select("id, name, location, counts_in_standings, races(id, format, sex, stage_number, locks_at)")
        .eq("season_id", season.id)
    : { data: [] as any[] };
  const closedRaces: RetentionRace[] = (courses ?? []).flatMap((course: any) =>
    (course.races ?? [])
      .filter((race: any) => new Date(race.locks_at) <= now)
      .map((race: any) => ({
        id: race.id,
        label: raceLabel(race),
        stageId: course.id,
        stageLocation: course.name ?? course.location ?? "",
        locksAt: race.locks_at,
        offStandings: course.counts_in_standings === false,
      }))
  );
  const raceIds = closedRaces.map((r) => r.id);
  const predictions = raceIds.length
    ? await fetchAll<{ user_id: string; race_id: string }>((from, to) =>
        admin.from("predictions").select("id, user_id, race_id").in("race_id", raceIds).order("id").range(from, to)
      )
    : [];
  // Invités anonymes exclus du graphique ; les invités « e-mail seulement » y comptent (ils ont pronostiqué).
  const retention = buildRetention(closedRaces, predictions, guestIds);
  const signIns = {
    day: countRecentSignIns(authUsers, now, 1),
    week: countRecentSignIns(authUsers, now, 7),
    month: countRecentSignIns(authUsers, now, 30),
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold">Joueurs & rôles</h1>
        <p className="text-sm text-text-dim">
          {registeredCount} joueurs inscrits (comptés au classement), dont {adminCount} admin
          {adminCount > 1 ? "s" : ""}
          {pendingCount > 0 &&
            `, + ${pendingCount} invité${pendingCount > 1 ? "s" : ""} « e-mail seulement » en attente d'inscription (dans la liste ci-dessous, hors classement)`}
          . Un admin a accès à tout le back-office.
        </p>
      </div>

      <RetentionStats retention={retention} signIns={signIns} totalPlayers={registeredCount} />

      <form action={purgeGuests} className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3 text-xs text-text-dim">
        <span className="flex-1">
          + {guestIds.size} invité{guestIds.size > 1 ? "s" : ""} anonyme{guestIds.size > 1 ? "s" : ""} en cours (bouton « Jouer » sans compte), non
          compté{guestIds.size > 1 ? "s" : ""} ci-dessus ni dans la liste. Ceux qui n&apos;ont
          pas créé leur compte au bout de 7 jours sont supprimés chaque nuit si pg_cron est activé, sinon avec ce bouton.
        </span>
        <button type="submit" className="rounded border border-border px-3 py-1 font-semibold text-frost">
          Purger les invités de plus de 7 jours
        </button>
      </form>

      <form className="flex gap-2">
        <input
          name="q"
          defaultValue={searchParams.q ?? ""}
          placeholder="Rechercher un pseudo ou un email"
          className="min-w-0 flex-1 rounded border border-border bg-bg px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded border border-border px-4 py-2 text-sm font-semibold">
          Rechercher
        </button>
      </form>

      <PlayerList players={players} meId={me?.id ?? null} />
    </div>
  );
}
