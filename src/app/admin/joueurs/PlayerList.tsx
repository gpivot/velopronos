import { setAdminRole } from "./actions";

export interface PlayerRow {
  id: string;
  pseudo: string;
  email: string;
  /** Prénom et nom saisis à la création du compte (parcours d'invité), privés. */
  fullName: string;
  isAdmin: boolean;
  createdAt: string;
}

const signupDate = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function PlayerList({ players, meId }: { players: PlayerRow[]; meId: string | null }) {
  return (
    <div className="flex flex-col gap-2">
      {players.map((p) => {
        const isMe = p.id === meId;
        return (
          <div
            key={p.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3"
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span className="truncate">{p.pseudo}</span>
                {p.isAdmin && (
                  <span className="rounded-full bg-gold-soft px-2 py-0.5 text-[10px] font-bold uppercase text-gold">
                    Admin
                  </span>
                )}
                {isMe && <span className="text-[11px] font-normal text-text-dim">(toi)</span>}
              </div>
              <div className="truncate text-xs text-text-dim">
                {p.fullName ? `${p.fullName} · ` : ""}
                {p.email || "email inconnu"}
              </div>
              {p.createdAt && (
                <div className="text-[11px] text-text-dim">
                  Inscrit le {signupDate.format(new Date(p.createdAt))}
                </div>
              )}
            </div>
            {isMe ? null : (
              <form action={setAdminRole}>
                <input type="hidden" name="user_id" value={p.id} />
                <input type="hidden" name="is_admin" value={String(!p.isAdmin)} />
                <button
                  type="submit"
                  className={`flex-shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold ${
                    p.isAdmin ? "border border-red/60 text-red hover:bg-red/10" : "bg-ice text-on-ice"
                  }`}
                >
                  {p.isAdmin ? "Retirer admin" : "Rendre admin"}
                </button>
              </form>
            )}
          </div>
        );
      })}

      {players.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-4 text-sm text-text-dim">
          Aucun joueur ne correspond à cette recherche.
        </div>
      )}
    </div>
  );
}
