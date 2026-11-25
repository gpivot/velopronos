"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

/** Code privé de l'e-mail « Ton score est prêt » : connecte l'invité et ouvre la page de la course. */
export function GuestCodeForm({ email, raceId }: { email: string; raceId: string }) {
  const t = useTranslations("GuestWaiting");
  const locale = useLocale();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: verifyError } = await createClient().auth.verifyOtp({ email, token: code.trim(), type: "email" });
    if (verifyError) {
      setBusy(false);
      setError(t("codeWrong"));
      return;
    }
    window.location.assign(`/${locale}/courses/${raceId}`);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2.5">
      <input
        required
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6,8}"
        maxLength={8}
        placeholder="123456"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        className="rounded-xl border border-border bg-bg px-4 py-3 text-center font-display text-xl tracking-[0.4em] outline-none focus:border-gold"
      />
      {error && <div className="text-xs text-red">{error}</div>}
      <button type="submit" disabled={busy} className="rounded-xl bg-gold py-3 font-display text-sm font-bold text-on-gold disabled:opacity-60">
        {busy ? t("verifying") : t("codeSubmit")}
      </button>
    </form>
  );
}
