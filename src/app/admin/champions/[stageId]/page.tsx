import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { nationFlagEmoji, NATION_NAMES } from "@/lib/nationFlags";
import { fullAthleteName } from "@/lib/athleteName";
import { ConfirmButton } from "../../_components/ConfirmButton";
import { formatLockTime, toDateTimeLocalParis } from "../../_components/labels";
import { championsRanking, loadChampionships, scaleOf } from "@/lib/velo/championsScoring";
import {
  addChampionRider,
  addChampionship,
  closeChampions,
  removeChampionship,
  reopenChampions,
  saveChampionsScale,
  setChampion,
  setGlobalLock,
  updateChampionship,
} from "./actions";

export const dynamic = "force-dynamic";

const inputClass = "rounded border border-border bg-bg px-2 py-1.5 text-sm";
const buttonClass = "rounded bg-ice px-3 py-1.5 text-sm font-bold text-on-ice";

/** WE des Champions (migration 0056) : championnats, vainqueurs, barème, clôture. */
export default async function AdminChampionsPage({ params }: { params: Promise<{ stageId: string }> }) {
  const { stageId } = await params;
  const admin = createAdminClient();
  const { data: stage } = await admin.from("stages").select("*").eq("id", stageId).single();
  if (!stage) notFound();

  const championships = await loadChampionships(admin, stageId);
  const nationCodes = championships.map((c) => c.nation_code);
  const [{ data: athletes }, { data: predictionRows }, ranking, { data: profiles }] = await Promise.all([
    nationCodes.length
      ? admin.from("athletes").select("id, first_name, last_name, nation_code").eq("season_id", stage.season_id).in("nation_code", nationCodes)
      : Promise.resolve({ data: [] as any[] }),
    championships.length
      ? admin.from("champion_predictions").select("championship_id").in("championship_id", championships.map((c) => c.id))
      : Promise.resolve({ data: [] as any[] }),
    championsRanking(admin, stageId, scaleOf(stage)),
    admin.from("profiles").select("id, pseudo"),
  ]);
  const pseudoById = new Map((profiles ?? []).map((p: any) => [p.id as string, p.pseudo as string]));
  const ridersByNation = new Map<string, { id: string; name: string }[]>();
  for (const a of (athletes ?? []) as any[]) {
    if (!ridersByNation.has(a.nation_code)) ridersByNation.set(a.nation_code, []);
    ridersByNation.get(a.nation_code)!.push({ id: a.id, name: fullAthleteName(a) });
  }
  for (const list of ridersByNation.values()) list.sort((x, y) => x.name.localeCompare(y.name, "fr"));
  const predictionCount = new Map<string, number>();
  for (const p of (predictionRows ?? []) as any[]) predictionCount.set(p.championship_id, (predictionCount.get(p.championship_id) ?? 0) + 1);
  const closed = !!stage.champions_closed_at;
  const scale = scaleOf(stage);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href="/admin" className="text-xs text-text-dim">
          ← Calendrier & résultats
        </Link>
        <h1 className="text-2xl font-bold">🏆 {stage.name ?? stage.location}</h1>
        <p className="text-sm text-text-dim">
          WE des Champions : 1 coureur par championnat, pas de cote, score selon le nombre de champions trouvés.{" "}
          {closed ? `Clôturé le ${formatLockTime(stage.champions_closed_at)} : scores injectés dans le classement Saison.` : "Pas encore clôturé."}{" "}
          <Link href={`/champions/${stageId}`} className="text-ice underline">
            Voir la page joueur
          </Link>
        </p>
      </div>

      <section className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Championnats ({championships.length})</h2>
        {championships.length === 0 && <p className="text-xs text-text-dim">Ajoute les championnats nationaux ci-dessous (10 par défaut).</p>}
        {championships.map((c) => {
          const riders = ridersByNation.get(c.nation_code) ?? [];
          return (
            <div key={c.id} className="flex flex-col gap-2 rounded-lg border border-border bg-bg p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold">
                  {nationFlagEmoji(c.nation_code)} {NATION_NAMES[c.nation_code] ?? c.nation_code}
                  <span className="ml-2 text-xs font-normal text-text-dim">{predictionCount.get(c.id) ?? 0} pronostic(s)</span>
                </div>
                <form action={removeChampionship}>
                  <input type="hidden" name="championship_id" value={c.id} />
                  <ConfirmButton
                    message={`Retirer le championnat ${c.nation_code} ? Ses pronostics seront effacés.`}
                    className="rounded border border-red/40 px-2 py-1 text-xs text-red"
                  >
                    Retirer
                  </ConfirmButton>
                </form>
              </div>
              <form action={updateChampionship} className="flex flex-wrap items-center gap-2 text-xs text-text-dim">
                <input type="hidden" name="championship_id" value={c.id} />
                Départ
                <input name="starts_at" type="datetime-local" required defaultValue={toDateTimeLocalParis(c.starts_at)} className={inputClass} />
                Limite de pronostic
                <input name="locks_at" type="datetime-local" required defaultValue={toDateTimeLocalParis(c.locks_at)} className={inputClass} />
                <button type="submit" className="rounded border border-border px-2 py-1 text-xs">
                  Enregistrer
                </button>
              </form>
              <form action={setChampion} className="flex flex-wrap items-center gap-2 text-xs text-text-dim">
                <input type="hidden" name="championship_id" value={c.id} />
                Champion
                <select name="winner_athlete_id" defaultValue={c.winner_athlete_id ?? ""} className={inputClass}>
                  <option value="">— pas encore connu —</option>
                  {riders.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <button type="submit" className={buttonClass}>
                  Enregistrer le résultat
                </button>
              </form>
              <details className="text-xs text-text-dim">
                <summary className="cursor-pointer">
                  {riders.length} coureur(s) {c.nation_code} dans la saison · ajouter un coureur
                </summary>
                <form action={addChampionRider} className="mt-2 flex flex-wrap gap-2">
                  <input type="hidden" name="season_id" value={stage.season_id} />
                  <input type="hidden" name="nation_code" value={c.nation_code} />
                  <input name="first_name" placeholder="Prénom" className={inputClass} />
                  <input name="last_name" required placeholder="Nom" className={inputClass} />
                  <button type="submit" className="rounded border border-border px-2 py-1 text-xs">
                    Ajouter
                  </button>
                </form>
              </details>
            </div>
          );
        })}

        <form action={addChampionship} className="flex flex-wrap items-center gap-2 border-t border-border pt-3 text-xs text-text-dim">
          <input type="hidden" name="stage_id" value={stageId} />
          <input name="nation_code" required placeholder="Pays (FRA)" className={`${inputClass} w-24`} />
          Départ
          <input name="starts_at" type="datetime-local" required className={inputClass} />
          Limite (vide = départ)
          <input name="locks_at" type="datetime-local" className={inputClass} />
          <button type="submit" className={buttonClass}>
            Ajouter le championnat
          </button>
        </form>

        {championships.length > 1 && (
          <form action={setGlobalLock} className="flex flex-wrap items-center gap-2 text-xs text-text-dim">
            <input type="hidden" name="stage_id" value={stageId} />
            Même limite pour tous
            <input name="locks_at" type="datetime-local" required className={inputClass} />
            <button type="submit" className="rounded border border-border px-2 py-1 text-xs">
              Appliquer
            </button>
          </form>
        )}
        <p className="text-xs text-text-dim">Heures en heure de Paris. Coureurs proposés : ceux de la saison qui ont la nationalité du championnat.</p>
      </section>

      <section className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Barème (points selon le nombre de champions trouvés)</h2>
        <form action={saveChampionsScale} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="stage_id" value={stageId} />
          <input name="scale" defaultValue={scale.join(", ")} className={`${inputClass} w-full max-w-xl`} />
          <button type="submit" className={buttonClass}>
            Enregistrer le barème
          </button>
        </form>
        <p className="text-xs text-text-dim">1er nombre = 0 champion trouvé, puis 1, 2… Au-delà du dernier palier, le dernier s&apos;applique.</p>
      </section>

      <section className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Clôture</h2>
        {closed ? (
          <form action={reopenChampions}>
            <input type="hidden" name="stage_id" value={stageId} />
            <ConfirmButton message="Rouvrir le WE des Champions ? Les scores sont retirés du classement Saison jusqu'à la prochaine clôture." className="rounded border border-border px-3 py-1.5 text-sm">
              Rouvrir (correction d&apos;un résultat)
            </ConfirmButton>
          </form>
        ) : (
          <form action={closeChampions}>
            <input type="hidden" name="stage_id" value={stageId} />
            <ConfirmButton message="Clôturer le WE des Champions ? Les scores sont figés et ajoutés au classement Saison." className={buttonClass}>
              Clôturer le WE des Champions
            </ConfirmButton>
          </form>
        )}
        <p className="text-xs text-text-dim">Vérifie que tous les champions sont renseignés, fige les scores et les ajoute au classement Saison.</p>
      </section>

      <section className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Classement {closed ? "final" : "provisoire"} ({ranking.length} joueur(s))</h2>
        {ranking.slice(0, 50).map((row) => (
          <div key={row.userId} className="flex justify-between text-sm">
            <span>
              {row.rank}. {pseudoById.get(row.userId) ?? "?"}
            </span>
            <span className="text-text-dim">
              {row.correct}/{championships.length} · {row.score} pts
            </span>
          </div>
        ))}
      </section>
    </div>
  );
}
