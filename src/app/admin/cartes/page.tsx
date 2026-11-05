import { createAdminClient } from "@/lib/supabase/server";
import { CLAIMABLE_CARD_TYPES, type CardSetting } from "@/lib/bonusCards";
import { toParisWallTime } from "@/lib/displayTimeZone";
import { saveCardSetting } from "./actions";

export const dynamic = "force-dynamic";

const CARD_LABELS: Record<string, { name: string; hint: string }> = {
  fondue: { name: "Grillade", hint: "Dégrille une fois ses coureurs, sur la course de son choix." },
  ca_farte: { name: "Ça farte", hint: "×3 sur un biathlète, sur la course de son choix." },
  balle_de_pioche: { name: "Balle de pioche", hint: "4 biathlètes sur les 4 prochaines courses, les 3 meilleurs comptent." },
  aspiration: { name: "Aspiration", hint: "Chaque biathlète compte une place plus haut. Débloquée d'office à la 4e étape." },
  equipe: { name: "Équipe", hint: "La cote de chaque biathlète de l'équipe favorite dans le Top 10. Débloquée d'office après les Mondiaux/JO." },
  fusee: { name: "Fusée", hint: "Sur une étape : +100 / +50 / +20 pour les 1er / 2e / 3e temps de ski." },
  gachette: { name: "Gâchette", hint: "Sur une étape : +100 par 20/20, +50 par 10/10 au sprint." },
  talent: { name: "Talent", hint: "Après une pépite révélée : la réactiver ou en choisir une nouvelle." },
};

/** Jour (heure de Paris) d'un instant enregistré, pour un input date. */
function toDay(value: string | null): string {
  return value ? toParisWallTime(new Date(value)).slice(0, 10) : "";
}

export default async function AdminCardsPage() {
  const admin = createAdminClient();
  const { data: season } = await admin.from("seasons").select("id, label").eq("status", "active").maybeSingle();
  const { data: settings } = season
    ? await admin
        .from("bonus_card_settings")
        .select("card_type, enabled, available_from, available_until, force_unlock")
        .eq("season_id", season.id)
    : { data: [] };
  const byType = new Map(((settings ?? []) as CardSetting[]).map((s) => [s.card_type, s]));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">Cartes bonus</h1>

      <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 text-sm leading-relaxed text-text-dim">
        <p>
          Choisis les cartes proposées au 10/10 et la période où elles le sont. Une carte <strong className="text-frost">désactivée</strong>{" "}
          n&apos;apparaît plus dans le choix ; <strong className="text-frost">hors de sa période</strong>, elle est grisée. Les cartes déjà
          prises par les joueurs restent jouables.
        </p>
        <p>
          Dates vides = pas de limite. « Débloquer tout de suite » ignore l&apos;attente automatique d&apos;Aspiration (4e étape) et
          d&apos;Équipe (après les Mondiaux/JO). Aucune carte ne se joue sur les courses des Mondiaux/JO.
        </p>
      </div>

      {!season ? (
        <p className="text-sm text-text-dim">Aucune saison active.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {CLAIMABLE_CARD_TYPES.map((type) => {
            const setting = byType.get(type);
            const label = CARD_LABELS[type];
            return (
              <form
                key={type}
                action={saveCardSetting}
                className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-sm sm:flex-row sm:flex-wrap sm:items-end"
              >
                <input type="hidden" name="season_id" value={season.id} />
                <input type="hidden" name="card_type" value={type} />
                <div className="flex min-w-[14rem] flex-1 flex-col gap-1">
                  <div className="font-semibold">🃏 {label.name}</div>
                  <div className="text-xs text-text-dim">{label.hint}</div>
                </div>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="enabled" defaultChecked={setting?.enabled ?? true} />
                  Active
                </label>
                <label className="flex flex-col gap-1 text-xs text-text-dim">
                  À partir du
                  <input
                    type="date"
                    name="available_from"
                    defaultValue={toDay(setting?.available_from ?? null)}
                    className="rounded border border-border bg-bg px-2 py-1 text-sm text-text"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-text-dim">
                  Jusqu&apos;au
                  <input
                    type="date"
                    name="available_until"
                    defaultValue={toDay(setting?.available_until ?? null)}
                    className="rounded border border-border bg-bg px-2 py-1 text-sm text-text"
                  />
                </label>
                {((type as string) === "aspiration" || (type as string) === "equipe") && (
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="force_unlock" defaultChecked={setting?.force_unlock ?? false} />
                    Débloquer tout de suite
                  </label>
                )}
                <button type="submit" className="rounded-lg bg-ice px-3 py-1.5 font-semibold text-on-ice">
                  Enregistrer
                </button>
              </form>
            );
          })}
        </div>
      )}
    </div>
  );
}
