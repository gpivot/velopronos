import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LogoMark } from "@/components/icons";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { CompleteSignupForm } from "./CompleteSignupForm";

/**
 * Création du compte d'un invité (bouton « Je joue ») : pseudo, prénom, nom, mot de passe (et
 * e-mail s'il ne l'a pas encore donné). Il garde son identifiant, donc ses pronostics et ses points.
 */
export default async function CompleteSignupPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const {
    data: { user },
  } = await getAuthUser();
  if (!user) redirect(`/${locale}/sign-in`);
  // Invité anonyme (pas encore d'e-mail) : il le donne ici. Invité « e-mail seulement » : déjà connu.
  const anonymous = Boolean(user.is_anonymous);
  if (!anonymous) {
    const { data: profile } = await createClient().from("profiles").select("signup_pending").eq("id", user.id).maybeSingle();
    if (!(profile as { signup_pending?: boolean } | null)?.signup_pending) redirect(`/${locale}`);
  }

  const t = await getTranslations("CompleteSignup");
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <LogoMark className="h-12 w-12 text-ice" />
        <h1 className="font-display text-xl font-extrabold">{t("title")}</h1>
        <p className="text-[13px] leading-relaxed text-text-dim">
          {anonymous ? t("introNew") : t("intro", { email: user.email ?? "" })}
        </p>
      </div>
      <CompleteSignupForm askEmail={anonymous} />
    </div>
  );
}
