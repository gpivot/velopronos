import type { SupabaseClient } from "@supabase/supabase-js";

/** Lit la revendication « is_anonymous » du jeton d'accès (JWT), celle que vérifie la base. */
export function tokenIsAnonymous(accessToken: string | undefined): boolean {
  if (!accessToken) return false;
  try {
    const payload = accessToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return Boolean(JSON.parse(atob(payload)).is_anonymous);
  } catch {
    return false;
  }
}

/**
 * Invité devenu joueur (e-mail rattaché) dont le jeton de session dit encore « anonyme » : la base
 * refuse alors ses écritures (règles RLS « no guest », migration 0031) jusqu'au renouvellement.
 */
export async function hasStaleGuestToken(supabase: SupabaseClient): Promise<boolean> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return tokenIsAnonymous(session?.access_token);
}
