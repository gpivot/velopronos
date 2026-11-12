"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { completeGuestSignup } from "@/lib/guestActions";
import { createClient } from "@/lib/supabase/client";

export function CompleteSignupForm({ askEmail }: { askEmail: boolean }) {
  const t = useTranslations("CompleteSignup");
  const locale = useLocale();
  const [pseudo, setPseudo] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await completeGuestSignup({ pseudo, firstName, lastName, password, email: askEmail ? email : undefined, locale }).catch(() => ({ ok: false as const, error: "unknown" as const }));
    if (!result.ok) {
      setBusy(false);
      setError(t(`error_${result.error}`));
      return;
    }
    // Nouveau jeton (le compte n'est plus anonyme), puis rechargement complet : toutes les pages redeviennent celles d'un joueur inscrit.
    await createClient().auth.refreshSession().catch(() => null);
    window.location.assign(`/${locale}`);
  }

  const inputClass = "rounded-xl border border-border bg-card px-4 py-3 text-sm outline-none focus:border-ice";
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <input required minLength={2} maxLength={20} placeholder={t("pseudo")} value={pseudo} onChange={(e) => setPseudo(e.target.value)} className={inputClass} />
      <div className="flex gap-2">
        <input required placeholder={t("firstName")} value={firstName} onChange={(e) => setFirstName(e.target.value)} className={`${inputClass} min-w-0 flex-1`} />
        <input required placeholder={t("lastName")} value={lastName} onChange={(e) => setLastName(e.target.value)} className={`${inputClass} min-w-0 flex-1`} />
      </div>
      {askEmail && (
        <input required type="email" autoComplete="email" placeholder={t("email")} value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
      )}
      <input
        required
        type="password"
        autoComplete="new-password"
        minLength={8}
        maxLength={72}
        placeholder={t("password")}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className={inputClass}
      />
      <p className="text-[11px] leading-relaxed text-text-dim">
        {t("privacy")}{" "}
        <Link href="/confidentialite" className="underline">
          {t("privacyLink")}
        </Link>
      </p>
      {error && <div className="text-xs text-red">{error}</div>}
      <button type="submit" disabled={busy} className="rounded-xl bg-ice py-3 font-display text-sm font-bold text-on-ice disabled:opacity-60">
        {busy ? t("saving") : t("submit")}
      </button>
    </form>
  );
}
