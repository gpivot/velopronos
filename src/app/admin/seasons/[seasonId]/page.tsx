import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { updateSeason } from "../../calendrier/actions";
import { SeasonImports } from "../../velo/VeloImports";

export const dynamic = "force-dynamic";

const inputClass = "rounded border border-border bg-bg px-2 py-1.5 text-sm";

/** Modification d'une saison : nom, dates, et imports de la saison (calendrier, coureurs). */
export default async function AdminSeasonPage({ params }: { params: Promise<{ seasonId: string }> }) {
  const { seasonId } = await params;
  const { data: season } = await createAdminClient().from("seasons").select("*").eq("id", seasonId).maybeSingle();
  if (!season) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href="/admin" className="text-xs text-text-dim">
          ← Calendrier & résultats
        </Link>
        <h1 className="text-2xl font-bold">
          Saison {season.label}
          {season.status === "active" && <span className="ml-2 rounded-full bg-ice-soft px-3 py-1 align-middle text-xs font-semibold text-ice">active</span>}
        </h1>
      </div>

      <form action={updateSeason} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-4">
        <input type="hidden" name="season_id" value={season.id} />
        <input name="label" required defaultValue={season.label} className={inputClass} />
        <input name="starts_on" type="date" required defaultValue={season.starts_on} className={inputClass} />
        <input name="ends_on" type="date" required defaultValue={season.ends_on} className={inputClass} />
        <button type="submit" className="rounded bg-ice px-4 py-1.5 text-sm font-bold text-on-ice">
          Enregistrer
        </button>
      </form>

      <SeasonImports seasonId={season.id} />
    </div>
  );
}
