import { cache } from "react";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { UserIcon } from "@/components/icons";
import { createClient, getAuthUser } from "@/lib/supabase/server";

/** Picto de profil du joueur connecté (migration 0038), une seule lecture par requête. */
const getMyAvatar = cache(async (): Promise<string | null> => {
  const {
    data: { user },
  } = await getAuthUser();
  if (!user || user.is_anonymous) return null;
  const { data } = await createClient().from("profiles").select("avatar").eq("id", user.id).maybeSingle();
  return (data as { avatar?: string | null } | null)?.avatar ?? null;
});

// Boutons ronds en haut à droite des onglets (Accueil, Calendrier, Classement, Ma saison, Ligues) :
// choix de la langue et accès au profil, comme sur VéloPronos. Le rond du profil montre le picto
// choisi par le joueur, sinon la silhouette.
export async function HeaderActions() {
  // Colonne absente tant que la migration 0038 n'est pas passée : on garde la silhouette.
  const avatar = await getMyAvatar().catch(() => null);
  return (
    <div className="ml-auto flex flex-shrink-0 items-center gap-2">
      <LocaleSwitcher />
      <Link
        href="/compte"
        data-guest-lock
        className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-text-dim"
      >
        {avatar ? <span className="text-[20px] leading-none">{avatar}</span> : <UserIcon className="h-4.5 w-4.5" />}
      </Link>
    </div>
  );
}
