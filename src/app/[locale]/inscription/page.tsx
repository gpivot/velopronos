import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LogoMark } from "@/components/icons";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { CompleteSignupForm } from "./CompleteSignupForm";

/**
 * Fin d'inscription d'un invité « e-mail seulement » (migration 0045) : il a validé un pronostic
 * avec son e-mail et reçu son score ; il choisit pseudo, prénom et nom, et garde ses points.
 */
export default async function CompleteSignupPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const {
    data: { user },
  } = await getAuthUser();
  if (!user || user.is_anonymous) redirect(`/${locale}/sign-in`);
  const { data: profile } = await createClient().from("profiles").select("signup_pending").eq("id", user.id).maybeSingle();
  if (!(profile as { signup_pending?: boolean } | null)?.signup_pending) redirect(`/${locale}`);

  const t = await getTranslations("CompleteSignup");
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <LogoMark className="h-12 w-12 text-ice" />
        <h1 className="font-display text-xl font-extrabold">{t("title")}</h1>
        <p className="text-[13px] leading-relaxed text-text-dim">{t("intro", { email: user.email ?? "" })}</p>
      </div>
      <CompleteSignupForm />
    </div>
  );
}
