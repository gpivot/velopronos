import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Lien de l'e-mail « Ton score est prêt » d'un invité (migration 0045) : connecte le joueur avec le
 * jeton du lien, puis l'amène sur la page de la course (`next`). Déjà connecté sur ce navigateur :
 * on y va directement. Lien expiré : écran de connexion, où il peut saisir son code ou en
 * demander un nouveau.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = (searchParams.get("type") ?? "magiclink") as EmailOtpType;
  const rawNext = searchParams.get("next") ?? "/";
  // Seulement un chemin du site (pas de redirection vers un autre domaine).
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  const supabase = createClient();
  if (tokenHash) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user && !user.is_anonymous) return NextResponse.redirect(`${origin}${next}`);
  const locale = next.split("/")[1] || "fr";
  return NextResponse.redirect(`${origin}/${locale}/sign-in?code=1`);
}
