import type { RetentionSummary } from "@/lib/admin/retention";

const CHART_HEIGHT = 140;

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
}

/**
 * Encart de l'admin « Joueurs & rôles » : connexions récentes et graphique du nombre de pronostiqueurs
 * par course (courses dont les pronos sont fermés). Barres en HTML pour suivre le thème clair/sombre ;
 * le détail de chaque barre est au survol et dans le tableau dépliable.
 */
export function RetentionStats({
  retention,
  signIns,
  totalPlayers,
}: {
  retention: RetentionSummary;
  signIns: { day: number; week: number; month: number };
  totalPlayers: number;
}) {
  const { points, peak, distinctPlayers } = retention;
  const last = points[points.length - 1];
  const peakIndex = points.findIndex((p) => p.players === peak);
  const scale = Math.max(peak, 1);
  const hasOffStandings = points.some((p) => p.offStandings);

  // Regroupe les étapes par course (VéloPronos) pour écrire son nom sous ses barres.
  const groups: { stageId: string; location: string; items: { point: (typeof points)[number]; index: number }[] }[] = [];
  points.forEach((point, index) => {
    const group = groups[groups.length - 1];
    if (group && group.stageId === point.stageId) group.items.push({ point, index });
    else groups.push({ stageId: point.stageId, location: point.stageLocation, items: [{ point, index }] });
  });

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-bold">Connexions</h2>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "sur 24 h", value: signIns.day },
            { label: "sur 7 jours", value: signIns.week },
            { label: "sur 30 jours", value: signIns.month },
          ].map((tile) => (
            <div key={tile.label} className="rounded-md bg-card px-3 py-2">
              <div className="text-xl font-bold">{tile.value}</div>
              <div className="text-xs text-text-dim">{tile.label}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-text-dim">
          Joueurs qui se sont identifiés (e-mail et mot de passe, lien magique…) sur la période, sur {totalPlayers}{" "}
          inscrits (invités non comptés). Un joueur resté connecté sur son téléphone n&apos;est compté qu&apos;au moment où il s&apos;est
          identifié : ce n&apos;est pas un nombre de visites.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-bold">Pronostiqueurs par étape</h2>
        {points.length === 0 ? (
          <p className="text-xs text-text-dim">
            Aucune étape fermée pour l&apos;instant : le graphique se remplira au départ de la première course de la saison.
          </p>
        ) : (
          <>
            <p className="text-xs text-text-dim">
              Dernière étape : <strong className="text-text">{last.players}</strong> pronostiqueurs ({last.label},{" "}
              {last.stageLocation}). Record : <strong className="text-text">{peak}</strong>. {distinctPlayers} joueurs
              différents ont pronostiqué au moins une étape cette saison. Invités anonymes (bouton « Jouer ») non
              comptés.
            </p>
            <div className="overflow-x-auto pb-1">
              <div className="flex min-w-full items-end gap-3" style={{ minWidth: points.length * 16 + groups.length * 12 }}>
                {groups.map((group) => (
                  <div key={group.stageId + group.items[0].index} className="flex min-w-0 flex-col gap-1" style={{ flex: `${group.items.length} 1 0` }}>
                    <div className="flex items-end gap-0.5 border-b border-border" style={{ height: CHART_HEIGHT + 16 }}>
                      {group.items.map(({ point, index }) => {
                        const showValue = index === points.length - 1 || index === peakIndex;
                        return (
                          <div
                            key={point.id}
                            className="group relative flex min-w-[10px] flex-1 flex-col items-center justify-end"
                            style={{ height: CHART_HEIGHT + 16 }}
                            title={`${point.label} · ${point.stageLocation} · ${shortDate(point.locksAt)} : ${point.players} pronostiqueur${point.players > 1 ? "s" : ""}${point.offStandings ? " (hors classement)" : ""}`}
                          >
                            {showValue && <span className="mb-0.5 text-[10px] font-semibold text-text">{point.players}</span>}
                            <div
                              className={`w-full max-w-[28px] rounded-t group-hover:opacity-80 ${point.offStandings ? "bg-ice/40" : "bg-ice"}`}
                              style={{ height: Math.max((point.players / scale) * CHART_HEIGHT, point.players > 0 ? 3 : 1) }}
                            />
                          </div>
                        );
                      })}
                    </div>
                    <span className="truncate text-center text-[10px] text-text-dim" title={group.location}>
                      {group.location}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            {hasOffStandings && (
              <p className="flex items-center gap-1.5 text-[11px] text-text-dim">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-ice/40" /> Course hors classement (×0)
              </p>
            )}
            <details className="text-xs">
              <summary className="cursor-pointer text-text-dim">Voir le détail étape par étape</summary>
              <table className="mt-2 w-full text-left">
                <thead className="text-text-dim">
                  <tr>
                    <th className="py-1 font-normal">Date</th>
                    <th className="py-1 font-normal">Étape</th>
                    <th className="py-1 text-right font-normal">Pronostiqueurs</th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((p) => (
                    <tr key={p.id} className="border-t border-border">
                      <td className="py-1 pr-2 text-text-dim">{shortDate(p.locksAt)}</td>
                      <td className="py-1 pr-2">
                        {p.label} · {p.stageLocation}
                        {p.offStandings ? " (hors classement)" : ""}
                      </td>
                      <td className="py-1 text-right font-semibold">{p.players}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </>
        )}
      </div>
    </section>
  );
}
