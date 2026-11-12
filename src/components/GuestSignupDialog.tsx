"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { CloseIcon } from "@/components/icons";
import { registerGuestEmail } from "@/lib/guestActions";

/**
 * Parcours d'invité « e-mail seulement » (10/11/2026) : pour valider son pronostic, l'invité ne
 * donne que son e-mail. Son score et son code privé lui arrivent par e-mail après la course ; il
 * crée son compte ensuite (page /inscription). `onDone` : l'adresse est rattachée, le formulaire
 * enregistre le pronostic.
 */
export function GuestEmailDialog({ onDone, onClose }: { onDone: (email: string) => void; onClose: () => void }) {
  const t = useTranslations("Guest");
  const locale = useLocale();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailTaken, setEmailTaken] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setEmailTaken(false);

    // Visiteur arrivé directement sur une course : la session invitée est créée maintenant.
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      const { error: anonError } = await supabase.auth.signInAnonymously();
      if (anonError) {
        setBusy(false);
        setError(t("guestUnavailable"));
        return;
      }
    }

    const result = await registerGuestEmail(email.trim(), locale).catch(() => ({ ok: false as const, error: "unknown" as const }));
    if (!result.ok) {
      setBusy(false);
      setEmailTaken(result.error === "emailTaken");
      setError(t(result.error === "emailTaken" ? "emailTaken" : result.error === "invalidEmail" ? "invalidEmail" : "saveFailed"));
      return;
    }
    // Nouveau jeton sans « is_anonymous », sinon la base refuse encore le pronostic.
    await supabase.auth.refreshSession();
    setBusy(false);
    onDone(email.trim());
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={t("emailTitle")} className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4">
      <div className="flex max-h-[90dvh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-t-2xl border border-border bg-bg p-5 sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="font-display text-base font-bold">{t("emailTitle")}</div>
            <div className="text-[13px] leading-relaxed text-text-dim">{t("emailIntro")}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-border text-text-dim"
          >
            <CloseIcon className="h-3.5 w-3.5" />
          </button>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            required
            type="email"
            autoComplete="email"
            placeholder={t("email")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-xl border border-border bg-card px-4 py-3 text-sm outline-none focus:border-ice"
          />
          <p className="text-[11px] leading-relaxed text-text-dim">
            {t("emailPrivacy")}{" "}
            <Link href="/confidentialite" className="underline">
              {t("privacyLink")}
            </Link>
          </p>
          {error && (
            <div className="text-xs text-red">
              {error}{" "}
              {emailTaken && (
                <Link href="/sign-in" className="font-semibold underline">
                  {t("signInLink")}
                </Link>
              )}
            </div>
          )}
          <button type="submit" disabled={busy} className="rounded-xl bg-ice py-3 font-display text-sm font-bold text-on-ice disabled:opacity-60">
            {busy ? t("sending") : t("emailSubmit")}
          </button>
        </form>
      </div>
    </div>
  );
}

/** Juste après le pronostic validé par e-mail : rendez-vous après la course. */
export function GuestWelcome({ email }: { email: string }) {
  const t = useTranslations("Guest");
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-gold/40 bg-gold-soft p-4">
      <div className="font-display text-sm font-bold text-gold">🎉 {t("welcomeTitle")}</div>
      <p className="text-[13px] leading-relaxed text-frost">{t("welcomeEmailBody", { email })}</p>
    </div>
  );
}
